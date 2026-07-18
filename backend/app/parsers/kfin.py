"""KFIN (KFintech) MF transaction history parser.

Columns (0-indexed):
  0  FundName          1  Investor Name    2  Account Number (folio)
  3  Product Code      4  Scheme Description  5  Transaction Date
  6  Transaction Description  7  Amount    8  Units
  9  NAV              10  Broker Code     11  Broker Name
 12  SchemeISIN

Key differences from CAMS format:
  - ISIN is directly in column 12 (SchemeISIN) — no fuzzy matching needed
  - Account Number (col 2) is the folio number
  - Redemptions have NEGATIVE amount and NEGATIVE units
  - File is actually .xlsx saved with .xls extension — use openpyxl via BytesIO
  - Date format: DD-Mon-YYYY (e.g. "12-Jan-2023")

Transaction classification:
  - BUY:  Purchase*, Systematic Investment*, New Purchase, Switch Over In
  - SELL: Redemption, Switch Over Out
  - SKIP: Rejection, KYC/Address updates, Refund, rows with zero units
"""
from __future__ import annotations

import io
from dataclasses import dataclass, field
from datetime import datetime

DATE_FORMATS = ("%d-%b-%Y", "%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d")

SKIP_KEYWORDS = (
    "rejection", "kyc", "address", "updation", "refund", "nominee",
    "bank", "changed", "updated", "registered",
)

BUY_KEYWORDS  = ("purchase", "systematic investment", "sys. investment", "sys.invest",
                 "new purchase", "switch over in", "switch in", "sip", "allotment",
                 "reinvestment", "dividend reinvest")
SELL_KEYWORDS = ("redemption", "switch over out", "switch out", "repurchase")


@dataclass
class KfinParseResult:
    trades: list[dict] = field(default_factory=list)
    skipped: int = 0
    warnings: list[str] = field(default_factory=list)


def _parse_date(s: str) -> str | None:
    s = str(s).strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _classify(desc: str) -> str | None:
    d = desc.lower().strip()
    if any(kw in d for kw in SKIP_KEYWORDS):
        return None
    if any(kw in d for kw in SELL_KEYWORDS):
        return "SELL"
    if any(kw in d for kw in BUY_KEYWORDS):
        return "BUY"
    return None


def parse_kfin_xls(data: bytes) -> KfinParseResult:
    result = KfinParseResult()

    try:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
    except Exception as exc:
        result.warnings.append(f"Could not open KFIN file: {exc}")
        return result

    sh = wb.active
    rows = list(sh.iter_rows(values_only=True))
    if not rows:
        result.warnings.append("Empty file.")
        return result

    # Detect header row (may not be row 0 in all exports)
    header_row = 0
    for i, row in enumerate(rows[:5]):
        vals = [str(v).lower().strip() if v else "" for v in row]
        if "schemeisin" in vals or "transaction date" in vals or "transactiondate" in vals:
            header_row = i
            break

    headers = [str(v).lower().strip().replace(" ", "_") if v else "" for v in rows[header_row]]

    def col(name: str) -> int | None:
        """Find column index by name fragment."""
        for i, h in enumerate(headers):
            if name in h:
                return i
        return None

    c_isin   = col("isin")        or 12
    c_folio  = col("account")     or 2
    c_date   = col("transaction_date") or col("date") or 5
    c_desc   = col("transaction_description") or col("description") or 6
    c_amount = col("amount")      or 7
    c_units  = col("units")       or 8
    c_nav    = col("nav")         or 9
    c_name   = col("scheme_description") or col("scheme") or 4

    for row in rows[header_row + 1:]:
        if not any(row):
            continue

        def cell(c: int) -> str:
            v = row[c] if c < len(row) else None
            return str(v).strip() if v is not None else ""

        isin = cell(c_isin)
        if not isin or not isin.startswith("IN"):
            result.skipped += 1
            continue

        desc  = cell(c_desc)
        side  = _classify(desc)
        if side is None:
            result.skipped += 1
            continue

        txn_date = _parse_date(cell(c_date))
        if not txn_date:
            result.skipped += 1
            continue

        try:
            units_raw  = float(cell(c_units))
            amount_raw = float(cell(c_amount))
            nav_raw    = float(cell(c_nav)) if cell(c_nav) else 0.0
        except (ValueError, TypeError):
            result.skipped += 1
            continue

        if abs(units_raw) < 1e-6:
            result.skipped += 1
            continue

        # Normalise: KFIN uses negative for redemptions
        quantity = abs(units_raw)
        price    = abs(amount_raw) / quantity if quantity else nav_raw

        result.trades.append({
            "isin":     isin,
            "txn_date": txn_date,
            "side":     side,
            "quantity": quantity,
            "price":    round(price, 4),
            "folio":    cell(c_folio) or None,
            "symbol":   None,
        })

    result.trades.sort(key=lambda t: t["txn_date"])
    return result
