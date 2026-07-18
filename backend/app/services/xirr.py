"""XIRR — annualised internal rate of return for irregular cash flows.

Convention: outflows (investments) are negative, inflows (redemptions,
current value) are positive. The final "virtual sale" of the portfolio at
today's market value is appended by the caller.

Newton-Raphson first, bisection fallback. No scipy dependency.
"""
from __future__ import annotations

from datetime import date


def _npv(rate: float, flows: list[tuple[date, float]]) -> float:
    t0 = flows[0][0]
    total = 0.0
    for d, amt in flows:
        years = (d - t0).days / 365.25
        total += amt / (1.0 + rate) ** years
    return total


def xirr(flows: list[tuple[date, float]], guess: float = 0.1) -> float | None:
    """Return annualised rate, or None if it cannot be computed."""
    flows = sorted(flows, key=lambda f: f[0])
    if len(flows) < 2:
        return None
    has_neg = any(a < 0 for _, a in flows)
    has_pos = any(a > 0 for _, a in flows)
    if not (has_neg and has_pos):
        return None

    # Newton-Raphson
    rate = guess
    for _ in range(100):
        f = _npv(rate, flows)
        # numeric derivative
        h = 1e-6
        df = (_npv(rate + h, flows) - f) / h
        if abs(df) < 1e-12:
            break
        step = f / df
        new_rate = rate - step
        if new_rate <= -0.999999:
            new_rate = (rate - 0.999999) / 2
        if abs(new_rate - rate) < 1e-9:
            return new_rate
        rate = new_rate

    # Bisection fallback over a wide bracket
    lo, hi = -0.9999, 100.0
    f_lo, f_hi = _npv(lo, flows), _npv(hi, flows)
    if f_lo * f_hi > 0:
        return None
    for _ in range(300):
        mid = (lo + hi) / 2
        f_mid = _npv(mid, flows)
        if abs(f_mid) < 1e-7:
            return mid
        if f_lo * f_mid < 0:
            hi, f_hi = mid, f_mid
        else:
            lo, f_lo = mid, f_mid
    return (lo + hi) / 2
