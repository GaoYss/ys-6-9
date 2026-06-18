from fastapi import HTTPException, status

from app.data import store
from app.schemas.supply import PurchaseOrderCreate

REPLENISH_DAYS = 7
TRANSIT_STATUSES = {"draft", "ordered"}
TERMINAL_STATUSES = {"received", "cancelled"}
STATUS_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"ordered", "cancelled"},
    "ordered": {"received", "cancelled"},
    "received": set(),
    "cancelled": set(),
}


def list_ingredients() -> list[dict]:
    return list(store.ingredients.values())


def list_suppliers() -> list[dict]:
    return list(store.suppliers.values())


def list_purchase_orders() -> list[dict]:
    return list(store.purchase_orders.values())


def create_purchase_order(payload: PurchaseOrderCreate) -> dict:
    if payload.supplier_id not in store.suppliers:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found")

    total = 0.0
    for item in payload.items:
        if item.ingredient_id not in store.ingredients:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Ingredient {item.ingredient_id} not found")
        total += item.qty * item.unit_price

    order = {
        "id": store.new_id("po"),
        **payload.model_dump(),
        "status": "ordered",
        "total_amount": round(total, 2),
    }
    store.purchase_orders[order["id"]] = order
    return order


def update_purchase_status(order_id: str, status_value: str) -> dict:
    order = store.purchase_orders.get(order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found")

    previous_status = order["status"]
    if previous_status == status_value:
        return order

    if previous_status in TERMINAL_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"采购单已{previous_status}，无法修改状态",
        )
    if status_value not in STATUS_TRANSITIONS.get(previous_status, set()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不允许从 {previous_status} 变更为 {status_value}",
        )

    order["status"] = status_value
    if status_value == "received":
        for item in order["items"]:
            ingredient = store.ingredients[item["ingredient_id"]]
            old_qty = ingredient["stock_qty"]
            old_value = old_qty * ingredient["avg_price"]
            added_value = item["qty"] * item["unit_price"]
            new_qty = round(old_qty + item["qty"], 2)
            if new_qty > 0:
                ingredient["avg_price"] = round((old_value + added_value) / new_qty, 2)
            else:
                ingredient["avg_price"] = round(item["unit_price"], 2)
            ingredient["stock_qty"] = new_qty
    return order


def _calc_in_transit() -> dict[str, float]:
    in_transit: dict[str, float] = {}
    for order in store.purchase_orders.values():
        if order["status"] not in TRANSIT_STATUSES:
            continue
        for item in order["items"]:
            in_transit[item["ingredient_id"]] = in_transit.get(item["ingredient_id"], 0.0) + item["qty"]
    return in_transit


def get_replenishment_recommendations(show_all: bool = False) -> list[dict]:
    in_transit = _calc_in_transit()
    results = []

    for ing in store.ingredients.values():
        ing_id = ing["id"]
        transit_qty = in_transit.get(ing_id, 0.0)
        available = ing["stock_qty"] + transit_qty
        daily = ing["daily_consumption"]

        if daily > 0:
            coverage_days = round(available / daily, 1)
        else:
            coverage_days = 999.0

        target_stock = ing["safety_stock"] + daily * REPLENISH_DAYS
        recommend_qty = round(max(0.0, target_stock - available), 2)

        if available < ing["safety_stock"] or coverage_days < 3:
            warning_level = "critical"
        elif available < ing["safety_stock"] * 1.2 or coverage_days < 5:
            warning_level = "warning"
        else:
            warning_level = "normal"

        estimated_cost = round(recommend_qty * ing["avg_price"], 2)

        results.append({
            "ingredient_id": ing_id,
            "ingredient_name": ing["name"],
            "category": ing["category"],
            "unit": ing["unit"],
            "stock_qty": ing["stock_qty"],
            "safety_stock": ing["safety_stock"],
            "daily_consumption": daily,
            "in_transit_qty": round(transit_qty, 2),
            "coverage_days": coverage_days,
            "recommend_qty": recommend_qty,
            "warning_level": warning_level,
            "estimated_cost": estimated_cost,
        })

    results.sort(key=lambda r: ({"critical": 0, "warning": 1, "normal": 2}[r["warning_level"]], -r["recommend_qty"]))
    if not show_all:
        results = [r for r in results if r["warning_level"] != "normal"]
    return results

