"""Parser for CAMS/KFintech Consolidated Account Statement (CAS) PDF.

This is a single file that replaces the old multi-file flow:
  - NSDL/CDSL CAS PDF  (holdings only)
  - CAMS XLS           (MF transaction history)
  - KFIN XLS           (MF transaction history)

The CAMS/KFintech CAS PDF contains both holdings AND full transaction
history for every mutual fund folio, covering a date range.

Layout (PyMuPDF emits each table CELL on its own line — no tabular spacing):

  <Scheme Name> - ISIN: <ISIN>(Advisor: ...)
  Registrar : CAMS|KFINTECH
  Folio No: <folio>
  <Holder Name>
   Nominee 1: ...
   Opening Unit Balance: 0.000
  <Date>          ← one cell per line
  <Amount>
  <Price>
  <Units>
  <Transaction Type / Running Balance>  ← may interleave
  ...
  NAV on <date>: INR <nav>
  Market Value on <date>: INR <mv>
  Closing Unit Balance: <units>
  Total Cost Value: <cost>
  PAN: <PAN>
  KYC: OK  PAN: OK
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from collections import Counter

import fitz  # PyMuPDF


# ── helpers ────────────────────────────────────────────────────────────────

DATE_RE = re.compile(r"^\d{2}-[A-Z][a-z]{2}-\d{4}$")
ISIN_RE = re.compile(r"\bIN[EF][A-Z0-9]{9}\b")
NUM_RE = re.compile(r"^\(?([\d,]+\.?\d*)\)?$")
CLOSING_LABELS = {
    "NAV on ", "Market Value on ", "Closing Unit Balance:", "Total Cost Value:",
}

# Lines that appear on every page as table headers — safe to remove everywhere.
PAGE_BOILERPLATE = {
    "Date", "Amount", "Price", "Units", "Transaction", "Unit", "Balance",
    "(INR)", "Cost Value", "Market Value", "PORTFOLIO SUMMARY",
    "Mutual Fund", "Total", "Consolidated Account Statement",
}


def _parse_date(s: str) -> str | None:
    try:
        return datetime.strptime(s.strip(), "%d-%b-%Y").date().isoformat()
    except ValueError:
        return None


def _parse_num(s: str) -> float | None:
    s = s.strip().replace(",", "")
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()")
    try:
        v = float(s)
        return -v if neg else v
    except ValueError:
        return None


def _is_num(s: str) -> bool:
    return bool(re.match(r"^\(?[\d,]+\.?\d*\)?$", s.strip()))


# ── transaction classification ─────────────────────────────────────────────

BUY_KW = ("purchase", "sip", "systematic investment", "sys. investment",
           "sys.invest", "new purchase", "switch in", "switch-in",
           "allotment", "reinvestment", "dividend reinvest")

SELL_KW = ("redemption", "switch out", "switch-out", "repurchase")
SKIP_KW = ("stamp duty", "stt paid", "registration of nominee",
           "address updated", "invalid purchase", "cancelled",
           "sipterminated", "sipcancelled", "refund payout",
           "refund", "non demat folio", "sip terminated")


def _classify(txn_text: str, units_val: float) -> str | None:
    lower = txn_text.lower().strip()
    if "reversed" in lower:
        return "SELL" if units_val < 0 else "BUY"
    for kw in SKIP_KW:
        if kw in lower:
            return None
    for kw in SELL_KW:
        if kw in lower:
            return "SELL"
    for kw in BUY_KW:
        if kw in lower:
            return "BUY"
    return "SELL" if units_val < 0 else "BUY"


# ── data models ────────────────────────────────────────────────────────────

@dataclass
class ParsedHolding:
    isin: str
    name: str
    quantity: float
    nav: float | None = None
    market_value: float | None = None
    avg_cost: float | None = None
    folio: str | None = None
    registrar: str | None = None


@dataclass
class ParsedTrade:
    isin: str  # filled in at flush time
    txn_date: str
    side: str
    quantity: float
    price: float
    amount: float
    folio: str | None = None


@dataclass
class CamsKfinParseResult:
    holdings: list[ParsedHolding] = field(default_factory=list)
    trades: list[ParsedTrade] = field(default_factory=list)
    statement_period: str | None = None
    as_of: str | None = None
    warnings: list[str] = field(default_factory=list)
    skipped_txns: int = 0


# ── PDF open ───────────────────────────────────────────────────────────────

def open_pdf(data: bytes, password: str | None) -> fitz.Document:
    doc = fitz.open(stream=data, filetype="pdf")
    if doc.needs_pass:
        if not password or not doc.authenticate(password):
            raise ValueError(
                "PDF is password protected — the password is normally your PAN in capitals."
            )
    return doc


# Product code prefix pattern (CAMS/KFintech scheme codes like B02G-, 128SCDGG-)
PROD_CODE_RE = re.compile(r"^[A-Z0-9]{3,8}-")

def _clean_name(name: str) -> str:
    """Remove RTA product code prefixes and clean up scheme names."""
    name = PROD_CODE_RE.sub("", name).strip(" -")
    # Fix common PDF extraction artefacts
    name = re.sub(r"\s+", " ", name)          # collapse whitespace
    name = re.sub(r"\(Non.?Demat\)", "", name)  # remove (Non-Demat) suffix
    name = re.sub(r"\(Demat\)", "", name)
    name = name.strip(" -")
    return name[:120]

def parse_cams_kfin_cas(data: bytes, password: str | None = None) -> CamsKfinParseResult:
    doc = open_pdf(data, password)
    full_text = "\n".join(page.get_text("text") for page in doc)
    doc.close()

    result = CamsKfinParseResult()

    # Extract statement period from first page
    m = re.search(r"(\d{2}-[A-Z][a-z]{2}-\d{4})\s+To\s+(\d{2}-[A-Z][a-z]{2}-\d{4})",
                  full_text[:2000], re.IGNORECASE)
    if m:
        result.statement_period = f"{m.group(1)} to {m.group(2)}"

    # Collect and clean lines
    raw = [ln.strip() for ln in full_text.splitlines() if ln.strip()]

    # Remove page-level boilerplate only (not frequency-based, not data)
    n_pages = max(1, full_text.count("\x0c") + 1)
    freq = Counter(ln for ln in raw if not _is_num(ln) and not ISIN_RE.search(ln)
                   and "***" not in ln and not DATE_RE.match(ln)
                   and not any(ln.startswith(lb) for lb in CLOSING_LABELS)
                   and not ln.startswith("Folio No:") and not ln.startswith("Registrar :")
                   and not ln.startswith("Opening Unit Balance:") and not ln.startswith("Nominee")
                   and not ln.startswith("PAN:") and not ln.startswith("KYC:")
                   and "INR" not in ln and not ln.startswith("W.e.f"))
    _TH = max(4, int(n_pages * 0.4))
    boiler = {ln for ln, c in freq.items() if c >= _TH}
    # Add known page-level headers
    boiler.update(PAGE_BOILERPLATE)
    # Also add AMC header lines (they repeat but aren't data)
    amc_headers = {ln for ln in raw if "Mutual Fund" in ln}
    boiler.update(amc_headers)

    lines = [ln for ln in raw
             if ln not in boiler and not re.match(r"^Page \d+ of \d+$", ln)
             and not ln.startswith("CAMSCASWS")]

    # ── state machine ──────────────────────────────────────────────────
    cur_isin: str | None = None
    cur_scheme: str | None = None
    cur_folio: str | None = None
    cur_registrar: str | None = None
    in_folio = False
    reading_txns = False

    folio_trades: list[ParsedTrade] = []
    clos_nav: float | None = None
    clos_mv: float | None = None
    clos_units: float | None = None
    tot_cost: float | None = None
    as_of_date: str | None = None

    def flush_folio():
        nonlocal cur_isin, cur_scheme, cur_folio, cur_registrar
        nonlocal folio_trades, clos_nav, clos_mv, clos_units, tot_cost
        if not cur_isin:
            return
        if clos_units and clos_units > 0:
            avg = round(tot_cost / clos_units, 4) if tot_cost and clos_units else None
            result.holdings.append(ParsedHolding(
                isin=cur_isin, name=(cur_scheme or "")[:120],
                quantity=clos_units, nav=clos_nav,
                market_value=clos_mv, avg_cost=avg,
                folio=cur_folio, registrar=cur_registrar,
            ))
        for t in folio_trades:
            t.isin = cur_isin
            t.folio = cur_folio
            result.trades.append(t)

    def reset():
        nonlocal cur_isin, cur_scheme, cur_folio, cur_registrar
        nonlocal folio_trades, clos_nav, clos_mv, clos_units, tot_cost
        nonlocal in_folio, reading_txns
        cur_isin = cur_scheme = cur_folio = cur_registrar = None
        folio_trades = []
        clos_nav = clos_mv = clos_units = tot_cost = None
        in_folio = reading_txns = False

    i = 0
    # buffer last non-boiler line to catch wrapped scheme names
    prev_data_line: str | None = None

    while i < len(lines):
        ln = lines[i]

        # ── ISIN line — new folio ───────────────────────────────────────
        isin_m = ISIN_RE.search(ln)
        if isin_m:
            if cur_isin and in_folio:
                flush_folio()
            reset()
            cur_isin = isin_m.group(0)
            # Extract scheme name: everything before ISIN
            if " - ISIN:" in ln:
                raw_name = ln.split(" - ISIN:")[0].strip(" -")
            elif " - " in ln:
                raw_name = ln.split(" - ")[0].strip()
            else:
                raw_name = ln[:120]
            raw_name = raw_name.split("(Advisor:")[0].strip(" -")[:120]

            # If the name looks truncated (starts with lowercase/Fund) etc.),
            # try joining with the previous data line
            if prev_data_line and (
                raw_name.startswith("Fund") or
                raw_name.startswith("fund") or
                raw_name.startswith("-") or
                len(raw_name) < 15
            ):
                # Remove product code prefix from prev line if present
                prev = re.sub(r"^[A-Z0-9]{3,8}-", "", prev_data_line).strip(" -")
                raw_name = (prev + " " + raw_name).strip()
                # Fix doubled words from the join
                raw_name = re.sub(r"(\w+)\s+\1", r"\1", raw_name)

            cur_scheme = _clean_name(raw_name)
            in_folio = True
            reading_txns = False
            prev_data_line = None
            i += 1
            continue

        # Track previous non-boiler data line for scheme name continuation
        # (do this before any continue so it captures out-of-folio lines too)
        if not isin_m:
            if ln and not _is_num(ln) and "***" not in ln and not DATE_RE.match(ln) \
               and not ln.startswith("Folio No:") and not ln.startswith("Registrar :") \
               and not any(ln.startswith(lb) for lb in CLOSING_LABELS) \
               and not ln.startswith("Nominee") and not ln.startswith("Opening Unit Balance:"):
                prev_data_line = ln

        if not in_folio:
            i += 1
            continue

        # ── folio metadata ──────────────────────────────────────────────
        if ln.startswith("Folio No:"):
            cur_folio = ln.split("Folio No:", 1)[1].strip().split(" / ")[0]
            i += 1
            continue
        if ln.startswith("Registrar :"):
            cur_registrar = ln.split("Registrar :", 1)[1].strip()
            i += 1
            continue
        if ln.startswith("Opening Unit Balance:"):
            reading_txns = True
            i += 1
            continue

        if not reading_txns:
            i += 1
            continue

        # ── closing data ────────────────────────────────────────────────
        if ln.startswith("NAV on "):
            mm = re.search(r"INR\s+([\d,]+\.?\d*)", ln)
            if mm:
                clos_nav = float(mm.group(1).replace(",", ""))
            dm = re.search(r"(\d{2}-[A-Z][a-z]{2}-\d{4})", ln)
            if dm:
                as_of_date = _parse_date(dm.group(1))
            i += 1
            continue
        if ln.startswith("Market Value on "):
            mm = re.search(r"INR\s+([\d,]+\.?\d*)", ln)
            if mm:
                clos_mv = float(mm.group(1).replace(",", ""))
            i += 1
            continue
        if ln.startswith("Closing Unit Balance:"):
            mm = re.search(r"([\d,]+\.?\d*)", ln)
            if mm:
                clos_units = float(mm.group(1).replace(",", ""))
            i += 1
            continue
        if ln.startswith("Total Cost Value:"):
            mm = re.search(r"([\d,]+\.?\d*)", ln)
            if mm:
                tot_cost = float(mm.group(1).replace(",", ""))
            i += 1
            continue
        if ln.startswith("PAN:"):
            flush_folio()
            reset()
            i += 1
            continue
        if ln.startswith("KYC:"):
            i += 1
            continue

        # ── non-financial marker ─────────────────────────────────────────
        if "***" in ln:
            i += 1
            continue

        # ── transaction row ──────────────────────────────────────────────
        if DATE_RE.match(ln):
            txn_date_str = ln.strip()
            ahead = i + 1

            # Skip boiler between items
            while ahead < len(lines) and lines[ahead] in boiler:
                ahead += 1

            # Skip non-financial *** entries
            if ahead < len(lines) and "***" in lines[ahead]:
                result.skipped_txns += 1
                i = ahead
                while i < len(lines) and "***" in lines[i]:
                    i += 1
                continue

            # Must be a financial transaction — expect amount next
            if ahead < len(lines) and _is_num(lines[ahead]):
                amt_val = _parse_num(lines[ahead]) or 0.0
                ahead += 1
                while ahead < len(lines) and lines[ahead] in boiler:
                    ahead += 1
            else:
                result.skipped_txns += 1
                i += 1
                continue

            # Price
            if ahead < len(lines) and _is_num(lines[ahead]):
                price_val = _parse_num(lines[ahead]) or 0.0
                ahead += 1
                while ahead < len(lines) and lines[ahead] in boiler:
                    ahead += 1
            else:
                price_val = 0.0

            # Units
            if ahead < len(lines) and _is_num(lines[ahead]):
                units_val = _parse_num(lines[ahead]) or 0.0
                ahead += 1
                while ahead < len(lines) and lines[ahead] in boiler:
                    ahead += 1
            else:
                units_val = 0.0

            # Transaction type + running balance — collect until
            # next date, PAN, closing label, or ***
            txn_parts: list[str] = []
            while ahead < len(lines):
                l = lines[ahead]
                if DATE_RE.match(l) or l.startswith("PAN:") or l.startswith("KYC:"):
                    break
                if any(l.startswith(lb) for lb in CLOSING_LABELS):
                    break
                if "***" in l:
                    break
                if l in boiler:
                    ahead += 1
                    continue
                # If this is a number and the NEXT token is a break,
                # it's the running balance — consume and stop
                if _is_num(l):
                    peek = ahead + 1
                    while peek < len(lines) and lines[peek] in boiler:
                        peek += 1
                    if peek >= len(lines) or DATE_RE.match(lines[peek]) or \
                       lines[peek].startswith("PAN:") or lines[peek].startswith("KYC:") or \
                       any(lines[peek].startswith(lb) for lb in CLOSING_LABELS) or \
                       "***" in lines[peek]:
                        ahead += 1
                        break
                txn_parts.append(l)
                ahead += 1

            txn_text = " ".join(txn_parts).strip()

            if abs(units_val) < 1e-6:
                result.skipped_txns += 1
                i = ahead
                continue

            side = _classify(txn_text, units_val)
            if side is None:
                result.skipped_txns += 1
                i = ahead
                continue

            if price_val == 0.0 and abs(units_val) > 1e-6:
                price_val = abs(amt_val) / abs(units_val)

            folio_trades.append(ParsedTrade(
                isin="", txn_date=_parse_date(txn_date_str) or txn_date_str,
                side=side, quantity=abs(units_val),
                price=round(price_val, 4), amount=abs(amt_val),
            ))
            i = ahead
            continue

        i += 1

    # Flush last folio
    if cur_isin and in_folio:
        flush_folio()

    # Merge holdings with same ISIN:folio key
    merged: dict[str, ParsedHolding] = {}
    for h in result.holdings:
        key = f"{h.isin}:{h.folio}" if h.folio else h.isin
        existing = merged.get(key)
        if existing:
            existing.quantity += h.quantity
            existing.market_value = (existing.market_value or 0) + (h.market_value or 0)
            if existing.quantity and existing.market_value:
                existing.nav = round(existing.market_value / existing.quantity, 4)
            if tot_cost and existing.quantity:
                existing.avg_cost = round(tot_cost / existing.quantity, 4)
        else:
            merged[key] = h
    result.holdings = [h for h in merged.values() if h.quantity > 0]

    if as_of_date:
        result.as_of = as_of_date
    if not result.holdings:
        result.warnings.append(
            "No holdings or transactions recognised. "
            "The PDF layout may differ from the expected CAMS/KFintech CAS format."
        )
    if result.skipped_txns:
        result.warnings.append(f"{result.skipped_txns} non-financial rows skipped.")

    return result
