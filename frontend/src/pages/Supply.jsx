import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Eye, EyeOff, PackagePlus } from 'lucide-react'
import { api } from '../api/client.js'
import { StatusBadge } from '../components/StatusBadge.jsx'

export function Supply({
  ingredients,
  suppliers,
  purchaseOrders,
  replenishmentRecommendations,
  refresh,
  showAllReplenishment,
  onToggleShowAllReplenishment,
}) {
  const [form, setForm] = useState({
    supplier_id: '',
    ingredient_id: '',
    qty: '',
    unit_price: '',
    expected_arrival: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    remark: '',
  })

  const selectedIngredient = useMemo(
    () => ingredients.find((item) => item.id === form.ingredient_id),
    [ingredients, form.ingredient_id],
  )

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  const submit = async (event) => {
    event.preventDefault()
    await api.createPurchaseOrder({
      supplier_id: form.supplier_id,
      expected_arrival: form.expected_arrival,
      remark: form.remark,
      items: [{
        ingredient_id: form.ingredient_id,
        qty: Number(form.qty),
        unit_price: Number(form.unit_price),
      }],
    })
    setForm((current) => ({ ...current, ingredient_id: '', qty: '', unit_price: '', remark: '' }))
    refresh()
  }

  const receive = async (order) => {
    await api.updatePurchaseStatus(order.id, 'received')
    refresh()
  }

  const quickFill = (rec) => {
    setForm((current) => ({
      ...current,
      ingredient_id: rec.ingredient_id,
      qty: String(rec.recommend_qty),
      unit_price: String(ingredients.find((i) => i.id === rec.ingredient_id)?.avg_price || ''),
    }))
  }

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="section-title">
          <h2>
            <AlertTriangle size={18} />
            补货推荐
          </h2>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span>
              {showAllReplenishment
                ? `共 ${replenishmentRecommendations.length} 项`
                : `${replenishmentRecommendations.length} 项需关注`}
            </span>
            <button
              type="button"
              onClick={() => onToggleShowAllReplenishment(!showAllReplenishment)}
              className="icon-only"
              title={showAllReplenishment ? '只看需关注' : '显示全部'}
            >
              {showAllReplenishment ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>原料</th>
                <th>分类</th>
                <th>当前库存</th>
                <th>在途数量</th>
                <th>日均消耗</th>
                <th>可覆盖天数</th>
                <th>安全库存</th>
                <th>推荐数量</th>
                <th>预估金额</th>
                <th>预警等级</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {replenishmentRecommendations.map((rec) => (
                <tr key={rec.ingredient_id} className={`recommend-row ${rec.warning_level}`}>
                  <td><strong>{rec.ingredient_name}</strong></td>
                  <td>{rec.category}</td>
                  <td>{rec.stock_qty}{rec.unit}</td>
                  <td>{rec.in_transit_qty}{rec.unit}</td>
                  <td>{rec.daily_consumption}{rec.unit}</td>
                  <td>{rec.coverage_days}天</td>
                  <td>{rec.safety_stock}{rec.unit}</td>
                  <td>
                    <b>{rec.recommend_qty > 0 ? rec.recommend_qty : '—'}</b>
                    {rec.recommend_qty > 0 && <small>{rec.unit}</small>}
                  </td>
                  <td>{rec.recommend_qty > 0 ? `¥${rec.estimated_cost}` : '—'}</td>
                  <td><StatusBadge value={rec.warning_level} /></td>
                  <td>
                    {rec.recommend_qty > 0 && (
                      <button type="button" onClick={() => quickFill(rec)}>
                        <PackagePlus size={14} />
                        填入
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="section-title">
          <h2>原料库存</h2>
          <span>{ingredients.length} 项</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>原料</th>
                <th>分类</th>
                <th>库存</th>
                <th>安全库存</th>
                <th>日均消耗</th>
                <th>均价</th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map((item) => (
                <tr key={item.id} className={item.stock_qty <= item.safety_stock ? 'warning-row' : ''}>
                  <td><strong>{item.name}</strong></td>
                  <td>{item.category}</td>
                  <td>{item.stock_qty}{item.unit}</td>
                  <td>{item.safety_stock}{item.unit}</td>
                  <td>{item.daily_consumption}{item.unit}</td>
                  <td>¥{item.avg_price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="two-column compact">
        <section className="panel">
          <div className="section-title">
            <h2>采购单</h2>
            <span>{purchaseOrders.length} 单</span>
          </div>
          <div className="list">
            {purchaseOrders.map((order) => (
              <div className="order-row" key={order.id}>
                <div>
                  <strong>{order.id}</strong>
                  <span>{suppliers.find((item) => item.id === order.supplier_id)?.name} · 到货 {order.expected_arrival}</span>
                  <small>{order.remark || '无备注'}</small>
                </div>
                <div className="order-side">
                  <b>¥{order.total_amount}</b>
                  <StatusBadge value={order.status} />
                  {order.status !== 'received' && (
                    <button type="button" onClick={() => receive(order)}>
                      <CheckCircle2 size={15} />
                      入库
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel side-panel">
          <div className="section-title">
            <h2>新建采购</h2>
            <PackagePlus size={18} />
          </div>
          <form className="form" onSubmit={submit}>
            <label>
              供应商
              <select value={form.supplier_id} onChange={(event) => updateField('supplier_id', event.target.value)} required>
                <option value="">选择供应商</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
            </label>
            <label>
              原料
              <select value={form.ingredient_id} onChange={(event) => updateField('ingredient_id', event.target.value)} required>
                <option value="">选择原料</option>
                {ingredients.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                数量{selectedIngredient ? `(${selectedIngredient.unit})` : ''}
                <input type="number" min="0" step="0.1" value={form.qty} onChange={(event) => updateField('qty', event.target.value)} required />
              </label>
              <label>
                单价
                <input type="number" min="0" step="0.1" value={form.unit_price} onChange={(event) => updateField('unit_price', event.target.value)} required />
              </label>
            </div>
            <label>
              预计到货
              <input type="date" value={form.expected_arrival} onChange={(event) => updateField('expected_arrival', event.target.value)} required />
            </label>
            <label>
              备注
              <textarea rows="3" value={form.remark} onChange={(event) => updateField('remark', event.target.value)} />
            </label>
            <button className="primary" type="submit">
              <PackagePlus size={16} />
              <span>提交采购</span>
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}

