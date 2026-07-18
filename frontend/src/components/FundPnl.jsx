import { useEffect, useState } from 'react'
import { inr } from '../api'

export default function FundPnl({ postAnalysis }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showExited, setShowExited] = useState(false)

  useEffect(() => {
    postAnalysis('fund-pnl').then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="empty"><p>Computing P&L…</p></div>
  if (!data) return <div className="empty"><p>Import a CAMS or KFIN tradebook to see per-fund P&L.</p></div>

  const rows = data.rows.filter(r => showExited || !r.fully_exited)
  const exitedCount = data.rows.filter(r => r.fully_exited).length

  return (
    <div style={{ padding: 20, maxWidth: 1000 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: 'var(--line)', border: '1px solid var(--line)', marginBottom: 16 }}>
        {[
          ['Total realised gain', `₹${inr(data.total_realised)}`, data.total_realised >= 0 ? 'up' : 'down'],
          ['Total unrealised gain', `₹${inr(data.total_unrealised)}`, data.total_unrealised >= 0 ? 'up' : 'down'],
          ['Combined total return', `₹${inr(data.total_realised + data.total_unrealised)}`, (data.total_realised + data.total_unrealised) >= 0 ? 'up' : 'down'],
        ].map(([label, val, cls]) => (
          <div key={label} style={{ background: 'var(--card)', padding: '14px 18px' }}>
            <div className="metric-label">{label}</div>
            <div className={`metric-value ${cls}`}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p className="note">FIFO-matched realised gains + current unrealised. Sorted by total return. Funds with no current holding shown separately.</p>
        {exitedCount > 0 && (
          <button className="btn" style={{ fontSize: 12, whiteSpace: 'nowrap' }} onClick={() => setShowExited(v => !v)}>
            {showExited ? 'Hide' : 'Show'} {exitedCount} exited fund{exitedCount > 1 ? 's' : ''}
          </button>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="name">Fund</th>
              <th>Invested</th>
              <th>Realised LTCG</th>
              <th>Realised STCG</th>
              <th>Unrealised</th>
              <th>Total P&L</th>
              <th>Current value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={row.fully_exited ? { opacity: 0.55 } : {}}>
                <td className="name">
                  <div className="hname">{row.name}</div>
                  <div className="tags">
                    <span className="tag">{row.isin}</span>
                    {row.fully_exited && <span className="tag" style={{ color: 'var(--ink-soft)' }}>exited</span>}
                  </div>
                </td>
                <td>{row.total_invested ? `₹${inr(row.total_invested)}` : '—'}</td>
                <td className={row.realised_ltcg > 0 ? 'up' : row.realised_ltcg < 0 ? 'down' : ''}>
                  {row.realised_ltcg !== 0 ? `${row.realised_ltcg >= 0 ? '+' : ''}₹${inr(row.realised_ltcg)}` : '—'}
                </td>
                <td className={row.realised_stcg > 0 ? 'up' : row.realised_stcg < 0 ? 'down' : ''}>
                  {row.realised_stcg !== 0 ? `${row.realised_stcg >= 0 ? '+' : ''}₹${inr(row.realised_stcg)}` : '—'}
                </td>
                <td className={row.unrealised > 0 ? 'up' : row.unrealised < 0 ? 'down' : ''}>
                  {row.unrealised != null ? `${row.unrealised >= 0 ? '+' : ''}₹${inr(row.unrealised)}` : '—'}
                </td>
                <td className={row.total_pnl > 0 ? 'up' : row.total_pnl < 0 ? 'down' : ''} style={{ fontWeight: 600 }}>
                  {row.total_pnl >= 0 ? '+' : ''}₹{inr(row.total_pnl)}
                </td>
                <td>{row.current_value ? `₹${inr(row.current_value)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
