import { useEffect, useState } from 'react'
import { inr } from '../api'

export default function ElssTracker({ postAnalysis }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    postAnalysis('elss-tracker').then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="empty"><p>Loading ELSS data…</p></div>
  if (!data?.lots?.length) return (
    <div className="empty">
      <h2>No ELSS data</h2>
      <p>Import a CAMS transaction history (XLS) to see ELSS lock-in status.</p>
    </div>
  )

  const byFund = {}
  for (const lot of data.lots) {
    if (!byFund[lot.isin]) byFund[lot.isin] = { name: lot.name, lots: [] }
    byFund[lot.isin].lots.push(lot)
  }

  return (
    <div style={{ padding: 20, maxWidth: 860 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: 'var(--line)', border: '1px solid var(--line)', marginBottom: 20 }}>
        {[
          ['Locked', `₹${inr(data.locked_amount)}`, data.locked_amount > 0 ? 'down' : 'up'],
          ['Unlocked', `₹${inr(data.unlocked_amount)}`, 'up'],
          ['Total lots', data.lots.length, ''],
        ].map(([label, val, cls]) => (
          <div key={label} style={{ background: 'var(--card)', padding: '14px 18px' }}>
            <div className="metric-label">{label}</div>
            <div className={`metric-value ${cls}`}>{val}</div>
          </div>
        ))}
      </div>

      {data.locked_amount === 0 && (
        <div style={{ background: 'var(--green-soft)', border: '1px solid var(--green)', borderRadius: 4, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          ✓ All your ELSS lots are fully unlocked — all purchases are older than 3 years.
        </div>
      )}

      <p className="note" style={{ marginBottom: 16 }}>
        ELSS funds have a mandatory 3-year lock-in from the date of each purchase (SIP units lock individually). Lock-in = 3 × 365 days from buy date.
      </p>

      {Object.entries(byFund).map(([isin, fund]) => {
        const lockedLots = fund.lots.filter(l => l.locked)
        const unlockedLots = fund.lots.filter(l => !l.locked)
        const totalInvested = fund.lots.reduce((s, l) => s + l.invested, 0)
        return (
          <div key={isin} style={{ marginBottom: 12, border: '1px solid var(--line)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ padding: '11px 16px', background: 'var(--card)', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{fund.name}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-soft)', marginTop: 2 }}>{isin}</div>
              </div>
              <div style={{ display: 'flex', gap: 16, fontFamily: 'var(--mono)', fontSize: 12 }}>
                <span>₹{inr(totalInvested)} invested</span>
                {lockedLots.length > 0 && <span style={{ color: 'var(--red)' }}>{lockedLots.length} locked</span>}
                {unlockedLots.length > 0 && <span style={{ color: 'var(--green)' }}>{unlockedLots.length} unlocked</span>}
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: 11 }}>
              <thead>
                <tr style={{ background: 'var(--paper)' }}>
                  {['Buy date','Qty','Invested','Unlock date','Status'].map(h => (
                    <th key={h} style={{ padding: '5px 10px', textAlign: 'right', fontSize: 9,
                      textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-soft)',
                      borderBottom: '1px solid var(--line)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fund.lots.map((lot, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--line)',
                    background: lot.locked ? 'rgba(168,64,47,0.03)' : 'transparent' }}>
                    <td style={{ padding: '5px 10px', textAlign: 'right' }}>{lot.buy_date}</td>
                    <td style={{ padding: '5px 10px', textAlign: 'right' }}>{Number(lot.quantity).toLocaleString('en-IN', { maximumFractionDigits: 3 })}</td>
                    <td style={{ padding: '5px 10px', textAlign: 'right' }}>₹{inr(lot.invested)}</td>
                    <td style={{ padding: '5px 10px', textAlign: 'right' }}>{lot.unlock_date}</td>
                    <td style={{ padding: '5px 10px', textAlign: 'right' }}>
                      {lot.locked
                        ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>{lot.days_remaining}d left</span>
                        : <span style={{ color: 'var(--green)', fontWeight: 600 }}>Unlocked</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
