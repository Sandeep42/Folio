"""Tax-loss / tax-gain harvesting for Indian listed equity & equity MFs.

Rules (post Budget-2024, FY 2025-26):
  - Listed equity & equity-oriented MFs: LTCG if held > 12 months.
  - LTCG taxed at 12.5% above ₹1,25,000 annual exemption (Sec 112A).
  - STCG taxed at 20% (Sec 111A).
  - Gain harvesting: realise LTCG up to the unused exemption → rebuy to step
    up cost basis at zero tax.
  - Loss harvesting: realise losses to offset gains elsewhere.

Design principles for suggestions:
  - Consolidate per holding (ISIN), not per lot — one card per fund/stock.
  - Sort by biggest gain first so the exemption is filled meaningfully.
  - Skip anything below MIN_ACTIONABLE_GAIN (₹500) — sub-₹100 residuals
    are noise, not advice.
  - Cap at MAX_SUGGESTIONS cards total.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date

from ..models import (AssetType, HarvestLot, HarvestSuggestion, Holding,
                      SellLot, TaxHarvestReport)

LTCG_EXEMPTION    = 125_000.0
LTCG_RATE         = 0.125
STCG_RATE         = 0.20
LT_DAYS           = 365
MIN_ACTIONABLE_GAIN = 500.0   # ignore lots/holdings with gain below this
MAX_SUGGESTIONS   = 15


def fy_label(today: date) -> str:
    y = today.year if today.month >= 4 else today.year - 1
    return f"FY {y}-{str(y + 1)[-2:]}"


def classify_term(buy_date: date, today: date) -> str:
    return "LTCG" if (today - buy_date).days > LT_DAYS else "STCG"


def build_report(
    holdings: list[Holding],
    today: date | None = None,
    ltcg_realized: float = 0.0,
) -> TaxHarvestReport:
    today = today or date.today()

    # ── 1. Build per-lot detail list ──────────────────────────────────────
    lots: list[HarvestLot] = []
    for h in holdings:
        price = h.last_price
        if not price or not h.lots:
            continue
        for lot in h.lots:
            if lot.source == "cas":   # no real buy date — skip
                continue
            gain = (price - lot.price) * lot.quantity
            term = classify_term(lot.buy_date, today)
            days_to_ltcg = (
                max(0, LT_DAYS + 1 - (today - lot.buy_date).days)
                if term == "STCG" else None
            )
            lots.append(HarvestLot(
                isin=h.isin, name=h.name, asset_type=h.asset_type,
                buy_date=lot.buy_date, quantity=lot.quantity,
                buy_price=lot.price, last_price=price,
                unrealized_gain=round(gain, 2), term=term,
                days_to_ltcg=days_to_ltcg,
            ))

    u_ltcg = sum(l.unrealized_gain for l in lots if l.term == "LTCG" and l.unrealized_gain > 0)
    u_stcg = sum(l.unrealized_gain for l in lots if l.term == "STCG" and l.unrealized_gain > 0)
    u_ltl  = sum(l.unrealized_gain for l in lots if l.term == "LTCG" and l.unrealized_gain < 0)
    u_stl  = sum(l.unrealized_gain for l in lots if l.term == "STCG" and l.unrealized_gain < 0)

    remaining = max(0.0, LTCG_EXEMPTION - ltcg_realized)
    suggestions: list[HarvestSuggestion] = []

    # ── 2. Gain harvesting ────────────────────────────────────────────────
    # Show ALL holdings with LTCG gains sorted largest first.
    # Track a rolling exemption budget — each suggestion shows exactly how
    # much can be harvested tax-free from that fund given what's left, plus
    # the full gain so the user sees the complete picture.

    ltcg_gain_lots = [l for l in lots if l.term == "LTCG" and l.unrealized_gain >= MIN_ACTIONABLE_GAIN]

    isin_gain: dict[str, float] = defaultdict(float)
    for l in ltcg_gain_lots:
        isin_gain[l.isin] += l.unrealized_gain

    budget = remaining   # rolling remaining exemption

    for isin in sorted(isin_gain, key=lambda i: -isin_gain[i]):
        holding_lots = sorted(
            [l for l in ltcg_gain_lots if l.isin == isin],
            key=lambda l: l.buy_date,
        )
        total_gain = isin_gain[isin]
        name = holding_lots[0].name
        total_qty = sum(l.quantity for l in holding_lots)

        # within_exemption = true if this fund's TOTAL gain fits within the full ₹1.25L limit
        # (regardless of what other funds are using) — tells user if they can harvest this
        # fund entirely tax-free in a given FY by prioritising it
        fits_in_limit = total_gain <= LTCG_EXEMPTION
        within = fits_in_limit

        # Full lot breakdown for drill-down
        breakdown = [
            SellLot(
                buy_date=lot.buy_date,
                quantity_to_sell=lot.quantity,
                buy_price=lot.buy_price,
                last_price=lot.last_price,
                gain=round(lot.unrealized_gain, 2),
                term=lot.term,
                days_to_ltcg=lot.days_to_ltcg,
            )
            for lot in holding_lots
        ]

        tax_free_gain = min(total_gain, budget)
        taxable_gain  = total_gain - tax_free_gain

        if fits_in_limit and budget >= total_gain:
            # Entire gain fits and exemption is still available
            rationale = (
                f"Sell all {total_qty:g} units to book ₹{total_gain:,.0f} LTCG "
                f"tax-free (₹{budget:,.0f} exemption remaining this FY). "
                f"Rebuy to reset cost basis. Saves ~₹{round(total_gain * LTCG_RATE, 0):,.0f} in future tax."
            )
        elif fits_in_limit and budget < total_gain:
            # Fits in ₹1.25L limit but exemption is partially used by other harvests
            rationale = (
                f"₹{total_gain:,.0f} total gain — fits within the ₹1.25L annual limit. "
                f"Only ₹{budget:,.0f} exemption remains this FY after other harvests. "
                f"Consider harvesting this instead of a higher-gain fund to use the exemption more efficiently."
            )
        elif budget >= MIN_ACTIONABLE_GAIN:
            # Gain exceeds ₹1.25L but partial harvest is tax-free
            rationale = (
                f"₹{total_gain:,.0f} total gain — exceeds the ₹1.25L annual limit. "
                f"₹{tax_free_gain:,.0f} can still be harvested tax-free with the remaining exemption. "
                f"The remaining ₹{taxable_gain:,.0f} would attract ~₹{round(taxable_gain * LTCG_RATE, 0):,.0f} tax."
            )
        else:
            # Exemption fully used
            rationale = (
                f"₹{total_gain:,.0f} total LTCG gain. The ₹1.25L exemption is fully used this FY. "
                f"Harvesting now would cost ~₹{round(total_gain * LTCG_RATE, 0):,.0f} tax. "
                f"Harvest at the start of next FY when the exemption resets."
            )

        suggestions.append(HarvestSuggestion(
            kind="gain_harvest", isin=isin, name=name,
            quantity=total_qty, estimated_gain=round(total_gain, 2),
            rationale=rationale,
            lot_breakdown=breakdown,
            within_exemption=within,
        ))

        # Deduct this fund's tax-free portion from the rolling budget
        budget = max(0.0, budget - tax_free_gain)

    # ── 3. Loss harvesting ────────────────────────────────────────────────
    # Always compute — loss harvesting is independent of the ₹1.25L exemption.
    # Losses can offset gains this year OR be carried forward 8 years.
    # Only constraint: FIFO reachability (oldest lot must be a loss).

    # Group ALL lots by ISIN so we can check FIFO reachability
    all_by_isin: dict[str, list[HarvestLot]] = defaultdict(list)
    for l in lots:
        all_by_isin[l.isin].append(l)

    loss_by_isin: dict[str, list[HarvestLot]] = defaultdict(list)
    for isin, isin_lots in all_by_isin.items():
        fifo = sorted(isin_lots, key=lambda l: l.buy_date)
        reachable_losses = []
        for lot in fifo:
            if lot.unrealized_gain <= -MIN_ACTIONABLE_GAIN:
                reachable_losses.append(lot)
            elif lot.unrealized_gain > MIN_ACTIONABLE_GAIN:
                break   # gain lot in front — loss lots behind it are FIFO-blocked
            # near-zero lots don't block
        if reachable_losses:
            loss_by_isin[isin] = reachable_losses

    for isin, loss_lots in sorted(loss_by_isin.items(),
                                  key=lambda kv: sum(l.unrealized_gain for l in kv[1])):
        total_loss = -sum(l.unrealized_gain for l in loss_lots)
        total_qty  = sum(l.quantity for l in loss_lots)
        term       = loss_lots[0].term
        rate       = STCG_RATE if term == "STCG" else LTCG_RATE
        name       = loss_lots[0].name
        breakdown  = [
            SellLot(
                buy_date=l.buy_date,
                quantity_to_sell=l.quantity,
                buy_price=l.buy_price,
                last_price=l.last_price,
                gain=round(l.unrealized_gain, 2),
                term=l.term,
                days_to_ltcg=l.days_to_ltcg,
            )
            for l in loss_lots
        ]
        suggestions.append(HarvestSuggestion(
            kind="loss_harvest", isin=isin, name=name,
            quantity=total_qty, estimated_gain=-total_loss,
            rationale=(
                f"Book ₹{total_loss:,.0f} {term} loss. "
                f"Offsets capital gains this FY (saves up to ₹{total_loss * rate:,.0f} tax), "
                f"or carries forward for up to 8 years if no gains to offset now. "
                f"You can rebuy immediately — no wash-sale rule in India, though the "
                f"holding period resets from the rebuy date."
            ),
            lot_breakdown=breakdown,
            within_exemption=True,
        ))

    return TaxHarvestReport(
        fy_label=fy_label(today),
        ltcg_exemption_limit=LTCG_EXEMPTION,
        ltcg_realized_assumed=ltcg_realized,
        ltcg_exemption_remaining=remaining,
        unrealized_ltcg=round(u_ltcg, 2),
        unrealized_stcg=round(u_stcg, 2),
        unrealized_lt_losses=round(u_ltl, 2),
        unrealized_st_losses=round(u_stl, 2),
        lots=sorted(lots, key=lambda l: l.unrealized_gain, reverse=True),
        suggestions=suggestions[:MAX_SUGGESTIONS],
    )
