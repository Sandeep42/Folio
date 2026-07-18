// In the Docker/web build, nginx proxies /api to the backend, so this is
// left empty. The Tauri desktop build sets VITE_API_BASE at build time to
// point at the localhost sidecar port instead (see src-tauri/).
export const API_BASE = import.meta.env.VITE_API_BASE || ''

const json = (r) => {
  if (!r.ok) return r.json().then((e) => { throw new Error(e.detail || r.statusText) })
  return r.json()
}

export const api = {
  parseCas: (file, password) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('password', password || '')
    return fetch(`${API_BASE}/api/parse-cas`, { method: 'POST', body: fd }).then(json)
  },
  parseXls: (file, holdings) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('holdings_json', JSON.stringify(holdings || []))
    return fetch(`${API_BASE}/api/parse-xls`, { method: 'POST', body: fd }).then(json)
  },
  parseKfin: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return fetch(`${API_BASE}/api/parse-kfin`, { method: 'POST', body: fd }).then(json)
  },
  parseZerodha: (files) => {
    const fd = new FormData()
    for (const f of files) fd.append('files', f)
    return fetch(`${API_BASE}/api/parse-zerodha`, { method: 'POST', body: fd }).then(json)
  },
  parseTradebook: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return fetch(`${API_BASE}/api/parse-tradebook`, { method: 'POST', body: fd }).then(json)
  },
  analyze: ({ holdings, trades, ltcgRealized = 0, fetchPrices = false }) =>
    fetch(`${API_BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        holdings, trades,
        ltcg_realized: ltcgRealized,
        fetch_prices: fetchPrices,
      }),
    }).then(json),
}

// ---- browser-side persistence: the ONLY place portfolio data lives ----
const KEY = 'cas-portfolio-v1'

export const loadState = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { holdings: [], trades: [], ltcgRealized: 0 }
  } catch {
    return { holdings: [], trades: [], ltcgRealized: 0 }
  }
}

export const saveState = (state) => localStorage.setItem(KEY, JSON.stringify(state))
export const clearState = () => localStorage.removeItem(KEY)

export const holdingKey = (h) => (h.folio ? `${h.isin}:${h.folio}` : h.isin)

export const inr = (v, d = 0) =>
  v == null ? '—' : v.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d })

export const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(2)}%`)
