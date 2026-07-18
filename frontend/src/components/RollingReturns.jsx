import { useEffect, useState } from 'react'

const fmt = (v) => v == null ? '—' : `${(v * 100).toFixed(1)}%`
const cls = (v) => v == null ? '' : v >= 0 ? 'up' : 'down'

export default function RollingReturns({ postAnalysis }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('3Y')

  useEffect(() => {
    postAnalysis('rolling-returns').then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="empty"><p>Computing rolling returns…</p></div>
  if (!data?.rows?.length) return (
    <div className="empty">
      <h2>No rolling return data</h2>
      <p>Import a CAMS or KFIN tradebook with at least 1 year of history to see rolling XIRR.</p>
    </div>
  )

  const rows = [...data.rows].sort((a, b) => {
    const av = a[sortBy] ?? -Infinity
    const bv = b[sortBy] ?? -Infinity
    return bv - av
  })

  const WINDOWS = ['1Y', '3Y', '5Y']
  const WINDOW_LABELS = { '1Y': '1 year', '3Y': '3 year', '5Y': '5 year' }

  return (
    <div style={{ padding: 20, maxWidth: 860 }}>
      <p className="note" style={{ marginBottom: 16 }}>
        Annualised XIRR for each look-back window. For holdings that existed before the window start,
        the opening position is valued at weighted average cost — so these are cost-basis returns,
        not market-price returns. Funds with less history than the window show "—".
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Sort by:</span>
        <div className="seg">
          {WINDOWS.map(w => (
            <button key={w} className={sortBy === w ? 'on' : ''} onClick={() => setSortBy(w)}>
              {w}
            </button>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="name">Fund</th>
              {WINDOWS.map(w => (
                <th key={w} onClick={() => setSortBy(w)} style={{ cursor: 'pointer' }}>
                  {w} XIRR{sortBy === w ? ' ▾' : ''}
                </th>
              ))}
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="name">
                  <div className="hname">{row.name}</div>
                  <div className="tags"><span className="tag">{row.isin}</span></div>
                </td>
                {WINDOWS.map(w => (
                  <td key={w} className={cls(row[w])} style={sortBy === w ? { fontWeight: 600 } : {}}>
                    {fmt(row[w])}
                  </td>
                ))}
                <td>₹{row.current_value?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="note" style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        XIRR is annualised money-weighted return. Funds showing very high 1Y returns and lower 3Y/5Y had a strong recent year — check the trend. Negative returns indicate the fund has lost value over the period on a cost-basis adjusted view.
      </p>
    </div>
  )
}
