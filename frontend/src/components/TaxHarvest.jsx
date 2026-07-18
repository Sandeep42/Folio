import { useState, useMemo, useCallback } from 'react'
import { inr } from '../api'

function gainForUnits(lots, units) {
  let remaining = units, gain = 0
  for (const lot of lots) {
    if (remaining <= 1e-6) break
    const take = Math.min(lot.quantity_to_sell, remaining)
    gain += take * (lot.last_price - lot.buy_price)
    remaining -= take
  }
  return gain
}

function optimise(gainSuggs, budget) {
  const allLots = []
  for (const s of gainSuggs) {
    for (const lot of s.lot_breakdown) {
      if (lot.gain <= 0) continue
      allLots.push({ isin: s.isin, lot, gainPerUnit: lot.gain / lot.quantity_to_sell })
    }
  }
  allLots.sort((a, b) => b.gainPerUnit - a.gainPerUnit)
  const result = {}
  let remaining = budget
  for (const { isin, lot } of allLots) {
    if (remaining <= 1) break
    const gpu = lot.gain / lot.quantity_to_sell
    if (gpu <= 0) continue
    const take = Math.floor(Math.min(lot.quantity_to_sell, remaining / gpu) * 1000) / 1000
    if (take < 0.001) continue
    result[isin] = (result[isin] || 0) + take
    remaining -= gainForUnits([lot], take)
  }
  return result
}

function LotTable({ lots, isLoss }) {
  return (
    <div style={{ borderTop: '1px solid var(--line)', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: 11 }}>
        <thead>
          <tr style={{ background: 'var(--paper)' }}>
            {['Buy date', isLoss ? 'Units' : 'Units', 'Cost/unit', 'Current', isLoss ? 'Loss' : 'Gain/unit', isLoss ? '' : 'Total gain', 'Term']
              .filter(Boolean).map(h => (
              <th key={h} style={{ padding: '5px 8px', textAlign: 'right', fontSize: 9,
                textTransform: 'uppercase', letterSpacing: '0.06em',
                color: 'var(--ink-soft)', borderBottom: '1px solid var(--line)', fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lots.map((lot, j) => {
            const gpu = (lot.last_price - lot.buy_price).toFixed(2)
            return (
              <tr key={j} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '5px 8px', textAlign: 'right' }}>{lot.buy_date}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600 }}>
                  {Number(lot.quantity_to_sell).toLocaleString('en-IN', { maximumFractionDigits: 3 })}
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'right' }}>₹{inr(lot.buy_price, 2)}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right' }}>₹{inr(lot.last_price, 2)}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right',
                  color: isLoss ? 'var(--red)' : (gpu >= 0 ? 'var(--green)' : 'var(--red)'), fontWeight: 600 }}>
                  {isLoss ? '' : (gpu >= 0 ? '+' : '')}₹{isLoss ? inr(lot.gain) : gpu}
                </td>
                {!isLoss && (
                  <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600,
                    color: lot.gain >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {lot.gain >= 0 ? '+' : ''}₹{inr(lot.gain)}
                  </td>
                )}
                <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                  <span className={`term-badge ${lot.term === 'LTCG' ? 'term-lt' : 'term-st'}`}>{lot.term}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function TaxHarvest({ harvest, ltcgRealized, onLtcgRealized }) {
  const [tab, setTab]               = useState('gain')
  const [expanded, setExpanded]     = useState(null)
  const [selections, setSelections] = useState({})
  const [optimiseSummary, setOptimiseSummary] = useState(null)

  if (!harvest) return (
    <div className="empty">
      <h2>No harvest data yet</h2>
      <p>Import your CAMS or KFIN transaction history to unlock lot-level tax harvesting.</p>
    </div>
  )

  const r          = harvest
  const LIMIT      = r.ltcg_exemption_limit
  const remaining  = r.ltcg_exemption_remaining
  const gainSuggs  = r.suggestions.filter(s => s.kind === 'gain_harvest')
  const lossSuggs  = r.suggestions.filter(s => s.kind === 'loss_harvest')

  const { selGain, selTaxFree, selTaxable, selByIsin } = useMemo(() => {
    const byIsin = {}
    let total = 0
    for (const s of gainSuggs) {
      const units = parseFloat(selections[s.isin]) || 0
      if (units <= 0) continue
      const gain = gainForUnits(s.lot_breakdown, units)
      byIsin[s.isin] = { units, gain }
      total += gain
    }
    return { selGain: total, selTaxFree: Math.min(total, remaining),
             selTaxable: Math.max(0, total - remaining), selByIsin: byIsin }
  }, [selections, gainSuggs, remaining])

  const runOptimise = useCallback(() => {
    const plan = optimise(gainSuggs, remaining)
    const next = {}, summary = []
    for (const s of gainSuggs) {
      const units = plan[s.isin]
      if (!units || units < 0.001) continue
      next[s.isin] = String(units)
      summary.push({ name: s.name, units, gain: gainForUnits(s.lot_breakdown, units) })
    }
    setSelections(next)
    setOptimiseSummary(summary)
  }, [gainSuggs, remaining])

  const clearAll  = () => { setSelections({}); setOptimiseSummary(null) }
  const setUnits  = (isin, val) => setSelections(prev => ({ ...prev, [isin]: val }))
  const setMax    = (s) => setSelections(prev => ({ ...prev, [s.isin]: String(s.quantity) }))

  const usedPct = Math.min(100, ((LIMIT - remaining) / LIMIT) * 100)
  const planPct = Math.min(100, (selTaxFree / LIMIT) * 100)
  const hasSelections = Object.keys(selByIsin).length > 0

  return (
    <div className="harvest-page">
      <h2>Tax harvesting</h2>
      <div className="harvest-fy">{r.fy_label} · Sec 112A LTCG exemption</div>

      <div className="harvest-cards">
        <div className="metric"><div className="metric-label">Unrealised LTCG</div><div className="metric-value up">₹{inr(r.unrealized_ltcg)}</div></div>
        <div className="metric"><div className="metric-label">Unrealised STCG</div><div className="metric-value">₹{inr(r.unrealized_stcg)}</div></div>
        <div className="metric"><div className="metric-label">LT losses</div><div className="metric-value down">₹{inr(r.unrealized_lt_losses)}</div></div>
        <div className="metric"><div className="metric-label">ST losses</div><div className="metric-value down">₹{inr(r.unrealized_st_losses)}</div></div>
      </div>

      <div className="meter-wrap">
        <div className="meter-label">
          LTCG already booked this FY: ₹
          <input type="number" min="0" step="1000" value={ltcgRealized}
            onChange={e => { onLtcgRealized(Number(e.target.value) || 0); clearAll() }} />
        </div>
        <div className="meter" style={{ overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0 }}>
            <div style={{ position:'absolute', top:0, bottom:0, left:0,
              width:`${usedPct}%`, background:'var(--ink-soft)' }} />
            <div style={{ position:'absolute', top:0, bottom:0, left:`${usedPct}%`,
              width:`${planPct}%`, background:'var(--green)', opacity:0.85, transition:'width 0.2s' }} />
            {selTaxable > 0 && (
              <div style={{ position:'absolute', top:0, bottom:0, right:0, width:4, background:'var(--red)' }} />
            )}
          </div>
          <div className="meter-avail" style={{ position:'relative', zIndex:1 }}>
            {hasSelections
              ? selTaxable > 0
                ? `⚠ ₹${inr(Math.round(selTaxable))} over limit`
                : `₹${inr(Math.round(remaining - selTaxFree))} remaining`
              : `₹${inr(remaining)} still tax-free`}
          </div>
        </div>
        <div className="meter-scale"><span>₹0</span><span>₹{inr(LIMIT)}</span></div>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', borderBottom:'1px solid var(--line)', background:'var(--card)', margin:'12px 0 0' }}>
        {[
          { id:'gain', label:'Gain harvest', count: gainSuggs.length },
          { id:'loss', label:'Loss harvest', count: lossSuggs.length },
        ].map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setExpanded(null) }} style={{
            border:'none', background:'none', padding:'10px 18px', cursor:'pointer',
            fontSize:13, fontFamily:'var(--body)',
            color: tab === t.id ? 'var(--green)' : 'var(--ink-soft)',
            borderBottom: tab === t.id ? '2px solid var(--green)' : '2px solid transparent',
            fontWeight: tab === t.id ? 600 : 400, marginBottom:-1,
          }}>
            {t.label}
            <span style={{ marginLeft:6, fontFamily:'var(--mono)', fontSize:11,
              background: t.count > 0 && tab === t.id ? 'var(--green)' : 'var(--line)',
              color: t.count > 0 && tab === t.id ? '#fff' : 'var(--ink-soft)',
              padding:'1px 7px', borderRadius:10 }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* ── Gain harvest tab ── */}
      {tab === 'gain' && (
        <div>
          {/* Action bar */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
            flexWrap:'wrap', gap:8, margin:'12px 0 8px' }}>
            {hasSelections ? (
              <div style={{ display:'flex', gap:16, fontFamily:'var(--mono)', fontSize:12,
                padding:'8px 12px', borderRadius:4, flexWrap:'wrap',
                background: selTaxable > 0 ? 'var(--red-soft)' : 'var(--green-soft)',
                border:`1px solid ${selTaxable > 0 ? 'var(--red)' : 'var(--green)'}` }}>
                <span>Planned: <strong>₹{inr(Math.round(selGain))}</strong></span>
                <span style={{ color:'var(--green)' }}>Tax-free: <strong>₹{inr(Math.round(selTaxFree))}</strong></span>
                {selTaxable > 0 && (
                  <span style={{ color:'var(--red)' }}>
                    Over: <strong>₹{inr(Math.round(selTaxable))}</strong>
                    {' '}(tax ≈₹{inr(Math.round(selTaxable * 0.125))})
                  </span>
                )}
                <span style={{ color:'var(--ink-soft)' }}>
                  Future tax saved: <strong style={{ color:'var(--green)' }}>≈₹{inr(Math.round(selTaxFree * 0.125))}</strong>
                </span>
              </div>
            ) : (
              <span className="note">Enter units to plan — or let the optimiser fill ₹{inr(remaining)} for you.</span>
            )}
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn primary" onClick={runOptimise}>⚡ Optimise ₹{inr(remaining)}</button>
              {hasSelections && <button className="btn" onClick={clearAll}>Clear</button>}
            </div>
          </div>

          {/* Optimise summary */}
          {optimiseSummary && (
            <div style={{ background:'var(--card)', border:'1px solid var(--green)',
              borderRadius:4, padding:16, marginBottom:12 }}>
              <div style={{ fontFamily:'var(--display)', fontWeight:600, fontSize:14,
                marginBottom:12, display:'flex', justifyContent:'space-between' }}>
                <span>⚡ Optimal harvest plan</span>
                <span style={{ fontFamily:'var(--mono)', color:'var(--green)', fontSize:13 }}>
                  ₹{inr(Math.round(optimiseSummary.reduce((s,r) => s+r.gain, 0)))} tax-free
                </span>
              </div>
              <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'var(--mono)', fontSize:12 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--line)' }}>
                    {['Fund','Units to sell','Gain booked'].map(h => (
                      <th key={h} style={{ padding:'5px 8px', textAlign: h==='Fund'?'left':'right',
                        fontSize:10, textTransform:'uppercase', letterSpacing:'0.06em',
                        color:'var(--ink-soft)', fontWeight:500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {optimiseSummary.map((row, i) => (
                    <tr key={i} style={{ borderBottom:'1px solid var(--line)' }}>
                      <td style={{ padding:'7px 8px', fontFamily:'var(--body)', fontSize:12 }}>{row.name}</td>
                      <td style={{ padding:'7px 8px', textAlign:'right', fontWeight:600 }}>
                        {row.units.toLocaleString('en-IN', { maximumFractionDigits:3 })}
                      </td>
                      <td style={{ padding:'7px 8px', textAlign:'right', color:'var(--green)', fontWeight:600 }}>
                        +₹{inr(Math.round(row.gain))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop:'2px solid var(--ink)' }}>
                    <td style={{ padding:'7px 8px', fontWeight:600, fontFamily:'var(--body)' }}>Total</td>
                    <td />
                    <td style={{ padding:'7px 8px', textAlign:'right', fontWeight:600, color:'var(--green)' }}>
                      +₹{inr(Math.round(optimiseSummary.reduce((s,r) => s+r.gain, 0)))}
                    </td>
                  </tr>
                </tfoot>
              </table>
              <p style={{ fontSize:11, color:'var(--ink-soft)', marginTop:10 }}>
                Sell these units (FIFO from oldest lots), rebuy immediately to reset cost basis. Adjust inputs below if needed.
              </p>
            </div>
          )}

          {/* Per-fund rows */}
          {gainSuggs.map((s, i) => {
            const sel = selByIsin[s.isin]
            const gain = sel?.gain ?? 0
            const isActive = (parseFloat(selections[s.isin]) || 0) > 0
            return (
              <div key={s.isin} style={{
                border:`1px solid ${isActive ? 'var(--green)' : 'var(--line)'}`,
                borderRadius:4, marginBottom:6, overflow:'hidden',
                background: isActive ? 'var(--green-soft)' : 'var(--card)',
                transition:'border-color 0.15s, background 0.15s',
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', flexWrap:'wrap' }}>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ fontWeight:600, fontSize:13 }}>
                      {!s.within_exemption && <span style={{ color:'var(--turmeric)', marginRight:5 }}>⚠</span>}
                      {s.name}
                    </div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--ink-soft)', marginTop:2 }}>
                      Total gain ₹{inr(s.estimated_gain)} · {s.lot_breakdown.length} lots
                      {s.within_exemption
                        ? <span style={{ color:'var(--green)', marginLeft:8 }}>✓ fits ₹1.25L</span>
                        : <span style={{ color:'var(--turmeric)', marginLeft:8 }}>exceeds ₹1.25L</span>}
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                    <label style={{ fontSize:11, color:'var(--ink-soft)' }}>Units:</label>
                    <input type="number" min="0" step="0.001"
                      value={selections[s.isin] ?? ''} placeholder="0"
                      onChange={e => setUnits(s.isin, e.target.value)}
                      style={{ width:100, padding:'4px 7px', fontFamily:'var(--mono)', fontSize:12,
                        border:`1px solid ${isActive ? 'var(--green)' : 'var(--line)'}`,
                        borderRadius:3, background:'var(--card)' }} />
                    <button className="btn" style={{ fontSize:11, padding:'3px 8px' }} onClick={() => setMax(s)}>max</button>
                  </div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:13, minWidth:110, textAlign:'right', flexShrink:0 }}>
                    {isActive
                      ? <span style={{ color:'var(--green)', fontWeight:600 }}>+₹{inr(Math.round(gain))}</span>
                      : <span style={{ color:'var(--ink-soft)' }}>₹—</span>}
                  </div>
                  <button onClick={() => setExpanded(expanded === `g${i}` ? null : `g${i}`)}
                    style={{ background:'none', border:'1px solid var(--line)', padding:'3px 10px',
                      cursor:'pointer', fontFamily:'var(--mono)', fontSize:11, borderRadius:3, flexShrink:0 }}>
                    {expanded === `g${i}` ? 'hide ▲' : `${s.lot_breakdown.length} lots ▼`}
                  </button>
                </div>
                <div style={{ padding:'0 14px 8px', fontSize:12, color:'var(--ink-soft)' }}>{s.rationale}</div>
                {expanded === `g${i}` && <LotTable lots={s.lot_breakdown} isLoss={false} />}
              </div>
            )
          })}

          {gainSuggs.length === 0 && (
            <p className="note" style={{ marginTop:16 }}>
              No LTCG gain opportunities — import a CAMS, KFIN, or Zerodha tradebook to see lot-level data.
            </p>
          )}
        </div>
      )}

      {/* ── Loss harvest tab ── */}
      {tab === 'loss' && (
        <div>
          {lossSuggs.length === 0 ? (
            <div style={{ padding:'24px 0' }}>
              <p className="note">No reachable loss lots found. Common reasons:</p>
              <ul className="note" style={{ marginTop:6, paddingLeft:20, lineHeight:2 }}>
                <li>All holdings' oldest lots are in profit (FIFO blocks the loss lots behind them)</li>
                <li>No tradebook imported — losses can only be computed from real buy dates</li>
                <li><strong>Stocks need a live price to compute gains/losses</strong> — click "Refresh prices" in the Holdings topbar, then come back here</li>
              </ul>
            </div>
          ) : (
            <div style={{ background:'var(--red-soft)', border:'1px solid var(--red)',
              borderRadius:4, padding:'10px 14px', margin:'12px 0',
              fontFamily:'var(--mono)', fontSize:12, display:'flex', gap:20, flexWrap:'wrap' }}>
              <span>Reachable losses: <strong style={{ color:'var(--red)' }}>
                ₹{inr(Math.round(lossSuggs.reduce((s,x) => s + Math.abs(x.estimated_gain), 0)))}
              </strong></span>
              <span style={{ color:'var(--ink-soft)' }}>Can offset LTCG or STCG · or carry forward up to 8 years</span>
            </div>
          )}

          {lossSuggs.length > 0 && (
            <p className="note" style={{ marginBottom:12 }}>
              Only lots where the oldest FIFO lot is a loss are shown. You can sell and immediately
              rebuy (no wash-sale rule in India), but the holding period resets from the rebuy date.
            </p>
          )}

          {lossSuggs.map((s, i) => (
            <div key={i} className="sugg loss">
              <div className="sugg-head">
                <div className="sugg-title">↓ Harvest loss · {s.name}</div>
                {s.lot_breakdown?.length > 0 && (
                  <button className="sugg-toggle loss-toggle"
                    onClick={() => setExpanded(expanded === `l${i}` ? null : `l${i}`)}>
                    {expanded === `l${i}` ? 'hide ▲' : `${s.lot_breakdown.length} lot${s.lot_breakdown.length !== 1 ? 's' : ''} ▼`}
                  </button>
                )}
              </div>
              <p>{s.rationale}</p>
              {expanded === `l${i}` && <LotTable lots={s.lot_breakdown} isLoss={true} />}
            </div>
          ))}
        </div>
      )}

      <p className="note" style={{ marginTop:20, borderTop:'1px solid var(--line)', paddingTop:14 }}>
        Educational estimates only — not tax advice. Gains computed from statement prices unless refreshed live. Confirm with a CA before selling.
      </p>
    </div>
  )
}
