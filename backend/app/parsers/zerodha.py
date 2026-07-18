"""Zerodha Console tradebook CSV parser.

Download from: Zerodha Console → Reports → Tradebook → select FY → Download

Format (all equity segments):
  symbol, isin, trade_date, exchange, segment, series,
  trade_type, quantity, price, trade_id, order_id, order_execution_time

Key behaviours:
  - Contains equity (EQ), F&O (FO), currency (CD), commodity — we keep EQ only
  - trade_type is lowercase "buy" / "sell"
  - trade_date is YYYY-MM-DD
  - isin is present for EQ rows, empty for F&O/currency
  - Multiple FY files can be merged — duplicates detected by trade_id

Also handles the older Zerodha format which had slightly different column names
(Trade Date, Buy/Sell, Quantity, Price) — auto-detected by header inspection.
"""
from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from datetime import datetime


DATE_FORMATS = ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d-%b-%Y", "%Y/%m/%d")


@dataclass
class ZerodhaParseResult:
    trades: list[dict] = field(default_factory=list)   # normalised TradeRow-compatible dicts
    skipped_fo: int = 0
    skipped_no_isin: int = 0
    duplicate_trade_ids: int = 0
    warnings: list[str] = field(default_factory=list)


def _parse_date(s: str) -> str:
    s = s.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f"Unrecognised date: {s!r}")


def _detect_format(fieldnames: list[str]) -> str:
    """Return 'new' or 'old' based on header."""
    names = {f.lower().strip() for f in fieldnames}
    if "trade_type" in names and "isin" in names:
        return "new"
    if "buy/sell" in names or "trade type" in names:
        return "old"
    return "new"  # assume new


def parse_zerodha_csv(
    data: bytes,
    seen_trade_ids: set[str] | None = None,
) -> ZerodhaParseResult:
    result = ZerodhaParseResult()
    if seen_trade_ids is None:
        seen_trade_ids = set()
    text = data.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        result.warnings.append("Empty CSV.")
        return result

    fmt = _detect_format(reader.fieldnames)
    # normalise column names
    cols = {f.lower().strip().replace(" ", "_"): f for f in reader.fieldnames}

    seen_trade_ids_set: set[str] = seen_trade_ids  # use the passed-in set

    for row in reader:
        def get(key: str, alt: str = "") -> str:
            col = cols.get(key) or cols.get(alt)
            return row[col].strip() if col and row.get(col) else ""

        # Filter non-equity
        segment = get("segment").upper()
        if segment and segment not in ("EQ", "BE", "BL", ""):
            result.skipped_fo += 1
            continue

        isin = get("isin")
        if not isin or not isin.startswith("IN"):
            result.skipped_no_isin += 1
            continue

        # Deduplicate by trade_id across multiple files
        trade_id = get("trade_id")
        if trade_id:
            if trade_id in seen_trade_ids_set:
                result.duplicate_trade_ids += 1
                continue
            seen_trade_ids_set.add(trade_id)

        # Side
        if fmt == "new":
            raw_side = get("trade_type").lower()
        else:
            raw_side = get("buy/sell", "trade_type").lower()
        if raw_side in ("buy", "b"):
            side = "BUY"
        elif raw_side in ("sell", "s"):
            side = "SELL"
        else:
            result.warnings.append(f"Unknown trade_type {raw_side!r} — skipped.")
            continue

        # Date
        raw_date = get("trade_date", "date")
        try:
            txn_date = _parse_date(raw_date)
        except ValueError:
            result.warnings.append(f"Bad date {raw_date!r} — skipped.")
            continue

        try:
            quantity = float(get("quantity"))
            price = float(get("price"))
        except ValueError:
            result.warnings.append(f"Non-numeric quantity/price on {txn_date} — skipped.")
            continue

        if quantity <= 0 or price <= 0:
            continue

        result.trades.append({
            "isin": isin,
            "txn_date": txn_date,
            "side": side,
            "quantity": quantity,
            "price": price,
            "folio": None,
            "symbol": get("symbol") or None,
        })

    return result


def merge_zerodha_files(files: list[bytes]) -> ZerodhaParseResult:
    """Parse and merge multiple Zerodha tradebook CSVs (e.g. one per FY).
    A single seen_trade_ids set is shared across all files so overlapping
    re-exports (where the same trade appears in two FY downloads) are deduped.
    """
    merged = ZerodhaParseResult()
    seen_trade_ids: set[str] = set()   # shared across all files

    for data in files:
        r = parse_zerodha_csv(data, seen_trade_ids)
        merged.trades.extend(r.trades)
        merged.skipped_fo += r.skipped_fo
        merged.skipped_no_isin += r.skipped_no_isin
        merged.duplicate_trade_ids += r.duplicate_trade_ids
        merged.warnings.extend(r.warnings)

    merged.trades.sort(key=lambda t: t["txn_date"])
    return merged
