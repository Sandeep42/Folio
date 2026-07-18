import { useEffect, useState } from 'react'
import { inr } from '../api'

const CAT_COLORS = {
  'ETF':           '#0f6b4a',
  'International': '#1a5fa8',
  'Stocks':        '#1c2b26',
  'Index':         '#2d8a5e',
  'ELSS':          '#b97b1e',
  'Hybrid':        '#7b5ea7',
  'Flexi cap':     '#3a7ab5',
  'Large cap':     '#4a9e6b',
  'Mid cap':       '#d4822a',
  'Small cap':     '#c94040',
  'Equity (other)':'#7a8a84',
  'Debt':          '#9aafb0',
}

export default function Allocation({ postAnalysis }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    postAnalysis('allocation').then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="empty"><p>Computing allocation…</p></div>
  if (!data) return <div className="empty"><p>No allocation data available.</p></div>

  const total = data.total_value
  const cats = data.categories

  // Build donut segments
  const R = 80, cx = 100, cy = 100, strokeW = 28
  let cumAngle = -90
  const segments = cats.map(cat => {
    const angle = (cat.pct / 100) * 360
    const start = cumAngle
    cumAngle += angle
    return { ...cat, startAngle: start, sweepAngle: angle }
  })

  function polarToXY(cx, cy, r, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
  }

  function arcPath(cx, cy, r, startAngle, sweepAngle) {
    if (sweepAngle >= 360) sweepAngle = 359.99
    const start = polarToXY(cx, cy, r, startAngle)
    const end = polarToXY(cx, cy, r, startAngle + sweepAngle)
    const large = sweepAngle > 180 ? 1 : 0
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
  }

  return (
    <div style={{ padding: 20, maxWidth: 900 }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* Donut chart */}
        <div style={{ flexShrink: 0 }}>
          <svg width={200} height={200} viewBox="0 0 200 200">
            {segments.map((seg, i) => (
              <path key={i}
                d={arcPath(cx, cy, R, seg.startAngle, seg.sweepAngle)}
                fill="none"
                stroke={CAT_COLORS[seg.category] || '#888'}
                strokeWidth={strokeW}
                strokeLinecap="butt"
                style={{ cursor: 'pointer', opacity: expanded === i ? 1 : 0.85 }}
                onClick={() => setExpanded(expanded === i ? null : i)}
              />
            ))}
            <text x={cx} y={cy - 8} textAnchor="middle" fontSize="11" fill="var(--ink-soft)" fontFamily="var(--mono)">Total</text>
            <text x={cx} y={cy + 8} textAnchor="middle" fontSize="13" fontWeight="500" fill="var(--ink)" fontFamily="var(--mono)">
              {total >= 10000000 ? `₹${(total/10000000).toFixed(2)}Cr` : `₹${(total/100000).toFixed(1)}L`}
            </text>
          </svg>
        </div>

        {/* Legend + bar chart */}
        <div style={{ flex: 1, minWidth: 280 }}>
          {cats.map((cat, i) => (
            <div key={cat.category}
              style={{ marginBottom: 6, cursor: 'pointer' }}
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: CAT_COLORS[cat.category] || '#888', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{cat.category}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{cat.count} holding{cat.count !== 1 ? 's' : ''}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontFamily: 'var(--mono)', fontSize: 12 }}>
                  <span style={{ color: 'var(--ink-soft)' }}>{cat.pct.toFixed(1)}%</span>
                  <span style={{ fontWeight: 500 }}>₹{cat.value >= 100000 ? `${(cat.value/100000).toFixed(1)}L` : inr(cat.value)}</span>
                </div>
              </div>
              <div style={{ height: 4, background: 'var(--line)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${cat.pct}%`, background: CAT_COLORS[cat.category] || '#888', borderRadius: 2, transition: 'width 0.4s ease' }} />
              </div>

              {/* Expanded: individual holdings */}
              {expanded === i && (
                <div style={{ marginTop: 8, marginLeft: 18, borderLeft: `2px solid ${CAT_COLORS[cat.category] || '#888'}`, paddingLeft: 10 }}>
                  {cat.holdings.map((h, j) => (
                    <div key={j} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0',
                      fontSize: 11, borderBottom: j < cat.holdings.length - 1 ? '1px solid var(--line)' : 'none' }}>
                      <span style={{ color: 'var(--ink-soft)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {h.name}
                        {h.folio && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, marginLeft: 4, color: 'var(--ink-soft)' }}>folio {h.folio}</span>}
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', flexShrink: 0, marginLeft: 12 }}>
                        ₹{h.value >= 100000 ? `${(h.value/100000).toFixed(1)}L` : inr(h.value)}
                        <span style={{ color: 'var(--ink-soft)', marginLeft: 6 }}>
                          {total > 0 ? `${(h.value/total*100).toFixed(1)}%` : ''}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="note" style={{ marginTop: 20, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        Categories based on fund name keywords. FOF (Fund of Funds) investing in international indices is classified as International. Click any category to see individual holdings.
      </p>
    </div>
  )
}
