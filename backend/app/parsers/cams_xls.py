"""Parser for CAMS-style MF transaction history XLS.

Columns (0-indexed):
  0  MF_NAME          1  INVESTOR_NAME   2  PAN
  3  FOLIO_NUMBER     4  PRODUCT_CODE    5  SCHEME_NAME
  6  Type             7  TRADE_DATE      8  TRANSACTION_TYPE
  9  DIVIDEND_RATE   10  AMOUNT         11  UNITS
 12  PRICE           13  BROKER

Key facts observed from the real file:
  - No ISIN column. ISINs are resolved via (folio, product_code) → ISIN using
    the holdings already parsed from the CAS (supplied by the caller).
  - Amount and Units are NEGATIVE for purchases in some rows (data quirk where
    the same SIP appears twice with opposite signs — a correction entry). The
    sign of UNITS is the authoritative direction; positive = purchase credit,
    negative = redemption debit. We also check TRANSACTION_TYPE keywords.
  - Redemptions also have negative units.
  - Non-financial rows (Registration of Nominee, Address Updated, Cancelled,
    Invalid Purchase, Systematic Cancellation, Terminated, Refund Payout,
    Change of Bank…) are filtered out by checking that |units| > 0.
  - TRADE_DATE format: "13-DEC-2018"
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from io import BytesIO

import xlrd

DATE_FMT = "%d-%b-%Y"

SKIP_TYPES = {
    "registration of nominee", "address updated from kra data",
    "address updated from kra data - first holder",
    "change of bank mandate - others", "change / regn of nominee",
    "non demat folio - new", "cancelled", "invalid purchase",
    "systematic cancellation", "terminated", "refund payout",
}

REDEMPTION_KEYWORDS = {"redemption", "switch-out", "switch out"}
PURCHASE_KEYWORDS   = {"purchase", "sip", "switch-in", "switch in", "systematic"}


@dataclass
class XlsTrade:
    folio: str
    product_code: str
    scheme_name: str
    txn_date: str          # "YYYY-MM-DD"
    side: str              # "BUY" | "SELL"
    units: float
    price: float
    amount: float
    txn_type: str          # raw TRANSACTION_TYPE for reference
    isin: str | None = None   # resolved later


@dataclass
class XlsParseResult:
    trades: list[XlsTrade] = field(default_factory=list)
    unresolved: list[str] = field(default_factory=list)   # product codes without ISIN
    warnings: list[str] = field(default_factory=list)
    skipped: int = 0


def _classify(txn_type: str) -> str | None:
    """Return 'BUY', 'SELL', or None (skip)."""
    t = txn_type.lower().strip()
    if t in SKIP_TYPES:
        return None
    for kw in REDEMPTION_KEYWORDS:
        if kw in t:
            return "SELL"
    for kw in PURCHASE_KEYWORDS:
        if kw in t:
            return "BUY"
    return None


def _resolve_isins(
    trades: list[XlsTrade],
    cas_holdings: list[dict],
) -> tuple[list[XlsTrade], list[str]]:
    """Match each (folio, product_code) to an ISIN using CAS holdings.

    Strategy:
      1. Exact folio match in CAS holdings.
      2. If a folio has one holding in the CAS, use it directly.
      3. Fallback: try to match scheme names (normalised) between XLS and CAS.
    """
    # Build: folio → list of CAS holdings; also AMC abbrev map
    folio_map: dict[str, list[dict]] = {}
    for h in cas_holdings:
        f = (h.get("folio") or "").strip()
        if f:
            folio_map.setdefault(f, []).append(h)

    # AMC prefix codes from product_code → filter candidates by AMC
    # e.g. "HHDWDG" starts with H → HDFC; "P8042" starts with P → ICICI Pru
    AMC_PREFIX = {
        "B": "aditya birla", "D": "dsp", "H": "hdfc", "K": "kotak",
        "L": "sbi", "O": "hsbc", "P": "icici", "PL": "navi",
        "PP": "ppfas", "Q": "quant", "U": "uti",
    }

    def amc_from_code(code: str) -> str | None:
        for prefix in sorted(AMC_PREFIX, key=len, reverse=True):
            if code.upper().startswith(prefix):
                return AMC_PREFIX[prefix]
        return None

    # Normalise scheme name for fuzzy matching
    def norm(s: str) -> str:
        s = s.lower()
        s = re.sub(r"\(.*?\)", "", s)                        # drop parentheticals
        s = re.sub(r"\b(formerly|erstwhile|old name)\b.*", "", s)
        s = re.sub(r"[^a-z0-9 ]", " ", s)
        s = re.sub(r"\b(fund|plan|growth|direct|regular|gr|dg|reg|dir|formerly|option|mutual)\b", "", s)
        return re.sub(r"\s+", " ", s).strip()

    cas_norm: list[tuple[str, dict]] = [
        (norm(h.get("name", "")), h) for h in cas_holdings
    ]

    unresolved_codes: set[str] = set()
    for t in trades:
        candidates = folio_map.get(t.folio, [])
        if len(candidates) == 1:
            # Single candidate: only accept if scheme names overlap meaningfully.
            # A folio may have had many schemes historically; only the current
            # holding is in the CAS. Don't force-map old redeemed schemes
            # (e.g. HDFC Small Cap) to the current holding (HDFC Developed World).
            h = candidates[0]
            xls_n = norm(t.scheme_name)
            h_n = norm(h.get("name", ""))
            xw = set(xls_n.split()); hw = set(h_n.split())
            score = len(xw & hw) / max(len(xw | hw), 1)
            if score >= 0.35:
                t.isin = h["isin"]
            else:
                unresolved_codes.add(f"{t.product_code} ({t.scheme_name[:40]})")
            continue
        # Filter by AMC prefix before fuzzy match to avoid cross-AMC collisions
        amc = amc_from_code(t.product_code)
        if amc and candidates:
            narrowed = [h for h in candidates if amc in h.get("name", "").lower()]
            if narrowed:
                candidates = narrowed
        # multiple holdings share the folio → pick by scheme name similarity
        pool = candidates if candidates else [h for _, h in cas_norm]
        best, best_score = None, 0
        xls_n = norm(t.scheme_name)
        for h in pool:
            h_n = norm(h.get("name", ""))
            xw = set(xls_n.split()); hw = set(h_n.split())
            score = len(xw & hw) / max(len(xw | hw), 1)
            if score > best_score:
                best_score, best = score, h
        if best and best_score >= 0.30:
            t.isin = best["isin"]
        else:
            unresolved_codes.add(f"{t.product_code} ({t.scheme_name[:40]})")

    return trades, sorted(unresolved_codes)


def parse_xls(
    data: bytes,
    cas_holdings: list[dict] | None = None,
) -> XlsParseResult:
    result = XlsParseResult()
    wb = xlrd.open_workbook(file_contents=data)
    sh = wb.sheets()[0]

    if sh.nrows < 2:
        result.warnings.append("XLS has no data rows.")
        return result

    for r in range(1, sh.nrows):
        def cell(c: int) -> str:
            return str(sh.cell_value(r, c)).strip()

        txn_type = cell(8)
        side = _classify(txn_type)
        if side is None:
            result.skipped += 1
            continue

        try:
            units_raw = float(cell(11)) if cell(11) else 0.0
            price_raw = float(cell(12)) if cell(12) else 0.0
            amount_raw = float(cell(10)) if cell(10) else 0.0
        except ValueError:
            result.skipped += 1
            continue

        if abs(units_raw) < 1e-6:
            result.skipped += 1
            continue

        # Correction pairs: some SIP rows appear as -units then +units on the
        # same date. We keep the row whose units sign matches the side keyword.
        if side == "BUY" and units_raw < 0:
            result.skipped += 1
            continue
        if side == "SELL" and units_raw > 0:
            result.skipped += 1
            continue

        try:
            d = datetime.strptime(cell(7), DATE_FMT).date()
        except ValueError:
            result.skipped += 1
            continue

        result.trades.append(XlsTrade(
            folio=cell(3),
            product_code=cell(4),
            scheme_name=cell(5),
            txn_date=str(d),
            side=side,
            units=abs(units_raw),
            price=price_raw,
            amount=abs(amount_raw),
            txn_type=txn_type,
        ))

    if cas_holdings:
        result.trades, result.unresolved = _resolve_isins(result.trades, cas_holdings)
    else:
        result.warnings.append(
            "No CAS holdings provided — ISINs not resolved. "
            "Upload CAS first, then re-import the XLS."
        )

    if result.unresolved:
        result.warnings.append(
            f"{len(result.unresolved)} product code(s) could not be matched to a CAS holding "
            f"(trades kept without ISIN — upload CAS first to resolve): "
            + "; ".join(result.unresolved[:5])
        )

    return result