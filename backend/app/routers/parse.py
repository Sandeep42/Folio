"""Stateless parsing endpoints.

Nothing is written to disk. The browser owns all state: it stores what these
endpoints return (localStorage) and sends it back to /api/analyze whenever it
wants valuations, XIRR, or tax numbers.
"""
from __future__ import annotations

import csv
import io
import json
from datetime import datetime

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..models import AssetType, Holding, Lot, TradeRow
from ..parsers.cams_xls import parse_xls
from ..parsers.nsdl_cdsl import parse_cas

router = APIRouter(prefix="/api", tags=["parse"])

DATE_FORMATS = ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d-%b-%Y", "%d %b %Y")


def _parse_date(s: str):
    s = s.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    raise HTTPException(422, f"Unrecognised date: {s!r}")


@router.post("/parse-cas")
async def parse_cas_endpoint(file: UploadFile = File(...), password: str = Form(default="")):
    data = await file.read()
    try:
        result = parse_cas(data, password or None)
    except ValueError as exc:
        raise HTTPException(422, str(exc))

    as_of = result.as_of or datetime.today().date()
    holdings: list[Holding] = []
    for ph in result.holdings:
        h = Holding(
            isin=ph.isin, name=ph.name, asset_type=AssetType(ph.asset_type),
            quantity=ph.quantity, folio=ph.folio, avg_cost=ph.avg_cost,
            last_price=ph.nav_or_price, price_as_of=as_of,
        )
        # CDSL folio rows carry cumulative invested -> one synthetic lot so
        # P&L works immediately. Dated as-of statement date (real buy dates
        # unknown), flagged source="cas" so tax-term math ignores it.
        if h.avg_cost:
            h.lots = [Lot(buy_date=as_of, quantity=h.quantity,
                          price=h.avg_cost, source="cas")]
        holdings.append(h)

    return {
        "parsed": len(holdings),
        "statement_period": result.statement_period,
        "as_of": str(as_of),
        "warnings": result.warnings,
        "holdings": [h.model_dump(mode="json") for h in holdings],
    }


@router.post("/parse-tradebook")
async def parse_tradebook(file: UploadFile = File(...)):
    """CSV columns: isin, date, side (BUY/SELL), quantity, price[, folio].
    Returns normalised trade rows; the browser stores them and includes them
    in /api/analyze calls, where they are turned into lots + cash flows."""
    text = (await file.read()).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(422, "Empty CSV")
    cols = {c.lower().strip(): c for c in reader.fieldnames}
    required = {"isin", "date", "side", "quantity", "price"}
    if not required.issubset(cols):
        raise HTTPException(422, f"CSV must have columns {sorted(required)}; got {reader.fieldnames}")

    trades: list[TradeRow] = []
    for row in reader:
        side = row[cols["side"]].strip().upper()
        if side not in ("BUY", "SELL"):
            raise HTTPException(422, f"side must be BUY or SELL, got {side!r}")
        folio = (row.get(cols.get("folio", ""), "") or "").strip() or None
        trades.append(TradeRow(
            isin=row[cols["isin"]].strip().upper(),
            txn_date=_parse_date(row[cols["date"]]),
            side=side,
            quantity=float(row[cols["quantity"]]),
            price=float(row[cols["price"]]),
            folio=folio,
        ))
    return {"trades": [t.model_dump(mode="json") for t in trades]}


@router.post("/parse-xls")
async def parse_xls_endpoint(
    file: UploadFile = File(...),
    holdings_json: str = Form(default="[]"),
):
    """Parse a CAMS MF transaction history XLS.

    The browser POSTs the file plus its current holdings (JSON string) so
    ISINs can be resolved via folio/scheme-name matching against the CAS.
    Nothing is stored server-side.
    """
    data = await file.read()
    try:
        cas_holdings = json.loads(holdings_json) if holdings_json else []
    except json.JSONDecodeError:
        cas_holdings = []

    result = parse_xls(data, cas_holdings or None)

    trades = [
        TradeRow(
            isin=t.isin or "",          # empty string for unresolved — browser shows warning
            txn_date=t.txn_date,
            side=t.side,
            quantity=t.units,
            price=t.price,
            folio=t.folio or None,
        )
        for t in result.trades
    ]

    return {
        "trades": [t.model_dump(mode="json") for t in trades],
        "unresolved": result.unresolved,
        "skipped": result.skipped,
        "warnings": result.warnings,
    }


@router.post("/parse-zerodha")
async def parse_zerodha(files: list[UploadFile] = File(...)):
    """Accept one or more Zerodha Console tradebook CSVs.
    Merges them chronologically, deduplicates by trade_id across files,
    and returns normalised TradeRow-compatible records.
    """
    from ..parsers.zerodha import merge_zerodha_files

    file_data = [await f.read() for f in files]
    result = merge_zerodha_files(file_data)

    trades = [
        TradeRow(
            isin=t["isin"],
            txn_date=t["txn_date"],
            side=t["side"],
            quantity=t["quantity"],
            price=t["price"],
            folio=None,
        )
        for t in result.trades
    ]

    return {
        "trades": [t.model_dump(mode="json") for t in trades],
        "skipped_fo": result.skipped_fo,
        "skipped_no_isin": result.skipped_no_isin,
        "duplicates_removed": result.duplicate_trade_ids,
        "warnings": result.warnings,
    }


@router.post("/parse-kfin")
async def parse_kfin(file: UploadFile = File(...)):
    """Parse a KFIN (KFintech) MF transaction history XLS/XLSX.
    ISIN is directly in the file — no CAS context needed.
    """
    from ..parsers.kfin import parse_kfin_xls

    data = await file.read()
    result = parse_kfin_xls(data)

    trades = [
        TradeRow(
            isin=t["isin"],
            txn_date=t["txn_date"],
            side=t["side"],
            quantity=t["quantity"],
            price=t["price"],
            folio=t["folio"],
        )
        for t in result.trades
    ]

    return {
        "trades": [t.model_dump(mode="json") for t in trades],
        "skipped": result.skipped,
        "warnings": result.warnings,
    }
