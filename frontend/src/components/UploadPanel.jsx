import { useState } from 'react'
import { api } from '../api'

export default function UploadPanel({ holdings, onHoldings, onTrades, onDone }) {
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState({ text: '', warn: false })
  const [warnings, setWarnings] = useState([])
  const [busy, setBusy] = useState(false)

  const wrap = async (fn) => {
    setBusy(true); setMsg({ text: '', warn: false }); setWarnings([])
    try { await fn() }
    catch (err) { setMsg({ text: err.message, warn: true }) }
    finally { setBusy(false) }
  }

  const handleCas = (e) => {
    const file = e.target.files?.[0]; if (!file) return
    wrap(async () => {
      const res = await api.parseCas(file, password)
      onHoldings(res.holdings)
      setMsg({ text: `Parsed ${res.parsed} holdings${res.statement_period ? ` · ${res.statement_period}` : ''}.`, warn: false })
      setWarnings(res.warnings || [])
    })
    e.target.value = ''
  }

  const handleCams = (e) => {
    const file = e.target.files?.[0]; if (!file) return
    wrap(async () => {
      const res = await api.parseXls(file, holdings)
      const resolved = res.trades.filter(t => t.isin).length
      onTrades(res.trades.filter(t => t.isin))
      setMsg({ text: `CAMS: imported ${resolved} trades.${res.skipped ? ` ${res.skipped} rows skipped.` : ''}`, warn: false })
      setWarnings(res.warnings || [])
    })
    e.target.value = ''
  }

  const handleKfin = (e) => {
    const file = e.target.files?.[0]; if (!file) return
    wrap(async () => {
      const res = await api.parseKfin(file)
      onTrades(res.trades)
      setMsg({ text: `KFIN: imported ${res.trades.length} trades.${res.skipped ? ` ${res.skipped} rows skipped.` : ''}`, warn: false })
      setWarnings(res.warnings || [])
    })
    e.target.value = ''
  }

  const handleZerodha = (e) => {
    const files = Array.from(e.target.files || []); if (!files.length) return
    wrap(async () => {
      const res = await api.parseZerodha(files)
      onTrades(res.trades)
      const parts = [
        `Zerodha: imported ${res.trades.length} equity trades from ${files.length} file${files.length > 1 ? 's' : ''}.`,
        res.skipped_fo > 0 && `${res.skipped_fo} F&O rows skipped.`,
        res.duplicates_removed > 0 && `${res.duplicates_removed} duplicates removed.`,
      ].filter(Boolean)
      setMsg({ text: parts.join(' '), warn: false })
      setWarnings(res.warnings || [])
    })
    e.target.value = ''
  }

  const handleTradebook = (e) => {
    const file = e.target.files?.[0]; if (!file) return
    wrap(async () => {
      const res = await api.parseTradebook(file)
      onTrades(res.trades)
      setMsg({ text: `Imported ${res.trades.length} trades.`, warn: false })
    })
    e.target.value = ''
  }

  return (
    <>
      {msg.text && (
        <div className={msg.warn ? 'upload-warn' : 'upload-msg'} style={{ margin: '12px 20px 0' }}>
          {msg.text}
        </div>
      )}
      {warnings.map((w, i) => (
        <div key={i} className="upload-warn" style={{ margin: '6px 20px 0' }}>{w}</div>
      ))}

      <div className="upload-grid">
        <div className="upload-box">
          <h3><i className="ti ti-file-type-pdf" aria-hidden="true" style={{ marginRight: 6 }} />1 · CAS (PDF)</h3>
          <p>NSDL or CDSL consolidated statement. Parsed in memory — nothing stored on the server.</p>
          <input type="password" placeholder="PDF password (your PAN)"
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <input type="file" accept="application/pdf" onChange={handleCas} disabled={busy} />
        </div>

        <div className="upload-box">
          <h3><i className="ti ti-file-spreadsheet" aria-hidden="true" style={{ marginRight: 6 }} />2 · CAMS history (XLS)</h3>
          <p>mycams.com → Mailback Services → Transaction Statement → Detailed, Since Inception. Covers ABSL, DSP, HDFC, ICICI, Kotak, SBI, Parag Parikh, Navi etc.</p>
          <input type="file" accept=".xls,.xlsx" onChange={handleCams}
            disabled={busy || !holdings?.length} />
          {!holdings?.length && <div className="upload-note">Upload CAS first to enable ISIN matching.</div>}
        </div>

        <div className="upload-box">
          <h3><i className="ti ti-file-spreadsheet" aria-hidden="true" style={{ marginRight: 6 }} />3 · KFIN history (XLS)</h3>
          <p>kfintech.com → Investor Services → Transaction Statement → Since Inception. Covers Axis MF, UTI, Mirae Asset, Nippon, Quant.</p>
          <input type="file" accept=".xls,.xlsx" onChange={handleKfin} disabled={busy} />
        </div>

        <div className="upload-box">
          <h3><i className="ti ti-chart-candle" aria-hidden="true" style={{ marginRight: 6 }} />4 · Zerodha tradebook (CSV)</h3>
          <p>Console → Reports → Tradebook. Select multiple FY files at once — duplicates removed automatically. F&O rows skipped.</p>
          <input type="file" accept=".csv,text/csv" multiple onChange={handleZerodha} disabled={busy} />
        </div>

        <div className="upload-box">
          <h3><i className="ti ti-table" aria-hidden="true" style={{ marginRight: 6 }} />5 · Generic tradebook (CSV)</h3>
          <p>Any broker: columns <code>isin, date, side, quantity, price</code>. Groww and Upstox exports map here with a column rename.</p>
          <input type="file" accept=".csv,text/csv" onChange={handleTradebook} disabled={busy} />
        </div>
      </div>

      {holdings?.length > 0 && (
        <div style={{ padding: '0 20px 20px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn primary" onClick={onDone}>
            <i className="ti ti-arrow-right" aria-hidden="true" /> View holdings
          </button>
          <span className="note">{holdings.length} holdings loaded</span>
        </div>
      )}
    </>
  )
}
