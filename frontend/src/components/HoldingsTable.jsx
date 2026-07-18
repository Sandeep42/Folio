import { useState } from 'react'
import { inr, pct } from '../api'
import Modal from './Modal'

const COLS = [
  ['name','Holding'],['quantity','Qty'],['avg_cost','Avg cost'],
  ['last_price','Price / NAV'],['invested','Invested'],
  ['current_value','Value'],['pnl','P&L'],['pnl_pct','P&L %'],['xirr','XIRR'],
]

const CBT_COLORS = { zero: 'var(--turmeric)', unknown: 'var(--ink-soft)' }

const CBT_OPTIONS = [
  { value: 'normal', label: 'Normal', hint: 'Bought at market' },
  { value: 'zero', label: 'ESOP / RSU at ₹0', hint: 'Cost genuinely zero, included in XIRR' },
  { value: 'unknown', label: 'Unknown', hint: 'Gift/inherited — excluded from P&L & XIRR' },
]

export default function HoldingsTable({ holdings, onMapSymbol, onSetCostBasis, onSelect }) {
  const [tickerModal, setTickerModal] = useState(null)   // holding, or null
  const [tickerInput, setTickerInput] = useState('')
  const [cbtModal, setCbtModal] = useState(null)          // holding, or null

  const openTickerModal = (h) => { setTickerInput(h.symbol || ''); setTickerModal(h) }
  const saveTicker = () => {
    const s = tickerInput.trim().toUpperCase()
    if (s) onMapSymbol(tickerModal.isin, s)
    setTickerModal(null)
  }

  const openCbtModal = (h) => setCbtModal(h)
  const chooseCbt = (value) => { onSetCostBasis(cbtModal.isin, value); setCbtModal(null) }

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
                        <button className="btn" style={{ fontSize: 10, padding: '1px 7px' }}
                          onClick={e => { e.stopPropagation(); openTickerModal(h) }}>
                          {h.symbol ? '✎ ticker' : 'map ticker'}
                        </button>
                        <button className="btn" style={{ fontSize: 10, padding: '1px 7px' }}
                          onClick={e => { e.stopPropagation(); openCbtModal(h) }}>
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

      {tickerModal && (
        <Modal title={`Yahoo Finance ticker — ${tickerModal.name}`} onClose={() => setTickerModal(null)}>
          <p className="note" style={{ marginTop: 0 }}>e.g. INFY.NS, TCS.BO</p>
          <input type="text" autoFocus value={tickerInput}
            onChange={e => setTickerInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveTicker()}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--line)',
              borderRadius: 4, fontFamily: 'var(--mono)', fontSize: 13, marginBottom: 14 }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setTickerModal(null)}>Cancel</button>
            <button className="btn primary" onClick={saveTicker}>Save</button>
          </div>
        </Modal>
      )}

      {cbtModal && (
        <Modal title={`Cost basis — ${cbtModal.name}`} onClose={() => setCbtModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CBT_OPTIONS.map(o => (
              <button key={o.value} className="btn"
                style={{
                  justifyContent: 'flex-start', textAlign: 'left', padding: '10px 12px',
                  border: `1px solid ${(cbtModal.cost_basis_type || 'normal') === o.value ? 'var(--green)' : 'var(--line)'}`,
                }}
                onClick={() => chooseCbt(o.value)}>
                <div>
                  <div style={{ fontWeight: 600 }}>{o.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 400 }}>{o.hint}</div>
                </div>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
