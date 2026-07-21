/**
 * XIRR — annualised internal rate of return for irregular cash flows.
 *
 * Convention: outflows (investments) are negative, inflows (redemptions,
 * current value) are positive. The final "virtual sale" of the portfolio at
 * today's market value is appended by the caller.
 *
 * Newton-Raphson first, bisection fallback. No external dependencies.
 */

/** One cash flow: [date, amount] */
type CashFlow = [Date, number];

function _npv(rate: number, flows: CashFlow[]): number {
  const t0 = flows[0][0];
  let total = 0;
  for (const [d, amt] of flows) {
    const years = (d.getTime() - t0.getTime()) / (365.25 * 86400000);
    total += amt / Math.pow(1 + rate, years);
  }
  return total;
}

/**
 * Compute annualised XIRR for a list of cash flows.
 * Returns the rate as a decimal (e.g. 0.12 for 12%), or null if it cannot
 * be computed (fewer than 2 flows, all same sign, or no convergence).
 */
export function xirr(flows: CashFlow[], guess = 0.1): number | null {
  flows = [...flows].sort((a, b) => a[0].getTime() - b[0].getTime());

  if (flows.length < 2) return null;

  const hasNeg = flows.some(([, a]) => a < 0);
  const hasPos = flows.some(([, a]) => a > 0);
  if (!hasNeg || !hasPos) return null;

  // ── Newton-Raphson ──
  let rate = guess;
  for (let i = 0; i < 100; i++) {
    const f = _npv(rate, flows);
    const h = 1e-6;
    const df = (_npv(rate + h, flows) - f) / h;
    if (Math.abs(df) < 1e-12) break;
    let newRate = rate - f / df;
    if (newRate <= -0.999999) {
      newRate = (rate - 0.999999) / 2;
    }
    if (Math.abs(newRate - rate) < 1e-9) return newRate;
    rate = newRate;
  }

  // ── Bisection fallback ──
  let lo = -0.9999;
  let hi = 100.0;
  let fLo = _npv(lo, flows);
  let fHi = _npv(hi, flows);
  if (fLo * fHi > 0) return null;

  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fMid = _npv(mid, flows);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}
