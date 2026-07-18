import { useCallback, useEffect, useState } from 'react'
import { API_BASE, api, clearState, holdingKey, inr, loadState, pct, saveState } from './api'
import UploadPanel from './components/UploadPanel'
import HoldingsTable from './components/HoldingsTable'
import HoldingDetail from './components/HoldingDetail'
import TaxHarvest from './components/TaxHarvest'
import CapitalGains from './components/CapitalGains'
import ElssTracker from './components/ElssTracker'
import Allocation from './components/Allocation'
import FundPnl from './components/FundPnl'
import RollingReturns from './components/RollingReturns'
import FireTracker from './components/FireTracker'

const NAV = [
  { id: 'holdings',   label: 'Holdings',       icon: 'ti-list',        section: 'Portfolio' },
  { id: 'harvest',    label: 'Tax harvest',    icon: 'ti-scissors',    section: null, badge: true },
  { id: 'gains',      label: 'Capital gains',  icon: 'ti-receipt-tax', section: null },
  { id: 'elss',       label: 'ELSS tracker',   icon: 'ti-lock',        section: null },
  { id: 'fire',       label: 'FIRE',           icon: 'ti-flame',       section: null },
  { id: 'import',     label: 'Import data',    icon: 'ti-upload',      section: 'Import' },
]

const PAGE_TITLES = {
  holdings: 'Holdings', harvest: 'Tax harvest',
  gains: 'Capital gains', elss: 'ELSS tracker', fire: 'FIRE', import: 'Import data',
}

// Holdings sub-tabs
const HOLDING_TABS = [
  { id: 'all',        label: 'All' },
  { id: 'stocks',     label: 'Stocks' },
  { id: 'funds',      label: 'Mutual funds' },
  { id: 'etfs',       label: 'ETFs' },
  { id: 'allocation', label: 'Allocation' },
  { id: 'pnl',        label: 'P&L per fund' },
  { id: 'returns',    label: 'Rolling returns' },
]

const ETF_RE = /\bETF\b|BEES|EXCHANGE TRADED/i

function filterViews(views, tab, q) {
  let out = views
  if (tab === 'stocks')  out = out.filter(v => v.asset_type === 'stock')
  if (tab === 'funds')   out = out.filter(v => v.asset_type === 'mutual_fund' && !ETF_RE.test(v.name))
  if (tab === 'etfs')    out = out.filter(v => ETF_RE.test(v.name))
  if (q) {
    const n = q.toLowerCase()
    out = out.filter(v =>
      v.name.toLowerCase().includes(n) ||
      v.isin.toLowerCase().includes(n) ||
      (v.symbol || '').toLowerCase().includes(n))
  }
  return out
}

export default function App() {
  const [page, setPage]           = useState('holdings')
  const [holdingTab, setHoldingTab] = useState('all')
  const [state, setState]         = useState(loadState)
  const [result, setResult]       = useState(null)
  const [selected, setSelected]   = useState(null)   // holding for detail page
  const [q, setQ]                 = useState('')
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState('')
  const [backendReady, setBackendReady] = useState(false)

  // The Tauri desktop build's backend is a sidecar process that takes a few
  // seconds to cold-start (PyInstaller onefile extraction) — poll until it
  // actually responds instead of letting early requests fail with "Load failed".
  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      while (!cancelled) {
        try {
          const r = await fetch(`${API_BASE}/api/health`)
          if (r.ok) { setBackendReady(true); return }
        } catch { /* not up yet */ }
        await new Promise(res => setTimeout(res, 400))
      }
    }
    poll()
    return () => { cancelled = true }
  }, [])

  useEffect(() => { saveState(state) }, [state])

  const compute = useCallback(async (fetchPrices) => {
    if (!state.holdings.length) { setResult(null); return }
    setBusy(true); setError('')
    try {
      const res = await api.analyze({
        holdings: state.holdings, trades: state.trades,
        ltcgRealized: state.ltcgRealized, fetchPrices,
      })
      setResult(res)
      if (res.warnings?.length) setError(res.warnings.join(' · '))
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }, [state.holdings, state.trades, state.ltcgRealized])

  useEffect(() => { if (backendReady) compute(false) }, [compute, backendReady])

  const mergeHoldings = (incoming) =>
    setState(s => {
      const map = new Map(s.holdings.map(h => [holdingKey(h), h]))
      for (const h of incoming) {
        const prev = map.get(holdingKey(h))
        map.set(holdingKey(h), prev ? { ...h, symbol: prev.symbol || h.symbol } : h)
      }
      return { ...s, holdings: [...map.values()] }
    })

  const addTrades   = trades => setState(s => ({ ...s, trades: [...s.trades, ...trades] }))
  const setSymbol   = (isin, symbol) => setState(s => ({ ...s, holdings: s.holdings.map(h => h.isin === isin ? { ...h, symbol } : h) }))
  const setCostBasis = (isin, cbt)   => setState(s => ({ ...s, holdings: s.holdings.map(h => h.isin === isin ? { ...h, cost_basis_type: cbt } : h) }))
  // Tauri's embedded webview doesn't reliably support window.confirm(), so
  // Clear data uses an explicit two-click arm/confirm instead.
  const [confirmingReset, setConfirmingReset] = useState(false)
  useEffect(() => {
    if (!confirmingReset) return
    const t = setTimeout(() => setConfirmingReset(false), 4000)
    return () => clearTimeout(t)
  }, [confirmingReset])

  const reset = () => {
    if (!confirmingReset) { setConfirmingReset(true); return }
    setConfirmingReset(false)
    clearState(); setState(loadState()); setResult(null)
  }

  const postAnalysis = endpoint =>
    fetch(`${API_BASE}/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holdings: state.holdings, trades: state.trades, ltcg_realized: 0, fetch_prices: false }),
    }).then(r => r.json())

  const s = result?.summary
  const harvestCount = result?.harvest?.suggestions?.filter(x => x.kind === 'gain_harvest').length || 0
  const hasData = state.holdings.length > 0
  const views = filterViews(result?.holdings || [], holdingTab, q)

  if (!backendReady) {
    return (
      <div className="app-shell">
        <div className="main-area">
          <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <p className="note">Starting up…</p>
          </div>
        </div>
      </div>
    )
  }

  // If a fund is selected → show full detail page
  if (selected) {
    return (
      <div className="app-shell">
        <Sidebar page={page} setPage={p => { setPage(p); setSelected(null) }}
                 harvestCount={harvestCount} state={state} />
        <div className="main-area">
          <div className="topbar">
            <div className="topbar-left">
              <button className="btn" onClick={() => setSelected(null)} style={{ marginRight: 8 }}>
                ← Back
              </button>
              <span className="topbar-title">{selected.name}</span>
              <span className="topbar-meta">{selected.isin}</span>
            </div>
          </div>
          <div className="page">
            <HoldingDetail holding={selected} state={state} inline />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={setPage} harvestCount={harvestCount} state={state} />
      <div className="main-area">
        <div className="topbar">
          <div className="topbar-left">
            <span className="topbar-title">{PAGE_TITLES[page] || page}</span>
            {s && page === 'holdings' && ['all','stocks','funds','etfs'].includes(holdingTab) && (
              <span className="topbar-meta">{views.length} positions · {s.priced_count} priced</span>
            )}
          </div>
          <div className="topbar-actions">
            {page === 'holdings' && hasData && (
              <>
                <button className="btn" onClick={() => compute(true)} disabled={busy}>
                  <i className="ti ti-refresh" /> {busy ? 'Refreshing…' : 'Refresh prices'}
                </button>
                <button className="btn danger" onClick={reset}>
                  <i className="ti ti-trash" /> {confirmingReset ? 'Click again to confirm' : 'Clear data'}
                </button>
              </>
            )}
            {page !== 'import' && (
              <button className="btn primary" onClick={() => setPage('import')}>
                <i className="ti ti-upload" /> Import
              </button>
            )}
          </div>
        </div>

        {error && <div className="warn-banner">{error}</div>}

        <div className="page">
          {page === 'holdings' && (
            !hasData ? <EmptyState onImport={() => setPage('import')} /> : <>
              <SummaryStrip s={s} />
              {/* Holdings sub-tab bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '0 20px',
                borderBottom: '1px solid var(--line)', background: 'var(--card)', overflowX: 'auto' }}>
                {HOLDING_TABS.map(t => (
                  <button key={t.id} onClick={() => setHoldingTab(t.id)} style={{
                    border: 'none', background: 'none', padding: '10px 14px', cursor: 'pointer',
                    fontSize: 13, whiteSpace: 'nowrap',
                    color: holdingTab === t.id ? 'var(--green)' : 'var(--ink-soft)',
                    borderBottom: holdingTab === t.id ? '2px solid var(--green)' : '2px solid transparent',
                    fontWeight: holdingTab === t.id ? 600 : 400,
                    marginBottom: -1,
                  }}>{t.label}</button>
                ))}
                {/* Search only on table tabs */}
                {['all','stocks','funds','etfs'].includes(holdingTab) && (
                  <input type="search" placeholder="Search…" value={q}
                    onChange={e => setQ(e.target.value)}
                    style={{ marginLeft: 'auto', padding: '5px 10px', border: '1px solid var(--line)',
                      borderRadius: 4, fontSize: 12, width: 180 }} />
                )}
              </div>

              {/* Tab content */}
              {['all','stocks','funds','etfs'].includes(holdingTab) && (
                <HoldingsTable holdings={views} onMapSymbol={setSymbol}
                  onSetCostBasis={setCostBasis} onSelect={setSelected} />
              )}
              {holdingTab === 'allocation' && <Allocation postAnalysis={postAnalysis} />}
              {holdingTab === 'pnl'        && <FundPnl    postAnalysis={postAnalysis} />}
              {holdingTab === 'returns'    && <RollingReturns postAnalysis={postAnalysis} />}
            </>
          )}

          {page === 'harvest' && (
            !hasData ? <EmptyState onImport={() => setPage('import')} /> :
            <TaxHarvest harvest={result?.harvest} ltcgRealized={state.ltcgRealized}
              onLtcgRealized={v => setState(st => ({ ...st, ltcgRealized: v }))} />
          )}

          {page === 'gains' && (
            !hasData ? <EmptyState onImport={() => setPage('import')} /> :
            <CapitalGains postAnalysis={postAnalysis} />
          )}

          {page === 'elss' && (
            !hasData ? <EmptyState onImport={() => setPage('import')} /> :
            <ElssTracker postAnalysis={postAnalysis} />
          )}

          {page === 'fire' && (
            !hasData ? <EmptyState onImport={() => setPage('import')} /> :
            <FireTracker currentValue={s?.current_value}
              fireInputs={{
                annualExpenses: state.annualExpenses, swr: state.swr,
                expectedReturn: state.expectedReturn,
                annualContribution: state.annualContribution,
                yearsToRetirement: state.yearsToRetirement,
              }}
              onFireInputs={v => setState(st => ({ ...st, ...v }))} />
          )}

          {page === 'import' && (
            <UploadPanel holdings={state.holdings} onHoldings={mergeHoldings}
              onTrades={addTrades} onDone={() => setPage('holdings')} />
          )}
        </div>
      </div>
    </div>
  )
}

function Sidebar({ page, setPage, harvestCount, state }) {
  const casId = state.holdings.length ? `${state.holdings.length} holdings` : 'No data loaded'
  let currentSection = null
  return (
    <nav className="sidebar" aria-label="Main navigation">
      <div className="sidebar-logo">
        <h1>Folio<span>.</span></h1>
        <div className="cas-id">{casId}</div>
      </div>
      {NAV.map(item => {
        const showSection = item.section && item.section !== currentSection
        if (item.section) currentSection = item.section
        return (
          <div key={item.id}>
            {showSection && <div className="nav-section">{item.section}</div>}
            <div className={`nav-item${page === item.id ? ' active' : ''}`}
              onClick={() => setPage(item.id)} role="button" tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && setPage(item.id)}>
              <i className={`ti ${item.icon}`} />
              {item.label}
              {item.badge && harvestCount > 0 && <span className="nav-badge">{harvestCount}</span>}
            </div>
          </div>
        )
      })}
      <div className="sidebar-footer">
        <strong>Folio</strong>
        Browser-only · no server storage
        <a href="/privacy.html" target="_blank" rel="noopener"
          style={{ display: 'block', marginTop: 6, color: 'rgba(255,255,255,0.35)', fontSize: 11, textDecoration: 'none' }}>
          Privacy policy
        </a>
      </div>
    </nav>
  )
}

function SummaryStrip({ s }) {
  if (!s) return null
  return (
    <div className="summary-strip">
      <div className="metric">
        <div className="metric-label">Invested</div>
        <div className="metric-value">₹{inr(s.invested)}</div>
      </div>
      <div className="metric">
        <div className="metric-label">Current value</div>
        <div className="metric-value">₹{inr(s.current_value)}</div>
        <div className="metric-sub">{s.priced_count}/{s.holdings_count} priced</div>
      </div>
      <div className="metric">
        <div className="metric-label">Unrealised P&L</div>
        <div className={`metric-value ${s.pnl >= 0 ? 'up' : 'down'}`}>
          {s.pnl >= 0 ? '+' : ''}₹{inr(s.pnl)}
        </div>
        <div className={`metric-sub ${s.pnl >= 0 ? 'up' : ''}`}>
          {s.pnl_pct != null ? `${s.pnl_pct}%` : '—'}
        </div>
      </div>
      <div className="metric">
        <div className="metric-label">Portfolio XIRR</div>
        <div className={`metric-value ${(s.xirr ?? 0) >= 0 ? 'up' : 'down'}`}>{pct(s.xirr)}</div>
        <div className="metric-sub">{s.xirr == null ? 'import trades for XIRR' : 'annualised'}</div>
      </div>
    </div>
  )
}

function EmptyState({ onImport }) {
  return (
    <div className="empty">
      <h2>No portfolio data yet</h2>
      <p>Upload your NSDL or CDSL Consolidated Account Statement to get started.</p>
      <button className="btn primary" style={{ marginTop: 20 }} onClick={onImport}>
        <i className="ti ti-upload" /> Import data
      </button>
    </div>
  )
}
