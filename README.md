# Ledger — CAS Portfolio Analyzer

Upload an NSDL/CDSL Consolidated Account Statement (CAS), see live current
value, per-holding and portfolio XIRR, filter by stock/fund, and get Indian
tax-harvesting suggestions (Sec 112A gain harvesting + loss harvesting).

```
┌────────────┐   PDF + PAN pwd   ┌──────────────────────────────┐
│  React UI  │ ────────────────▶ │ FastAPI backend              │
│  (Vite)    │ ◀──── JSON ────── │  parsers/nsdl_cdsl (PyMuPDF) │
└────────────┘                   │  services/xirr               │
                                 │  services/tax_harvest        │
                                 │  services/prices ──▶ AMFI    │
                                 │                   ──▶ Yahoo  │
                                 └──────────────────────────────┘
```

## Run it

**Docker (recommended):**
```bash
docker compose up --build
# open http://localhost:8080
```
- The backend is **stateless**: it parses and computes in memory and writes
  nothing to disk. All portfolio data lives in the *browser* (localStorage).
- nginx serves the UI and proxies `/api` to the backend container — no CORS,
  single origin, 25 MB upload limit for chunky CAS PDFs.
- Outbound network needed only for AMFI + Yahoo price fetches.

**Bare metal (dev):**

Backend (Python 3.11+):
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend:
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173 (proxies /api to :8000)
```

## The one thing you must understand about NSDL/CDSL CAS

It is a **holdings snapshot**, not a transaction ledger. It tells you *what*
you own, not *when you bought it* — and transactions in the PDF cover the
statement month only. XIRR and lot-level tax math need acquisition history,
so the app has a two-step import:

1. **Upload CAS** → holdings, quantities, folios (password = PAN in caps).
2. **Import tradebook CSV** (`isin,date,side,quantity,price[,folio]`) →
   real buy lots. Zerodha/Groww tradebooks and MF transaction exports map to
   this in a spreadsheet in a minute. Until you do this, XIRR falls back to
   CAS average cost dated "today", which is honest-but-useless — the UI says so.

A sample is in `backend/data/sample_tradebook.csv`.

## Prices

- **Mutual funds**: AMFI `NAVAll.txt`, keyed by ISIN (exactly what the CAS
  gives you). Cached 6h.
- **Stocks**: yfinance. ISIN→ticker resolution: Yahoo often accepts the ISIN
  directly; otherwise the UI offers a "map ticker" button per holding, saved
  to `backend/data/isin_symbols.csv`.

## Tax harvesting model (FY 2025-26 rules)

- Equity/equity-MF LTCG: >12 months, 12.5% above ₹1,25,000/yr (Sec 112A)
- STCG: 20% (Sec 111A)
- Gain harvesting: fills your unused exemption, smallest lots first, partial
  lots supported; suggests rebuying to step up cost basis.
- Loss harvesting: suggested only when there are gains to offset (ST losses
  offset ST+LT; LT losses offset LT only), with STCG-days-to-LTCG countdown
  per lot.

Not modelled (extend `services/tax_harvest.py`): pre-2018 grandfathering,
debt/gold fund slab taxation, intraday/speculative income. **Not tax advice.**

## Where to extend

| Want | Touch |
|---|---|
| CAMS/KFintech CAS too | add parser in `app/parsers/`, or wrap `casparser` lib |
| Server-side accounts / sync across devices | add a DB + auth; today all state is browser localStorage by design |
| Broker-specific CSV mappers | `routers/upload.py::import_tradebook` |
| Charts (allocation, growth) | `GET /api/portfolio` already returns everything needed |
| Auth | FastAPI dependency on the two routers |

## Tests

```bash
cd backend && python -m pytest tests -q
```
Covers XIRR (growth, SIP, negative), LTCG/STCG classification, exemption-capped
gain harvesting, partial-lot math, and offset-gated loss harvesting.

## Privacy model

Your CAS contains PAN, addresses and full holdings, so the design is
**zero server-side storage**: `/api/parse-cas` and `/api/analyze` are pure
functions — portfolio data transits the backend in memory per request and is
never written anywhere. The browser's localStorage is the only database
(key `cas-portfolio-v1`); "Clear data" or clearing site data erases
everything. Consequences: incognito shows an empty portfolio, other devices
don't share state, and losing the browser profile loses the data (re-upload
the CAS to rebuild). Only price lookups (AMFI, Yahoo) leave your machine, and
they carry no personal data.
