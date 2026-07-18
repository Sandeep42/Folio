// Pure FIRE (Financial Independence, Retire Early) math — no React, no
// backend. Everything here derives from the portfolio's current value
// (already computed by /api/analyze) plus user-entered assumptions that
// aren't part of the portfolio itself.

const MAX_PROJECTION_YEARS = 100

export function computeFire({
  currentValue,
  annualExpenses,
  swr,
  expectedReturn,
  annualContribution,
  yearsToRetirement,
}) {
  const fireNumber = swr > 0 ? annualExpenses / swr : null
  const progressPct = fireNumber ? (currentValue / fireNumber) * 100 : null
  const withdrawableToday = currentValue * swr

  let yearsToFire = null
  if (fireNumber != null) {
    if (currentValue >= fireNumber) {
      yearsToFire = 0
    } else {
      let v = currentValue
      for (let year = 1; year <= MAX_PROJECTION_YEARS; year++) {
        v = v * (1 + expectedReturn) + annualContribution
        if (v >= fireNumber) { yearsToFire = year; break }
      }
    }
  }

  let coastFireNumber = null
  let coastProgressPct = null
  if (fireNumber != null) {
    coastFireNumber = fireNumber / Math.pow(1 + expectedReturn, yearsToRetirement)
    coastProgressPct = coastFireNumber > 0 ? (currentValue / coastFireNumber) * 100 : null
  }

  return {
    fireNumber,
    progressPct,
    withdrawableToday,
    yearsToFire, // null = not reached within MAX_PROJECTION_YEARS
    coastFireNumber,
    coastProgressPct,
  }
}
