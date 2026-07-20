"""Stateless analysis: the browser POSTs its portfolio (holdings + trades),
the server prices it, computes XIRR and the tax-harvest report in memory,
and returns everything. Nothing is persisted server-side.
"""
from __future__ import annotations

import re
from datetime import date

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool

from ..models import (AnalyzeRequest, AssetType, CostBasisType, Holding,
                      HoldingView, Lot, PortfolioSummary, Transaction)
from ..services import prices as price_svc
from ..services.tax_harvest import build_report, classify_term
from ..services.xirr import xirr

router = APIRouter(prefix="/api", tags=["analyze"])

_ZERO_SUFFIX_RE = re.compile(r"/0+$")


def _key(isin: str, folio: str | None) -> str:
    # Normalise folio: strip only a trailing all-zero suffix (e.g. "/00")
    # that some RTAs pad onto an otherwise identical folio number. A real
    # distinguishing suffix (e.g. "/45" for a genuinely different folio of
    # the same fund) must NOT be stripped, or two different folios collide
    # onto the same key and one silently overwrites the other.
    if folio:
        folio = _ZERO_SUFFIX_RE.sub("", folio.strip())
    return f"{isin}:{folio}" if folio else isin


def _apply_trades(holdings: dict[str, Holding], req: AnalyzeRequest) -> list[Transaction]:
    """Turn trade rows into FIFO lots + cash flows. Pure function of input."""
    txns: list[Transaction] = []
    for t in sorted(req.trades, key=lambda t: t.txn_date):
        h = holdings.get(_key(t.isin, t.folio)) or holdings.get(t.isin)
        if h is None:
            # trades for fully-sold positions still matter for XIRR history
            h = Holding(isin=t.isin, name=t.isin, quantity=0.0, folio=t.folio,
                        symbol=t.symbol,
                        asset_type=AssetType.MUTUAL_FUND if t.isin.startswith("INF")
                        else AssetType.STOCK)
            holdings[_key(t.isin, t.folio)] = h
        if t.side == "BUY":
            # propagate symbol from trade to holding for stock price lookup
            if t.symbol and not h.symbol:
                h.symbol = t.symbol
            # real trade data replaces the synthetic CAS lot the first time
            if h.lots and all(l.source == "cas" for l in h.lots):
                h.lots = []
            h.lots.append(Lot(buy_date=t.txn_date, quantity=t.quantity,
                              price=t.price, source="tradebook"))
            txns.append(Transaction(txn_date=t.txn_date, amount=-t.quantity * t.price,
                                    isin=t.isin, folio=t.folio, description="BUY"))
        else:  # SELL
            remaining = t.quantity
            for lot in sorted(h.lots, key=lambda l: l.buy_date):
                take = min(lot.quantity, remaining)
                lot.quantity -= take
                remaining -= take
                if remaining <= 0:
                    break
            h.lots = [l for l in h.lots if l.quantity > 1e-9]
            txns.append(Transaction(txn_date=t.txn_date, amount=t.quantity * t.price,
                                    isin=t.isin, folio=t.folio, description="SELL"))
    # avg cost from lots wherever real lots exist;
    # also update quantity for phantom/stock holdings that started at 0
    for h in holdings.values():
        if h.lots and any(l.source != "cas" for l in h.lots):
            q = sum(l.quantity for l in h.lots)
            h.avg_cost = round(sum(l.quantity * l.price for l in h.lots) / q, 4) if q else None
            if h.quantity == 0:
                h.quantity = q  # phantom holding — derive qty from lots
    return txns


async def _price(holdings: dict[str, Holding]) -> list[str]:
    warnings: list[str] = []
    if any(h.asset_type == AssetType.MUTUAL_FUND for h in holdings.values()):
        try:
            navs = await price_svc.fetch_amfi_navs()
            for h in holdings.values():
                rec = navs.get(h.isin)
                if rec:
                    h.last_price, h.price_as_of, h.amfi_code = rec["nav"], rec["nav_date"], rec["amfi_code"]
        except Exception as exc:
            warnings.append(f"AMFI NAV fetch failed: {exc}")
    try:
        symbols = sorted({h.symbol for h in holdings.values() if h.symbol})
        if symbols:
            quotes = await run_in_threadpool(price_svc.fetch_stock_prices, symbols)
            for h in holdings.values():
                q = quotes.get(h.symbol or "")
                if q:
                    h.last_price, h.price_as_of = q["price"], q["price_date"]
        unpriced = [h.name for h in holdings.values()
                    if h.asset_type == AssetType.STOCK and not h.symbol]
        if unpriced:
            warnings.append("No ticker mapped (using statement price): " + ", ".join(unpriced[:5]))
    except Exception as exc:
        warnings.append(f"Stock price fetch failed: {exc}")
    return warnings


def _view(h: Holding, txns: list[Transaction]) -> HoldingView:
    cbt = h.cost_basis_type
    current = h.last_price * h.quantity if h.last_price else None

    # --- cost / invested ---
    if cbt == CostBasisType.UNKNOWN:
        # no cost basis known — exclude from P&L and XIRR entirely
        invested = None
        pnl = None
        rate = None
        xirr_excluded = True
    elif cbt == CostBasisType.ZERO:
        # ESOP/RSU at zero cost — full current value is gain
        invested = 0.0
        pnl = current
        # XIRR: ₹0 outflow at vest date (use earliest lot date if available,
        # else today) then current value inflow today
        vest_date = min((l.buy_date for l in h.lots), default=date.today())
        rate = None   # ₹0 outflow → XIRR undefined (infinite); show as N/A
        xirr_excluded = False
    else:
        # normal — derive cost from real lots or avg_cost
        invested = sum(l.quantity * l.price for l in h.lots) or (
            h.avg_cost * h.quantity if h.avg_cost else None)
        pnl = (current - invested) if (current is not None and invested is not None) else None

        # Scope cash flows to this exact holding (isin + normalised folio),
        # not just isin+buy-date — two folios of the same fund can easily
        # share a buy-date, and matching on date alone let one folio's
        # transactions bleed into another folio's XIRR.
        h_key = _key(h.isin, h.folio)
        flows = [(t.txn_date, t.amount) for t in txns if _key(t.isin, t.folio) == h_key]
        if not flows and h.lots and any(l.source != "cas" for l in h.lots):
            flows = [(l.buy_date, -l.quantity * l.price) for l in h.lots]
        rate = xirr(flows + [(date.today(), current)]) if (flows and current) else None
        xirr_excluded = (rate is None and not flows)

    pnl_pct = round(pnl / invested * 100, 2) if (
        pnl is not None and invested is not None and invested > 0) else None

    return HoldingView(
        isin=h.isin, name=h.name, asset_type=h.asset_type, quantity=h.quantity,
        symbol=h.symbol, folio=h.folio, avg_cost=h.avg_cost,
        invested=round(invested, 2) if invested is not None else None,
        last_price=h.last_price,
        current_value=round(current, 2) if current else None,
        pnl=round(pnl, 2) if pnl is not None else None,
        pnl_pct=pnl_pct,
        xirr=round(rate, 6) if rate is not None else None,
        price_as_of=h.price_as_of,
        cost_basis_type=cbt,
        xirr_excluded=xirr_excluded,
    )


@router.post("/analyze")
async def analyze(req: AnalyzeRequest):
    holdings = {_key(h.isin, h.folio): h.model_copy(deep=True) for h in req.holdings}
    txns = _apply_trades(holdings, req)
    warnings = await _price(holdings) if req.fetch_prices else []

    views = [_view(h, txns) for h in holdings.values() if h.quantity > 0]
    views.sort(key=lambda v: v.current_value or -1e18, reverse=True)

    invested = sum(v.invested or 0 for v in views)
    current = sum(v.current_value or 0 for v in views)
    pnl = sum(v.pnl for v in views if v.pnl is not None)
    pnl_base = sum(v.invested for v in views if v.pnl is not None and v.invested)

    # Portfolio XIRR: exclude UNKNOWN holdings; ZERO cost = ₹0 inflow at vest
    # (already captured as a ₹0 transaction — XIRR treats it as free money,
    # so we simply omit them from the flow list to avoid distorting the rate)
    flows = [(t.txn_date, t.amount) for t in txns
             if not any(h.isin == t.isin and h.cost_basis_type == CostBasisType.UNKNOWN
                        for h in holdings.values())]
    xirr_excluded_value = sum(
        v.current_value or 0 for v in views
        if v.cost_basis_type == CostBasisType.UNKNOWN
    )
    xirr_current = current - xirr_excluded_value
    overall = xirr(flows + [(date.today(), xirr_current)]) if flows and xirr_current else None

    summary = PortfolioSummary(
        invested=round(invested, 2), current_value=round(current, 2),
        pnl=round(pnl, 2),
        pnl_pct=round(pnl / pnl_base * 100, 2) if pnl_base else None,
        xirr=round(overall, 6) if overall is not None else None,
        holdings_count=len(views),
        priced_count=sum(1 for v in views if v.last_price),
    )
    harvest = build_report(list(holdings.values()), ltcg_realized=req.ltcg_realized)

    return {
        "summary": summary.model_dump(mode="json"),
        "holdings": [v.model_dump(mode="json") for v in views],
        "harvest": harvest.model_dump(mode="json"),
        "warnings": warnings,
    }


@router.post("/holding-detail")
async def holding_detail(req: AnalyzeRequest, isin: str, folio: str | None = None):
    """Returns full lot + cash flow detail for a single holding.
    Used by the fund detail panel / chart.
    """
    holdings = {_key(h.isin, h.folio): h.model_copy(deep=True) for h in req.holdings}
    txns = _apply_trades(holdings, req)

    key = _key(isin, folio)
    h = holdings.get(key) or holdings.get(isin)
    if not h:
        from fastapi import HTTPException
        raise HTTPException(404, f"Holding {isin} not found")

    current = h.last_price * h.quantity if h.last_price else None

    # Build cash flows scoped to this exact holding (isin + normalised
    # folio) — matching on isin+buy-date alone let one folio's transactions
    # bleed into another folio's XIRR whenever two folios of the same fund
    # happened to share a buy-date.
    def txn_matches(t) -> bool:
        return _key(t.isin, t.folio) == key

    flows = [(t.txn_date, t.amount) for t in txns if txn_matches(t)]
    if not flows and h.lots and any(l.source != "cas" for l in h.lots):
        flows = [(l.buy_date, -l.quantity * l.price) for l in h.lots]

    # Compute running invested amount over time for chart
    trades_for_isin = sorted(
        [t for t in txns if txn_matches(t)],
        key=lambda t: t.txn_date
    )
    running = []
    cum_invested = 0.0
    for t in trades_for_isin:
        cum_invested += -t.amount  # negative = invested, positive = redeemed
        running.append({"date": str(t.txn_date), "invested": round(cum_invested, 2)})

    # Per-lot detail
    lot_detail = []
    for lot in sorted(h.lots, key=lambda l: l.buy_date):
        if lot.source == "cas":
            continue
        gain = (h.last_price - lot.price) * lot.quantity if h.last_price else None
        lot_detail.append({
            "buy_date": str(lot.buy_date),
            "quantity": lot.quantity,
            "buy_price": lot.price,
            "current_price": h.last_price,
            "invested": round(lot.quantity * lot.price, 2),
            "current_value": round(lot.quantity * h.last_price, 2) if h.last_price else None,
            "gain": round(gain, 2) if gain is not None else None,
            "gain_pct": round(gain / (lot.quantity * lot.price) * 100, 2) if (gain and lot.price) else None,
            "term": classify_term(lot.buy_date, date.today()),
            "source": lot.source,
        })

    invested_total = sum(l["invested"] for l in lot_detail)
    rate = xirr([(t.txn_date, t.amount) for t in trades_for_isin] + [(date.today(), current)]) \
        if trades_for_isin and current else None

    return {
        "isin": isin,
        "name": h.name,
        "asset_type": h.asset_type,
        "folio": h.folio,
        "quantity": h.quantity,
        "last_price": h.last_price,
        "current_value": round(current, 2) if current else None,
        "invested": round(invested_total, 2),
        "gain": round(current - invested_total, 2) if current else None,
        "xirr": round(rate, 6) if rate is not None else None,
        "lot_detail": lot_detail,
        "running_invested": running,
        "trades": [
            {
                "date": str(t.txn_date),
                "side": t.description,
                "amount": round(abs(t.amount), 2),
            }
            for t in trades_for_isin
        ],
    }


@router.post("/capital-gains")
async def capital_gains(req: AnalyzeRequest):
    """FIFO-matched realised capital gains from trade history, grouped by FY."""
    from collections import defaultdict, deque
    from ..services.tax_harvest import classify_term

    holdings_map = {_key(h.isin, h.folio): h for h in req.holdings}
    name_map = {h.isin: h.name for h in req.holdings}

    # Apply trades to get all transactions in date order
    all_trades = sorted(req.trades, key=lambda t: t.txn_date)

    buy_queues: dict[str, deque] = defaultdict(deque)
    realised = []

    def to_str(d) -> str:
        return str(d) if not isinstance(d, str) else d

    for t in all_trades:
        if t.side == "BUY":
            buy_queues[t.isin].append({
                "date": to_str(t.txn_date), "qty": t.quantity, "price": t.price
            })
        else:
            remaining = t.quantity
            sell_date = to_str(t.txn_date)
            while remaining > 1e-6 and buy_queues[t.isin]:
                lot = buy_queues[t.isin][0]
                take = min(lot["qty"], remaining)
                gain = (t.price - lot["price"]) * take
                term = classify_term(
                    date.fromisoformat(lot["date"]),
                    date.fromisoformat(sell_date)
                )
                realised.append({
                    "sell_date": sell_date,
                    "buy_date": lot["date"],
                    "isin": t.isin,
                    "name": name_map.get(t.isin, t.isin),
                    "quantity": round(take, 4),
                    "buy_price": round(lot["price"], 4),
                    "sell_price": round(t.price, 4),
                    "gain": round(gain, 2),
                    "term": term,
                })
                remaining -= take
                lot["qty"] -= take
                if lot["qty"] < 1e-6:
                    buy_queues[t.isin].popleft()

    # Group by FY
    def fy_label(d: str) -> str:
        dt = date.fromisoformat(d)
        y = dt.year if dt.month >= 4 else dt.year - 1
        return f"FY {y}-{str(y+1)[-2:]}"

    by_fy: dict = defaultdict(lambda: {"ltcg": 0.0, "stcg": 0.0, "transactions": []})
    for r in realised:
        fy = fy_label(r["sell_date"])
        by_fy[fy]["ltcg" if r["term"] == "LTCG" else "stcg"] += r["gain"]
        by_fy[fy]["transactions"].append(r)

    summary = [
        {
            "fy": fy,
            "ltcg": round(d["ltcg"], 2),
            "stcg": round(d["stcg"], 2),
            "total": round(d["ltcg"] + d["stcg"], 2),
            "count": len(d["transactions"]),
            "transactions": sorted(d["transactions"], key=lambda t: t["sell_date"], reverse=True),
        }
        for fy, d in sorted(by_fy.items(), reverse=True)
    ]

    return {
        "summary": summary,
        "total_ltcg": round(sum(r["gain"] for r in realised if r["term"] == "LTCG"), 2),
        "total_stcg": round(sum(r["gain"] for r in realised if r["term"] == "STCG"), 2),
        "total_transactions": len(realised),
    }


@router.post("/elss-tracker")
async def elss_tracker(req: AnalyzeRequest):
    """ELSS lock-in status for all ELSS holdings."""
    from datetime import timedelta

    ELSS_KEYWORDS = ("ELSS", "TAX SAVER", "TAX PLAN", "TAX SAVING")
    LOCK_IN_DAYS = 3 * 365
    today = date.today()

    elss_isins = {
        h.isin for h in req.holdings
        if any(kw in h.name.upper() for kw in ELSS_KEYWORDS)
    }
    name_map = {h.isin: h.name for h in req.holdings}

    lots = []
    for t in sorted(req.trades, key=lambda t: t.txn_date):
        if t.isin not in elss_isins or t.side != "BUY":
            continue
        buy_date = date.fromisoformat(str(t.txn_date))
        unlock_date = buy_date + timedelta(days=LOCK_IN_DAYS)
        days_remaining = (unlock_date - today).days
        lots.append({
            "isin": t.isin,
            "name": name_map.get(t.isin, t.isin),
            "buy_date": str(buy_date),
            "unlock_date": str(unlock_date),
            "quantity": t.quantity,
            "buy_price": t.price,
            "invested": round(t.quantity * t.price, 2),
            "locked": days_remaining > 0,
            "days_remaining": max(0, days_remaining),
        })

    locked_amt = sum(l["invested"] for l in lots if l["locked"])
    unlocked_amt = sum(l["invested"] for l in lots if not l["locked"])
    upcoming = sorted([l for l in lots if l["locked"]], key=lambda l: l["unlock_date"])[:10]

    return {
        "lots": lots,
        "locked_amount": round(locked_amt, 2),
        "unlocked_amount": round(unlocked_amt, 2),
        "locked_count": sum(1 for l in lots if l["locked"]),
        "unlocked_count": sum(1 for l in lots if not l["locked"]),
        "upcoming_unlocks": upcoming,
        "elss_isins": list(elss_isins),
    }


@router.post("/allocation")
async def allocation(req: AnalyzeRequest):
    """Asset allocation breakdown with category classification."""

    def classify(name: str, isin: str) -> str:
        n = name.upper()
        if isin.startswith("INE"):                                          return "Stocks"
        if any(x in n for x in ("ETF","BEES","EXCHANGE TRADED")):          return "ETF"
        if any(x in n for x in ("ELSS","TAX SAVER","TAX PLAN")):           return "ELSS"
        if any(x in n for x in ("US ","NASDAQ","S&P","WORLD","OVERSEAS",
                                  "INTERNATIONAL","GLOBAL","FOF")):         return "International"
        if any(x in n for x in ("INDEX","NIFTY","SENSEX")):                 return "Index"
        if any(x in n for x in ("SMALL CAP","SMALLCAP","SMALL-CAP")):      return "Small cap"
        if any(x in n for x in ("MID CAP","MIDCAP","MID-CAP")):            return "Mid cap"
        if any(x in n for x in ("LARGE CAP","LARGECAP","BLUECHIP")):       return "Large cap"
        if any(x in n for x in ("FLEXI","MULTI CAP","MULTICAP","FLEXICAP")): return "Flexi cap"
        if any(x in n for x in ("HYBRID","BALANCED","CONSERVATIVE")):      return "Hybrid"
        if any(x in n for x in ("DEBT","LIQUID","SHORT TERM","DURATION",
                                  "SAVINGS","MONEY MARKET")):               return "Debt"
        return "Equity (other)"

    holdings = {_key(h.isin, h.folio): h.model_copy(deep=True) for h in req.holdings}

    from collections import defaultdict
    by_cat: dict = defaultdict(lambda: {"value": 0.0, "invested": 0.0, "holdings": []})

    for h in holdings.values():
        if not h.quantity:
            continue
        cat = classify(h.name, h.isin)
        val = (h.last_price or 0) * h.quantity
        inv = h.avg_cost * h.quantity if h.avg_cost else 0
        by_cat[cat]["value"] += val
        by_cat[cat]["invested"] += inv
        by_cat[cat]["holdings"].append({
            "isin": h.isin, "name": h.name, "folio": h.folio,
            "value": round(val, 2), "invested": round(inv, 2),
        })

    total_value = sum(d["value"] for d in by_cat.values())
    result = [
        {
            "category": cat,
            "value": round(d["value"], 2),
            "invested": round(d["invested"], 2),
            "pct": round(d["value"] / total_value * 100, 2) if total_value else 0,
            "count": len(d["holdings"]),
            "holdings": sorted(d["holdings"], key=lambda h: -h["value"]),
        }
        for cat, d in by_cat.items()
    ]
    result.sort(key=lambda x: -x["value"])
    return {"categories": result, "total_value": round(total_value, 2)}


@router.post("/rolling-returns")
async def rolling_returns(req: AnalyzeRequest):
    """1Y / 3Y / 5Y XIRR per holding, using trade history for cash flows
    and current price as the terminal value."""
    from collections import defaultdict
    from datetime import timedelta

    today = date.today()
    windows = [("1Y", 365), ("3Y", 3 * 365), ("5Y", 5 * 365)]

    # Build per-ISIN trade list (already normalised TradeRow objects)
    by_isin: dict[str, list] = defaultdict(list)
    for t in req.trades:
        by_isin[str(t.isin)].append(t)

    holdings_map = {h.isin: h for h in req.holdings}
    rows = []

    for isin, trades in by_isin.items():
        h = holdings_map.get(isin)
        if not h or not h.last_price or h.quantity <= 0:
            continue

        trades = sorted(trades, key=lambda t: str(t.txn_date))
        current_val = h.last_price * h.quantity
        result_row = {"isin": isin, "name": h.name, "current_value": round(current_val, 2)}

        for label, days in windows:
            cutoff = today - timedelta(days=days)

            # Qty and avg cost of position BEFORE the window started
            lots_before = [t for t in trades
                           if t.side == "BUY" and date.fromisoformat(str(t.txn_date)) < cutoff]
            sells_before_qty = sum(t.quantity for t in trades
                                   if t.side == "SELL" and date.fromisoformat(str(t.txn_date)) < cutoff)
            qty_before = sum(t.quantity for t in lots_before) - sells_before_qty

            flows = []
            if qty_before > 1e-6 and lots_before:
                total_cost = sum(l.quantity * l.price for l in lots_before)
                total_qty  = sum(l.quantity for l in lots_before)
                opening_price = total_cost / total_qty
                flows.append((cutoff, -round(qty_before * opening_price, 2)))

            for t in trades:
                d = date.fromisoformat(str(t.txn_date))
                if d < cutoff:
                    continue
                amt = -t.quantity * t.price if t.side == "BUY" else t.quantity * t.price
                flows.append((d, round(amt, 2)))

            flows.append((today, current_val))
            rate = xirr(flows) if flows else None
            result_row[label] = round(rate, 6) if rate is not None else None

        rows.append(result_row)

    # Sort by current value descending
    rows.sort(key=lambda r: -(r.get("current_value") or 0))
    return {"rows": rows}


@router.post("/fund-pnl")
async def fund_pnl(req: AnalyzeRequest):
    """Consolidated P&L per fund: realised (FIFO) + unrealised, combined total return."""
    from collections import defaultdict, deque
    from ..services.tax_harvest import classify_term

    holdings_map = {h.isin: h for h in req.holdings}
    name_map = {h.isin: h.name for h in req.holdings}

    all_trades = sorted(req.trades, key=lambda t: str(t.txn_date))

    buy_q: dict[str, deque] = defaultdict(deque)
    realised: dict[str, dict] = defaultdict(lambda: {
        "ltcg": 0.0, "stcg": 0.0, "sell_amt": 0.0, "cost_sold": 0.0
    })
    invested: dict[str, float] = defaultdict(float)

    def to_str(d): return str(d)

    for t in all_trades:
        isin = t.isin
        if t.side == "BUY":
            buy_q[isin].append({"date": to_str(t.txn_date), "qty": t.quantity, "price": t.price})
            invested[isin] += t.quantity * t.price
        else:
            remaining = t.quantity
            sell_date = date.fromisoformat(to_str(t.txn_date))
            realised[isin]["sell_amt"] += t.quantity * t.price
            while remaining > 1e-6 and buy_q[isin]:
                lot = buy_q[isin][0]
                take = min(lot["qty"], remaining)
                gain = (t.price - lot["price"]) * take
                term = classify_term(date.fromisoformat(lot["date"]), sell_date)
                realised[isin]["ltcg" if term == "LTCG" else "stcg"] += gain
                realised[isin]["cost_sold"] += take * lot["price"]
                lot["qty"] -= take
                remaining -= take
                if lot["qty"] < 1e-6:
                    buy_q[isin].popleft()

    rows = []
    # All ISINs that have any activity
    all_isins = set(invested.keys()) | set(realised.keys())

    for isin in all_isins:
        h = holdings_map.get(isin)
        name = name_map.get(isin) or isin
        lots = list(buy_q[isin])
        rem_qty  = sum(l["qty"] for l in lots)
        rem_cost = sum(l["qty"] * l["price"] for l in lots)

        price = h.last_price if h else None
        cur_val   = round(rem_qty * price, 2) if price and rem_qty > 1e-6 else None
        unrealised = round(cur_val - rem_cost, 2) if cur_val is not None else None

        r = realised[isin]
        realised_gain = round(r["ltcg"] + r["stcg"], 2)
        total_pnl = round(realised_gain + (unrealised or 0), 2)

        rows.append({
            "isin":           isin,
            "name":           name,
            "total_invested": round(invested[isin], 2),
            "cost_sold":      round(r["cost_sold"], 2),
            "sell_proceeds":  round(r["sell_amt"], 2),
            "realised_ltcg":  round(r["ltcg"], 2),
            "realised_stcg":  round(r["stcg"], 2),
            "realised_gain":  realised_gain,
            "rem_qty":        round(rem_qty, 4),
            "rem_cost":       round(rem_cost, 2),
            "current_value":  cur_val,
            "unrealised":     unrealised,
            "total_pnl":      total_pnl,
            "fully_exited":   rem_qty < 1e-6,
        })

    rows.sort(key=lambda r: -(r["total_pnl"] or 0))
    return {"rows": rows, "total_realised": round(sum(r["realised_gain"] for r in rows), 2),
            "total_unrealised": round(sum(r["unrealised"] or 0 for r in rows), 2)}
