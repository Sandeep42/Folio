"""NSDL / CDSL Consolidated Account Statement parser.

CDSL CAS layout (verified against a real statement): PyMuPDF's text
extraction emits one table CELL per line. Rows look like:

  Demat holdings ("HOLDING STATEMENT AS ON <date>"):
      <ISIN> / <name lines...> / qty / -- / -- / -- / free_bal / price / value

  MF folio units ("MUTUAL FUND UNITS HELD AS ON <date>"):
      <name lines...> / <ISIN> [folio] / [folio] / units / nav /
      invested / valuation / pnl / pnl%

The same ISINs also appear in "Account Details" pages and in
"STATEMENT OF TRANSACTIONS" sections — those must NOT be parsed as
holdings, so parsing is gated by a section state machine. A generic
line-based fallback (for NSDL-style single-line rows) runs only if the
section parser finds nothing.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime

import fitz  # PyMuPDF

ISIN_RE = re.compile(r"\bIN[EF][A-Z0-9]{9}\b")
PURE_NUM = re.compile(r"^-?[\d,]*\.?\d+$")          # a line that is ONLY a number
SCHEME_CODE = re.compile(r"^[A-Z0-9]{1,6}\s*-\s+")   # "NID2 - ", "02GZ - "
AS_ON = re.compile(r"AS ON\s+(\d{2}-\d{2}-\d{4})")

HEADER_WORDS = {
    "isin", "security", "scheme name", "folio no.", "folio no", "nav (`)", "nav (₹)",
    "closing", "bal", "(units)", "cumulative", "amount", "invested (in", "inr)",
    "valuation (`)", "unrealised", "profit/loss", "sed", "profit/", "loss(%)",
    "current", "frozen", "pledge", "setup", "free bal", "market", "price /",
    "face", "value", "value (`)", "grand total", "unreali­",
}


@dataclass
class ParsedHolding:
    isin: str
    name: str
    asset_type: str            # "stock" | "mutual_fund"
    quantity: float
    nav_or_price: float | None = None
    value: float | None = None
    avg_cost: float | None = None
    invested: float | None = None
    folio: str | None = None


@dataclass
class ParseResult:
    holdings: list[ParsedHolding] = field(default_factory=list)
    statement_period: str | None = None
    as_of: date | None = None
    warnings: list[str] = field(default_factory=list)
    skipped_lines: int = 0


def _num(s: str) -> float | None:
    try:
        return float(s.replace(",", ""))
    except ValueError:
        return None


def _numeric_cells(line: str) -> list[float] | None:
    """If every whitespace token is a number or '--', return the numbers.
    PyMuPDF sometimes merges adjacent cells onto one line ('-- 16918.000',
    '272.0100 46,01,865.18'), so cell parsing must be token-level."""
    toks = line.split()
    vals: list[float] = []
    for t in toks:
        if t == "--":
            continue
        if PURE_NUM.match(t):
            v = _num(t)
            if v is None:
                return None
            vals.append(v)
        else:
            return None
    return vals


def _is_header(line: str) -> bool:
    return line.lower().strip() in HEADER_WORDS or not line.isascii()


def _clean_demat_name(raw: str, isin: str) -> str:
    """'NIPPON LIFE INDIA AM LTD#NIPPON INDIA MF-...ETF NIFTY 50 BEES'
       -> fund part for INF, issuer part for INE."""
    parts = [p.strip() for p in raw.split("#")]
    if len(parts) > 1:
        raw = parts[0] if isin.startswith("INE") else parts[-1]
        # drop the "XYZ MF-" prefix AMCs put before the scheme name
        raw = re.sub(r"^.*? MF-", "", raw)
    return re.sub(r"\s{2,}", " ", raw).strip(" -")[:120]


def open_pdf(data: bytes, password: str | None) -> fitz.Document:
    doc = fitz.open(stream=data, filetype="pdf")
    if doc.needs_pass:
        if not password or not doc.authenticate(password):
            raise ValueError(
                "PDF is password protected — the password is normally your PAN in capitals."
            )
    return doc


# ---------------------------------------------------------------- sections
def _parse_sections(lines: list[str], result: ParseResult) -> list[ParsedHolding]:
    holdings: list[ParsedHolding] = []
    mode = "skip"                       # skip | demat | mf
    row: dict | None = None
    name_buf: list[str] = []

    def flush_demat():
        nonlocal row
        if row and len(row["nums"]) >= 4:
            nums = row["nums"]
            qty, free_bal, price, value = nums[0], nums[-3], nums[-2], nums[-1]
            holdings.append(ParsedHolding(
                isin=row["isin"],
                name=_clean_demat_name(" ".join(row["name"]), row["isin"]),
                asset_type="stock" if row["isin"].startswith("INE") else "mutual_fund",
                quantity=qty, nav_or_price=price, value=value,
            ))
        elif row:
            result.skipped_lines += 1
        row = None

    def flush_mf():
        nonlocal row
        if row and len(row["nums"]) >= 6:
            units, nav, invested, valuation = row["nums"][:4]
            name = re.sub(SCHEME_CODE, "", " ".join(row["name"]).strip())
            avg = round(invested / units, 4) if units else None
            holdings.append(ParsedHolding(
                isin=row["isin"], name=name[:120], asset_type="mutual_fund",
                quantity=units, nav_or_price=nav, value=valuation,
                invested=invested, avg_cost=avg, folio=row["folio"],
            ))
        elif row:
            result.skipped_lines += 1
        row = None

    for line in lines:
        up = line.upper()

        # --- section transitions -----------------------------------------
        if "STATEMENT OF TRANSACTIONS" in up or "LOAD STRUCTURES" in up \
           or "NOTES TO CAS" in up:
            flush_demat() if mode == "demat" else flush_mf() if mode == "mf" else None
            mode = "skip"
            continue
        if "HOLDING STATEMENT AS ON" in up:
            mode, row, name_buf = "demat", None, []
            m = AS_ON.search(up)
            if m and not result.as_of:
                result.as_of = datetime.strptime(m.group(1), "%d-%m-%Y").date()
            continue
        if "MUTUAL FUND UNITS HELD AS ON" in up:
            flush_demat() if mode == "demat" else None
            mode, row, name_buf = "mf", None, []
            m = AS_ON.search(up)
            if m and not result.as_of:
                result.as_of = datetime.strptime(m.group(1), "%d-%m-%Y").date()
            continue
        if mode == "skip":
            continue
        if "GRAND TOTAL" in up or up.startswith("PORTFOLIO VALUE"):
            flush_demat() if mode == "demat" else flush_mf()
            continue

        isin_m = ISIN_RE.search(line)

        # --- demat mode: ISIN first, then name lines, then numeric cells --
        if mode == "demat":
            if isin_m:
                flush_demat()
                row = {"isin": isin_m.group(0), "name": [], "nums": []}
                continue
            if row is None:
                continue
            cells = _numeric_cells(line)
            if cells is not None:
                row["nums"].extend(cells)
                if len(row["nums"]) >= 4:
                    flush_demat()
            elif not _is_header(line):
                row["name"].append(line)

        # --- mf mode: name lines first, then ISIN [folio], then 6 numbers -
        elif mode == "mf":
            if isin_m:
                flush_mf()
                rest = line.replace(isin_m.group(0), "").strip()
                row = {"isin": isin_m.group(0), "name": name_buf[-6:], "nums": [],
                       "folio": None}
                name_buf = []
                if rest:
                    toks = rest.split()
                    row["folio"] = toks[0]
                    for t in toks[1:]:
                        v = _num(t) if PURE_NUM.match(t) else None
                        if v is not None:
                            row["nums"].append(v)
                continue
            if row is not None:
                if row["folio"] is None:
                    toks = line.split()
                    row["folio"] = toks[0]
                    for t in toks[1:]:
                        v = _num(t) if PURE_NUM.match(t) else None
                        if v is not None:
                            row["nums"].append(v)
                    continue
                cells = _numeric_cells(line)
                if cells is not None:
                    row["nums"].extend(cells)
                    if len(row["nums"]) >= 6:
                        flush_mf()
                    continue
                # unexpected text mid-row: treat as next row's name
                flush_mf()
                if not _is_header(line):
                    name_buf.append(line)
            else:
                if not _is_header(line) and _numeric_cells(line) is None:
                    name_buf.append(line)
                elif _is_header(line):
                    name_buf = []

    flush_demat() if mode == "demat" else flush_mf() if mode == "mf" else None
    return holdings


# ---------------------------------------------------- generic NSDL fallback
def _parse_generic(lines: list[str], result: ParseResult) -> list[ParsedHolding]:
    """Single-line rows: '<ISIN> NAME qty price value' (older NSDL layouts)."""
    NUM = re.compile(r"-?[\d,]+\.?\d*")
    out: list[ParsedHolding] = []
    for i, line in enumerate(lines):
        m = ISIN_RE.search(line)
        if not m:
            continue
        isin = m.group(0)
        own = ISIN_RE.sub("", line)
        nums = [n for n in (_num(x) for x in NUM.findall(own)) if n is not None]
        if len(nums) < 2 and i + 1 < len(lines) and not ISIN_RE.search(lines[i + 1]) \
           and not re.search(r"folio", lines[i + 1], re.IGNORECASE):
            nums += [n for n in (_num(x) for x in NUM.findall(lines[i + 1])) if n is not None]
        if not nums:
            result.skipped_lines += 1
            continue
        name = re.sub(r"(?:\s+-?[\d,]+\.?\d*)+$", "", re.sub(r"\s{2,}", " ", own)).strip(" -:")
        h = ParsedHolding(isin=isin, name=name[:120] or isin,
                          asset_type="stock" if isin.startswith("INE") else "mutual_fund",
                          quantity=nums[0])
        if len(nums) >= 3:
            h.nav_or_price, h.value = nums[1], nums[-1]
        elif len(nums) == 2:
            h.value = nums[1]
        ctx = " ".join(lines[max(0, i - 2):i + 1])
        fol = re.search(r"Folio\s*(?:No)?\.?\s*:?\s*([0-9]{6,12}\s*/?\s*[0-9]*)", ctx, re.IGNORECASE)
        if fol and isin.startswith("INF"):
            h.folio = fol.group(1).replace(" ", "")
        out.append(h)
    return out


# ------------------------------------------------------------------ main
def parse_cas(data: bytes, password: str | None = None) -> ParseResult:
    doc = open_pdf(data, password)
    result = ParseResult()
    full_text = "\n".join(page.get_text("text") for page in doc)
    doc.close()

    m = re.search(r"FOR THE PERIOD FROM\s+(\d{2}-\d{2}-\d{4})\s+TO\s+(\d{2}-\d{2}-\d{4})",
                  full_text, re.IGNORECASE)
    if m:
        result.statement_period = f"{m.group(1)} to {m.group(2)}"
        if not result.as_of:
            result.as_of = datetime.strptime(m.group(2), "%d-%m-%Y").date()

    lines = [ln.strip() for ln in full_text.splitlines() if ln.strip()]

    # Lines repeated on many pages (letterhead, nav tabs, holder name box)
    # are boilerplate; drop them so they can't pollute names or rows.
    # Never drop numbers, '--', or ISIN-bearing lines.
    n_pages = max(1, full_text.count("\x0c") + 1, len(re.findall(r"Page \d+ of \d+", full_text)))
    freq: dict[str, int] = {}
    for ln in lines:
        if ln != "--" and not PURE_NUM.match(ln) and not ISIN_RE.search(ln):
            freq[ln] = freq.get(ln, 0) + 1
    boiler = {ln for ln, c in freq.items() if c >= max(3, int(n_pages * 0.4))}
    lines = [ln for ln in lines
             if ln not in boiler and not re.match(r"^Page \d+ of \d+$", ln)]

    holdings = _parse_sections(lines, result)
    if not holdings:
        holdings = _parse_generic(lines, result)
        if holdings:
            result.warnings.append("Parsed with generic fallback (non-CDSL layout); verify quantities.")

    # Merge duplicates: same ISIN across demat accounts merges; folios stay separate
    merged: dict[str, ParsedHolding] = {}
    for h in holdings:
        key = f"{h.isin}:{h.folio}" if h.folio else h.isin
        if key in merged:
            m0 = merged[key]
            m0.quantity += h.quantity
            m0.value = (m0.value or 0) + (h.value or 0)
            m0.invested = (m0.invested or 0) + (h.invested or 0) or None
            if m0.invested and m0.quantity:
                m0.avg_cost = round(m0.invested / m0.quantity, 4)
        else:
            merged[key] = h

    result.holdings = [h for h in merged.values() if h.quantity > 0]
    if not result.holdings:
        result.warnings.append(
            "No holdings recognised — layout may differ from known NSDL/CDSL formats. "
            "Extract the text and adjust parsers/nsdl_cdsl.py."
        )
    if result.skipped_lines:
        result.warnings.append(f"{result.skipped_lines} rows had unreadable numbers and were skipped.")
    return result
