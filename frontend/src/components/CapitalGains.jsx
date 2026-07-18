import { useEffect, useState } from 'react'
import { inr } from '../api'

export default function CapitalGains({ postAnalysis }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    postAnalysis('capital-gains').then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="empty"><p>Computing capital gains…</p></div>
  if (!data) return <div className="empty"><p>Import a tradebook to compute realised capital gains.</p></div>

  return (
    <div style={{ padding: 20, maxWidth: 860 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: 'var(--line)', border: '1px solid var(--line)', marginBottom: 20 }}>
        {[
          ['Total LTCG realised', `₹${inr(data.total_ltcg)}`, data.total_ltcg >= 0 ? 'up' : 'down'],
          ['Total STCG realised', `₹${inr(data.total_stcg)}`, ''],
          ['Total transactions', data.total_transactions, ''],
        ].map(([label, val, cls]) => (
          <div key={label} style={{ background: 'var(--card)', padding: '14px 18px' }}>
            <div className="metric-label">{label}</div>
            <div className={`metric-value ${cls}`}>{val}</div>
          </div>
        ))}
      </div>

      <p className="note" style={{ marginBottom: 16 }}>
        FIFO-matched across all imported trades. LTCG = held &gt;12 months at time of sale. Debt funds, grandfathering, and STT not modelled — verify with a CA before filing ITR.
      </p>

      {data.summary.map((fy, i) => (
        <div key={fy.fy} style={{ marginBottom: 8, border: '1px solid var(--line)', borderRadius: 4, overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '11px 16px', background: 'var(--card)', cursor: 'pointer',
            }}
            onClick={() => setExpanded(expanded === i ? null : i)}
          >
            <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 13 }}>{fy.fy}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                LTCG <span className={fy.ltcg >= 0 ? 'up' : 'down'} style={{ fontWeight: 600 }}>₹{inr(fy.ltcg)}</span>
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                STCG <span style={{ fontWeight: 600 }}>₹{inr(fy.stcg)}</span>
              </span>
              <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{fy.count} transactions</span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{expanded === i ? '▲' : '▼'}</span>
          </div>

          {expanded === i && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: 'var(--paper)' }}>
                    {['Sell date','Fund / Stock','Buy date','Qty','Buy price','Sell price','Gain','Term'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'right', fontSize: 9,
                        textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-soft)',
                        borderBottom: '1px solid var(--line)', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fy.transactions.map((t, j) => (
                    <tr key={j} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '5px 10px', textAlign: 'right' }}>{t.sell_date}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'left', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--body)', fontSize: 11 }}>{t.name}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right' }}>{t.buy_date}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right' }}>{Number(t.quantity).toLocaleString('en-IN', { maximumFractionDigits: 3 })}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right' }}>₹{inr(t.buy_price, 2)}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right' }}>₹{inr(t.sell_price, 2)}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 600,
                        color: t.gain >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {t.gain >= 0 ? '+' : ''}₹{inr(t.gain)}
                      </td>
                      <td style={{ padding: '5px 10px', textAlign: 'right' }}>
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, border: '1px solid',
                          color: t.term === 'LTCG' ? 'var(--green)' : 'var(--turmeric)',
                          borderColor: t.term === 'LTCG' ? 'var(--green)' : 'var(--turmeric)',
                          background: t.term === 'LTCG' ? 'var(--green-soft)' : 'var(--turmeric-soft)' }}>
                          {t.term}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
