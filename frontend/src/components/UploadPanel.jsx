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

  const handleCamsKfinCas = (e) => {
    const file = e.target.files?.[0]; if (!file) return
    wrap(async () => {
      const res = await api.parseCamsKfinCas(file, password)
      // Returns both holdings AND trades in one call
      if (res.holdings?.length) onHoldings(res.holdings)
      if (res.trades?.length) onTrades(res.trades)
      const msgParts = [
        `Imported ${res.parsed_holdings} holdings`,
        res.parsed_trades && `${res.parsed_trades} transactions`,
        res.statement_period && `· ${res.statement_period}`,
      ].filter(Boolean)
      setMsg({ text: msgParts.join(', '), warn: false })
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
        <div className="upload-box" style={{ gridColumn: '1 / -1' }}>
          <h3><i className="ti ti-file-type-pdf" aria-hidden="true" style={{ marginRight: 6 }} />CAS — CAMS + KFinTech Consolidated Statement</h3>
          <p>Get it from <a href="https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement" target="_blank" rel="noopener">CAMS</a> or <a href="https://mfs.kfintech.com/investor/General/InvestorTransactionReport" target="_blank" rel="noopener">KFintech</a> with <strong>Detailed</strong> option selected — covers all your mutual fund holdings and transaction history in one file.</p>
          <input type="password" placeholder="PDF password (your PAN in capitals)"
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <input type="file" accept="application/pdf" onChange={handleCamsKfinCas} disabled={busy} />
        </div>

        <div className="upload-box">
          <h3><i className="ti ti-chart-candle" aria-hidden="true" style={{ marginRight: 6 }} />Zerodha tradebook (CSV)</h3>
          <p>Console → Reports → Tradebook. Select multiple FY files at once — duplicates removed automatically. F&O rows skipped.</p>
          <input type="file" accept=".csv,text/csv" multiple onChange={handleZerodha} disabled={busy} />
        </div>

        <div className="upload-box">
          <h3><i className="ti ti-table" aria-hidden="true" style={{ marginRight: 6 }} />Generic tradebook (CSV)</h3>
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
