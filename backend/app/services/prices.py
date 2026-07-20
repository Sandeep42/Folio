"""Live prices.

Mutual funds : AMFI publishes all NAVs daily as a semicolon-delimited text
               file. It includes ISINs, so NSDL/CDSL CAS holdings (which key
               on ISIN) map cleanly.
Stocks       : yfinance by NSE/BSE ticker. ISIN -> ticker is resolved via a
               bundled mapping file (data/isin_symbols.csv) which you can
               extend; unresolved ISINs are reported so the user can map them
               in the UI.
"""
from __future__ import annotations

import csv
import logging
import time
from datetime import date, datetime
from pathlib import Path

import httpx

log = logging.getLogger(__name__)

AMFI_NAV_URL = "https://portal.amfiindia.com/spages/NAVAll.txt"
DATA_DIR = Path(__file__).resolve().parents[2] / "data"

_amfi_cache: dict = {"fetched_at": 0.0, "by_isin": {}}
AMFI_TTL_SECONDS = 6 * 3600


async def fetch_amfi_navs(force: bool = False) -> dict[str, dict]:
    """Return {isin: {nav, name, amfi_code, nav_date}} for every scheme."""
    now = time.time()
    if not force and _amfi_cache["by_isin"] and now - _amfi_cache["fetched_at"] < AMFI_TTL_SECONDS:
        return _amfi_cache["by_isin"]

    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        resp = await client.get(AMFI_NAV_URL)
        resp.raise_for_status()

    by_isin: dict[str, dict] = {}
    # Format: Scheme Code;ISIN Div Payout/Growth;ISIN Div Reinvestment;Scheme Name;NAV;Date
    for line in resp.text.splitlines():
        parts = line.split(";")
        if len(parts) != 6 or not parts[0].strip().isdigit():
            continue
        code, isin1, isin2, name, nav_s, date_s = [p.strip() for p in parts]
        try:
            nav = float(nav_s)
            nav_date = datetime.strptime(date_s, "%d-%b-%Y").date()
        except ValueError:
            continue
        rec = {"nav": nav, "name": name, "amfi_code": code, "nav_date": nav_date}
        for isin in (isin1, isin2):
            if isin and isin != "-":
                by_isin[isin] = rec

    _amfi_cache.update(fetched_at=now, by_isin=by_isin)
    log.info("AMFI: cached %d ISINs", len(by_isin))
    return by_isin


def _yf_sym(sym: str) -> str:
    """Normalise Indian ticker for yfinance: add .NS if missing and not BSE."""
    if "." not in sym:
        return sym + ".NS"
    return sym


def fetch_stock_prices(symbols: list[str]) -> dict[str, dict]:
    """Return {symbol: {price, price_date}} via yfinance. Sync (yfinance is)."""
    if not symbols:
        return {}
    import yfinance as yf  # local import: heavy

    # Normalise symbols for NSE (yfinance requires .NS suffix)
    sym_map = {s: _yf_sym(s) for s in symbols}
    yf_symbols = list(set(sym_map.values()))

    out: dict[str, dict] = {}
    tickers = yf.Tickers(" ".join(yf_symbols))
    for orig_sym, yf_sym in sym_map.items():
        try:
            hist = tickers.tickers[yf_sym].history(period="5d")
            if hist.empty:
                continue
            out[orig_sym] = {
                "price": float(hist["Close"].iloc[-1]),
                "price_date": hist.index[-1].date(),
            }
        except Exception as exc:  # network / delisted / bad symbol
            log.warning("price fetch failed for %s: %s", orig_sym, exc)
    return out
