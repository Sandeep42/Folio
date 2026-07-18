import { inr, pct } from '../api'

const COLS = [
  ['name','Holding'],['quantity','Qty'],['avg_cost','Avg cost'],
  ['last_price','Price / NAV'],['invested','Invested'],
  ['current_value','Value'],['pnl','P&L'],['pnl_pct','P&L %'],['xirr','XIRR'],
]

const CBT_COLORS = { zero: 'var(--turmeric)', unknown: 'var(--ink-soft)' }

export default function HoldingsTable({ holdings, onMapSymbol, onSetCostBasis, onSelect }) {
  const mapSymbol = (h) => {
    const s = window.prompt(`Yahoo Finance ticker for ${h.name}?\n(e.g. INFY.NS, TCS.BO)`)
    if (s) onMapSymbol(h.isin, s.trim().toUpperCase())
  }

  const setCostBasis = (h) => {
    const cur = h.cost_basis_type || 'normal'
    const choice = window.prompt(
      `Cost basis for ${h.name}:\n1 = Normal (bought at market)\n2 = ESOP / RSU at ₹0\n3 = Unknown (gift/inherited — exclude from P&L & XIRR)`,
      cur === 'zero' ? '2' : cur === 'unknown' ? '3' : '1'
    )
    const map = { '1': 'normal', '2': 'zero', '3': 'unknown' }
    if (map[choice]) onSetCostBasis(h.isin, map[choice])
  }

  if (!holdings.length) {
    return <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13 }}>No holdings match the current filter.</div>
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {COLS.map(([key, label]) => (
              <th key={key} className={key === 'name' ? 'name' : ''}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => {
            const cbt = h.cost_basis_type || 'normal'
            const excluded = h.xirr_excluded || cbt === 'unknown'
            return (
              <tr key={h.isin + (h.folio || '')} style={{ ...(excluded ? { opacity: 0.6 } : {}), cursor: 'pointer' }}
                  onClick={() => onSelect && onSelect(h)}>
                <td className="name">
                  <div className="hname">{h.name}</div>
                  <div className="tags">
                    <span className="tag">{h.asset_type === 'stock' ? (h.symbol || 'STOCK') : 'MF'}</span>
                    {h.folio && <span className="tag">folio {h.folio}</span>}
                    {cbt === 'zero' && <span className="tag esop">ESOP/₹0</span>}
                    {cbt === 'unknown' && <span className="tag excl">unknown cost</span>}
                    {excluded && <span className="tag excl">excl. XIRR</span>}
                  </div>
                  <div className="tags" style={{ marginTop: 4 }}>
                    {h.asset_type === 'stock' && (
                      <>
                        <button className="btn" style={{ fontSize: 10, padding: '1px 7px' }} onClick={() => mapSymbol(h)}>
                          {h.symbol ? '✎ ticker' : 'map ticker'}
                        </button>
                        <button className="btn" style={{ fontSize: 10, padding: '1px 7px' }} onClick={() => setCostBasis(h)}>
                          cost basis
                        </button>
                      </>
                    )}
                  </div>
                </td>
                <td>{inr(h.quantity, 3)}</td>
                <td>{h.avg_cost != null ? inr(h.avg_cost, 2) : cbt === 'zero' ? '₹0' : '—'}</td>
                <td>{inr(h.last_price, 2)}</td>
                <td>{h.invested != null ? inr(h.invested) : cbt === 'unknown' ? 'excl.' : '—'}</td>
                <td>{inr(h.current_value)}</td>
                <td className={h.pnl > 0 ? 'up' : h.pnl < 0 ? 'down' : ''}>
                  {h.pnl != null ? `${h.pnl >= 0 ? '+' : ''}₹${inr(h.pnl)}` : '—'}
                </td>
                <td className={h.pnl_pct > 0 ? 'up' : h.pnl_pct < 0 ? 'down' : ''}>
                  {h.pnl_pct != null ? `${h.pnl_pct}%` : '—'}
                </td>
                <td className={(h.xirr ?? 0) >= 0 ? 'up' : 'down'}>{pct(h.xirr)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {holdings.some(h => (h.cost_basis_type || 'normal') === 'unknown') && (
        <p className="note" style={{ padding: '8px 12px', borderTop: '1px solid var(--line)' }}>
          Holdings marked "unknown cost" are excluded from invested total, P&L and portfolio XIRR.
          Current value is still counted in the portfolio total.
        </p>
      )}
    </div>
  )
}
