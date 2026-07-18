import { useEffect, useState } from 'react'
import { API_BASE, inr, pct } from '../api'

export default function HoldingDetail({ holding, state }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!holding) return
    setDetail(null); setLoading(true); setErr('')
    const url = `${API_BASE}/api/holding-detail?isin=${encodeURIComponent(holding.isin)}${holding.folio ? `&folio=${encodeURIComponent(holding.folio)}` : ''}`
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holdings: state.holdings, trades: state.trades, ltcg_realized: 0, fetch_prices: false }),
    })
      .then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.detail) }))
      .then(d => { setDetail(d); setLoading(false) })
      .catch(e => { setErr(e.message); setLoading(false) })
  }, [holding?.isin, holding?.folio])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-soft)' }}>Loading…</div>
  if (err)     return <div style={{ padding: 20, color: 'var(--red)' }}>{err}</div>
  if (!detail) return null

  return (
    <div style={{ maxWidth: 860, padding: '20px 24px' }}>

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1,
        background: 'var(--line)', border: '1px solid var(--line)', marginBottom: 24 }}>
        {[
          ['Qty held', detail.quantity?.toLocaleString('en-IN', { maximumFractionDigits: 3 })],
          ['Current value', detail.current_value ? `₹${inr(detail.current_value)}` : '—'],
          ['XIRR', pct(detail.xirr)],
          ['Invested (known cost)', detail.invested ? `₹${inr(detail.invested)}` : '—'],
          ['Unrealised gain', detail.gain != null ? `${detail.gain >= 0 ? '+' : ''}₹${inr(detail.gain)}` : '—'],
          ['Price / NAV', detail.last_price ? `₹${inr(detail.last_price, 2)}` : '—'],
        ].map(([label, val], i) => (
          <div key={i} style={{ background: 'var(--card)', padding: '14px 18px',
            borderRight: (i+1)%3 !== 0 ? '1px solid var(--line)' : 'none',
            borderBottom: i < 3 ? '1px solid var(--line)' : 'none' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em',
              color: 'var(--ink-soft)', fontWeight: 500 }}>{label}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 17, fontWeight: 500, marginTop: 4,
              color: label.includes('gain') || label === 'XIRR'
                ? (detail.gain >= 0 && label.includes('gain')) || (detail.xirr >= 0 && label === 'XIRR')
                  ? 'var(--green)' : 'var(--red)'
                : 'var(--ink)' }}>
              {val}
            </div>
          </div>
        ))}
      </div>

      {/* Acquisition lots */}
      {detail.lot_detail?.length > 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', marginBottom: 20 }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)', display: 'flex',
            justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em',
              color: 'var(--ink-soft)', fontWeight: 500 }}>
              Acquisition lots ({detail.lot_detail.length})
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Buy date','Quantity','Buy price','Current price','Gain','Gain %','Term'].map(h => (
                    <th key={h} style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: 'var(--ink-soft)', textAlign: 'right', padding: '8px 14px',
                      borderBottom: '2px solid var(--ink)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.lot_detail.map((lot, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '8px 14px', textAlign: 'right' }}>{lot.buy_date}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600 }}>
                      {lot.quantity?.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
                    </td>
                    <td style={{ padding: '8px 14px', textAlign: 'right' }}>₹{inr(lot.buy_price, 2)}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right' }}>₹{inr(lot.current_price, 2)}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600,
                      color: lot.gain >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {lot.gain != null ? `${lot.gain >= 0 ? '+' : ''}₹${inr(lot.gain)}` : '—'}
                    </td>
                    <td style={{ padding: '8px 14px', textAlign: 'right',
                      color: lot.gain_pct >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {lot.gain_pct != null ? `${lot.gain_pct >= 0 ? '+' : ''}${lot.gain_pct}%` : '—'}
                    </td>
                    <td style={{ padding: '8px 14px', textAlign: 'right' }}>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, border: '1px solid',
                        color: lot.term === 'LTCG' ? 'var(--green)' : 'var(--turmeric)',
                        borderColor: lot.term === 'LTCG' ? 'var(--green)' : 'var(--turmeric)',
                        background: lot.term === 'LTCG' ? 'var(--green-soft)' : 'var(--turmeric-soft)' }}>
                        {lot.term}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Transaction history */}
      {detail.trades?.length > 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em',
              color: 'var(--ink-soft)', fontWeight: 500 }}>
              Transaction history ({detail.trades.length})
            </div>
          </div>
          <div style={{ padding: '0 18px' }}>
            {detail.trades.map((t, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '9px 0', borderBottom: i < detail.trades.length - 1 ? '1px solid var(--line)' : 'none' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, padding: '2px 8px', borderRadius: 3,
                    background: t.side === 'BUY' ? 'var(--green-soft)' : 'var(--red-soft)',
                    color: t.side === 'BUY' ? 'var(--green)' : 'var(--red)',
                    border: `1px solid ${t.side === 'BUY' ? 'var(--green)' : 'var(--red)'}`,
                    fontWeight: 600 }}>{t.side}</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink-soft)', fontSize: 13 }}>{t.date}</span>
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 500, fontSize: 14 }}>₹{inr(t.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!detail.lot_detail?.length && !detail.trades?.length && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13,
          background: 'var(--card)', border: '1px solid var(--line)' }}>
          No transaction history available.<br />
          Import a CAMS XLS, KFIN XLS, or Zerodha tradebook to see lot-level detail.
        </div>
      )}
    </div>
  )
}

function InvestedChart({ data, currentValue }) {
  if (!data?.length) return null
  const maxY = Math.max(...data.map(d => d.invested), currentValue || 0) * 1.1
  const w = 760, h = 160, padL = 60, padR = 40, padT = 12, padB = 32
  const cW = w - padL - padR, cH = h - padT - padB
  const xS = i  => padL + (i / (data.length - 1)) * cW
  const yS = v  => padT + cH - (v / maxY) * cH
  const n = data.length

  const area = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xS(i).toFixed(1)},${yS(d.invested).toFixed(1)}`).join(' ')
    + ` L${xS(n-1).toFixed(1)},${(padT+cH).toFixed(1)} L${padL},${(padT+cH).toFixed(1)} Z`
  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xS(i).toFixed(1)},${yS(d.invested).toFixed(1)}`).join(' ')
  const cvY  = currentValue ? yS(currentValue) : null

  const yTicks = [0, maxY * 0.5, maxY].map(v => ({
    v, y: yS(v),
    label: v >= 100000 ? `₹${(v/100000).toFixed(1)}L` : v >= 1000 ? `₹${(v/1000).toFixed(0)}K` : `₹${v}`,
  }))
  // X axis: show first, last, and middle only if they're meaningfully different months
  const firstDate = data[0].date.slice(0, 7)
  const lastDate  = data[n-1].date.slice(0, 7)
  const midDate   = data[Math.floor(n/2)].date.slice(0, 7)
  const xLabels = [
    { i: 0,              label: firstDate },
    ...(midDate !== firstDate && midDate !== lastDate ? [{ i: Math.floor(n/2), label: midDate }] : []),
    ...(n > 1 && lastDate !== firstDate ? [{ i: n-1, label: lastDate }] : []),
  ]

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="ig" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--green)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--green)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* Legend */}
      <g>
        <line x1={padL} y1={8} x2={padL+16} y2={8} stroke="var(--green)" strokeWidth="2" />
        <text x={padL+20} y={11} fontSize="9" fill="var(--ink-soft)" fontFamily="var(--mono)">Cumulative invested</text>
        <line x1={padL+140} y1={8} x2={padL+156} y2={8} stroke="var(--turmeric)" strokeWidth="1.5" strokeDasharray="5,3" />
        <text x={padL+160} y={11} fontSize="9" fill="var(--ink-soft)" fontFamily="var(--mono)">Current value</text>
      </g>
      {yTicks.map((t, i) => (
        <g key={i}>
          <line x1={padL} y1={t.y} x2={w-padR} y2={t.y} stroke="var(--line)" strokeWidth="0.5" strokeDasharray="3,3" />
          <text x={padL-6} y={t.y+4} textAnchor="end" fontSize="10" fill="var(--ink-soft)" fontFamily="var(--mono)">{t.label}</text>
        </g>
      ))}
      <path d={area} fill="url(#ig)" />
      <path d={line} fill="none" stroke="var(--green)" strokeWidth="2" />
      {cvY != null && (
        <>
          <line x1={padL} y1={cvY} x2={w-padR} y2={cvY} stroke="var(--turmeric)" strokeWidth="1.5" strokeDasharray="5,3" />
          <text x={w-padR+6} y={cvY+4} fontSize="10" fill="var(--turmeric)" fontFamily="var(--mono)">
            {currentValue >= 100000 ? `₹${(currentValue/100000).toFixed(1)}L` : `₹${(currentValue/1000).toFixed(0)}K`} now
          </text>
        </>
      )}
      {data.map((d, i) => (
        <circle key={i} cx={xS(i)} cy={yS(d.invested)} r="3"
          fill="var(--card)" stroke="var(--green)" strokeWidth="1.5" />
      ))}
      {xLabels.map(({ i, label }) => (
        <text key={i} x={xS(i)} y={h-4} textAnchor="middle" fontSize="10"
          fill="var(--ink-soft)" fontFamily="var(--mono)">{label}</text>
      ))}
    </svg>
  )
}
