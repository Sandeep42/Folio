/**
 * Tax-loss / tax-gain harvesting for Indian listed equity & equity MFs.
 *
 * Rules (post Budget-2024, FY 2025-26):
 *   - Listed equity & equity-oriented MFs: LTCG if held > 12 months.
 *   - LTCG taxed at 12.5% above ₹1,25,000 annual exemption (Sec 112A).
 *   - STCG taxed at 20% (Sec 111A).
 *   - Gain harvesting: realise LTCG up to the unused exemption → rebuy to step
 *     up cost basis at zero tax.
 *   - Loss harvesting: realise losses to offset gains elsewhere.
 */

import { Holding } from '../models/Holding';
import {
  HarvestLot,
  HarvestSuggestion,
  SellLot,
  TaxHarvestReport,
} from '../models/TaxHarvest';

const LTCG_EXEMPTION = 125_000;
const LTCG_RATE = 0.125;
const STCG_RATE = 0.20;
const LT_DAYS = 365;
const MIN_ACTIONABLE_GAIN = 500;
const MAX_SUGGESTIONS = 15;

export function fyLabel(today: Date): string {
  const y = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return `FY ${y}-${String(y + 1).slice(-2)}`;
}

export function classifyTerm(buyDate: Date, today: Date): 'LTCG' | 'STCG' {
  const days = (today.getTime() - buyDate.getTime()) / 86400000;
  return days > LT_DAYS ? 'LTCG' : 'STCG';
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86400000;
}

export function buildReport(
  holdings: Holding[],
  today: Date = new Date(),
  ltcgRealized = 0,
): TaxHarvestReport {
  // ── 1. Build per-lot detail list ──
  const lots: HarvestLot[] = [];

  for (const h of holdings) {
    const price = h.last_price;
    if (!price || !h.lots?.length) continue;
    for (const lot of h.lots) {
      if (lot.source === 'cas') continue; // no real buy date
      const gain = (price - lot.price) * lot.quantity;
      const buyDate = new Date(lot.buy_date);
      const term = classifyTerm(buyDate, today);
      const daysToLtcg =
        term === 'STCG' ? Math.max(0, LT_DAYS + 1 - daysBetween(buyDate, today)) : null;

      lots.push({
        isin: h.isin,
        name: h.name,
        asset_type: h.asset_type,
        buy_date: lot.buy_date,
        quantity: lot.quantity,
        buy_price: lot.price,
        last_price: price,
        unrealized_gain: Math.round(gain * 100) / 100,
        term,
        days_to_ltcg: daysToLtcg,
      });
    }
  }

  const uLtcg = lots.filter(l => l.term === 'LTCG' && l.unrealized_gain > 0)
    .reduce((s, l) => s + l.unrealized_gain, 0);
  const uStcg = lots.filter(l => l.term === 'STCG' && l.unrealized_gain > 0)
    .reduce((s, l) => s + l.unrealized_gain, 0);
  const uLtl = lots.filter(l => l.term === 'LTCG' && l.unrealized_gain < 0)
    .reduce((s, l) => s + l.unrealized_gain, 0);
  const uStl = lots.filter(l => l.term === 'STCG' && l.unrealized_gain < 0)
    .reduce((s, l) => s + l.unrealized_gain, 0);

  const remaining = Math.max(0, LTCG_EXEMPTION - ltcgRealized);
  const suggestions: HarvestSuggestion[] = [];

  // ── 2. Gain harvesting ──
  const ltcgGainLots = lots.filter(
    l => l.term === 'LTCG' && l.unrealized_gain >= MIN_ACTIONABLE_GAIN,
  );

  const isinGain: Record<string, number> = {};
  for (const l of ltcgGainLots) {
    isinGain[l.isin] = (isinGain[l.isin] || 0) + l.unrealized_gain;
  }

  let budget = remaining;

  for (const isin of Object.keys(isinGain).sort((a, b) => isinGain[b] - isinGain[a])) {
    const holdingLots = ltcgGainLots
      .filter(l => l.isin === isin)
      .sort((a, b) => a.buy_date.localeCompare(b.buy_date));

    const totalGain = isinGain[isin];
    const name = holdingLots[0].name;
    const totalQty = holdingLots.reduce((s, l) => s + l.quantity, 0);
    const fitsInLimit = totalGain <= LTCG_EXEMPTION;

    const breakdown: SellLot[] = holdingLots.map(lot => ({
      buy_date: lot.buy_date,
      quantity_to_sell: lot.quantity,
      buy_price: lot.buy_price,
      last_price: lot.last_price,
      gain: Math.round(lot.unrealized_gain * 100) / 100,
      term: lot.term,
      days_to_ltcg: lot.days_to_ltcg,
    }));

    const taxFreeGain = Math.min(totalGain, budget);
    const taxableGain = totalGain - taxFreeGain;

    let rationale: string;
    if (fitsInLimit && budget >= totalGain) {
      rationale =
        `Sell all ${totalQty} units to book ₹${Math.round(totalGain).toLocaleString('en-IN')} LTCG ` +
        `tax-free (₹${Math.round(budget).toLocaleString('en-IN')} exemption remaining this FY). ` +
        `Rebuy to reset cost basis. Saves ~₹${Math.round(totalGain * LTCG_RATE).toLocaleString('en-IN')} in future tax.`;
    } else if (fitsInLimit && budget < totalGain) {
      rationale =
        `₹${Math.round(totalGain).toLocaleString('en-IN')} total gain — fits within the ₹1.25L annual limit. ` +
        `Only ₹${Math.round(budget).toLocaleString('en-IN')} exemption remains this FY after other harvests. ` +
        `Consider harvesting this instead of a higher-gain fund to use the exemption more efficiently.`;
    } else if (budget >= MIN_ACTIONABLE_GAIN) {
      rationale =
        `₹${Math.round(totalGain).toLocaleString('en-IN')} total gain — exceeds the ₹1.25L annual limit. ` +
        `₹${Math.round(taxFreeGain).toLocaleString('en-IN')} can still be harvested tax-free with the remaining exemption. ` +
        `The remaining ₹${Math.round(taxableGain).toLocaleString('en-IN')} would attract ~₹${Math.round(taxableGain * LTCG_RATE).toLocaleString('en-IN')} tax.`;
    } else {
      rationale =
        `₹${Math.round(totalGain).toLocaleString('en-IN')} total LTCG gain. The ₹1.25L exemption is fully used this FY. ` +
        `Harvesting now would cost ~₹${Math.round(totalGain * LTCG_RATE).toLocaleString('en-IN')} tax. ` +
        `Harvest at the start of next FY when the exemption resets.`;
    }

    suggestions.push({
      kind: 'gain_harvest',
      isin,
      name,
      quantity: totalQty,
      estimated_gain: Math.round(totalGain * 100) / 100,
      rationale,
      lot_breakdown: breakdown,
      within_exemption: fitsInLimit,
    });

    budget = Math.max(0, budget - taxFreeGain);
  }

  // ── 3. Loss harvesting ──
  const allByIsin: Record<string, HarvestLot[]> = {};
  for (const l of lots) {
    if (!allByIsin[l.isin]) allByIsin[l.isin] = [];
    allByIsin[l.isin].push(l);
  }

  const lossByIsin: Record<string, HarvestLot[]> = {};
  for (const [isin, isinLots] of Object.entries(allByIsin)) {
    const fifo = [...isinLots].sort((a, b) => a.buy_date.localeCompare(b.buy_date));
    const reachableLosses: HarvestLot[] = [];
    for (const lot of fifo) {
      if (lot.unrealized_gain <= -MIN_ACTIONABLE_GAIN) {
        reachableLosses.push(lot);
      } else if (lot.unrealized_gain > MIN_ACTIONABLE_GAIN) {
        break; // gain lot in front — loss lots behind it are FIFO-blocked
      }
    }
    if (reachableLosses.length) {
      lossByIsin[isin] = reachableLosses;
    }
  }

  for (const [isin, lossLots] of Object.entries(lossByIsin).sort(
    (a, b) =>
      b[1].reduce((s, l) => s + l.unrealized_gain, 0) -
      a[1].reduce((s, l) => s + l.unrealized_gain, 0),
  )) {
    const totalLoss = -lossLots.reduce((s, l) => s + l.unrealized_gain, 0);
    const totalQty = lossLots.reduce((s, l) => s + l.quantity, 0);
    const term = lossLots[0].term;
    const rate = term === 'STCG' ? STCG_RATE : LTCG_RATE;
    const name = lossLots[0].name;

    const breakdown: SellLot[] = lossLots.map(l => ({
      buy_date: l.buy_date,
      quantity_to_sell: l.quantity,
      buy_price: l.buy_price,
      last_price: l.last_price,
      gain: Math.round(l.unrealized_gain * 100) / 100,
      term: l.term,
      days_to_ltcg: l.days_to_ltcg,
    }));

    suggestions.push({
      kind: 'loss_harvest',
      isin,
      name,
      quantity: totalQty,
      estimated_gain: -totalLoss,
      rationale:
        `Book ₹${Math.round(totalLoss).toLocaleString('en-IN')} ${term} loss. ` +
        `Offsets capital gains this FY (saves up to ₹${(totalLoss * rate).toLocaleString('en-IN')} tax), ` +
        `or carries forward for up to 8 years if no gains to offset now. ` +
        `You can rebuy immediately — no wash-sale rule in India, though the ` +
        `holding period resets from the rebuy date.`,
      lot_breakdown: breakdown,
      within_exemption: true,
    });
  }

  return {
    fy_label: fyLabel(today),
    ltcg_exemption_limit: LTCG_EXEMPTION,
    ltcg_realized_assumed: ltcgRealized,
    ltcg_exemption_remaining: Math.round(remaining * 100) / 100,
    unrealized_ltcg: Math.round(uLtcg * 100) / 100,
    unrealized_stcg: Math.round(uStcg * 100) / 100,
    unrealized_lt_losses: Math.round(uLtl * 100) / 100,
    unrealized_st_losses: Math.round(uStl * 100) / 100,
    lots: [...lots].sort((a, b) => b.unrealized_gain - a.unrealized_gain),
    suggestions: suggestions.slice(0, MAX_SUGGESTIONS),
  };
}
