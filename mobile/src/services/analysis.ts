/**
 * Core analysis pipeline: combines holdings + trades, prices them, computes
 * XIRR and the tax-harvest report. Port of backend/app/routers/analyze.py.
 */

import { Holding } from '../models/Holding';
import { HoldingView } from '../models/HoldingView';
import { Lot } from '../models/Lot';
import { TradeRow } from '../models/TradeRow';
import { Transaction } from '../models/Transaction';
import { PortfolioSummary } from '../models/Portfolio';
import { AssetType, CostBasisType } from '../models/enums';
import { xirr } from './xirr';
import { buildReport } from './taxHarvest';
import { fetchAmfiNavs, fetchStockPrices } from './prices';

const ZERO_SUFFIX_RE = /\/0+$/;
const ETF_KEYWORDS = ['ETF', 'BEES', 'EXCHANGE TRADED'];

function isStock(isin: string, symbol: string | null): boolean {
  if (isin.startsWith('INE')) return true;
  if (isin.startsWith('INF') && symbol) {
    const up = symbol.toUpperCase();
    if (ETF_KEYWORDS.some(kw => up.includes(kw))) return true;
  }
  return false;
}

export function key(isin: string, folio: string | null): string {
  if (folio) {
    folio = folio.replace(ZERO_SUFFIX_RE, '').trim();
    return `${isin}:${folio}`;
  }
  return isin;
}

function applyTrades(
  holdings: Record<string, Holding>,
  trades: TradeRow[],
): Transaction[] {
  const txns: Transaction[] = [];

  for (const t of [...trades].sort((a, b) => a.txn_date.localeCompare(b.txn_date))) {
    let h = holdings[key(t.isin, t.folio)] || holdings[t.isin];

    if (!h) {
      h = {
        isin: t.isin,
        name: t.symbol || t.isin,
        asset_type: isStock(t.isin, t.symbol) ? AssetType.STOCK : AssetType.MUTUAL_FUND,
        quantity: 0,
        symbol: t.symbol || null,
        folio: t.folio || null,
        amfi_code: null,
        avg_cost: null,
        last_price: null,
        price_as_of: null,
        lots: [],
        cost_basis_type: CostBasisType.NORMAL,
      };
      holdings[key(t.isin, t.folio)] = h;
    }

    if (t.side === 'BUY') {
      if (t.symbol && !h.symbol) h.symbol = t.symbol;
      if (h.lots.length && h.lots.every(l => l.source === 'cas')) h.lots = [];
      h.lots.push({ buy_date: t.txn_date, quantity: t.quantity, price: t.price, source: 'tradebook' });
      txns.push({ txn_date: t.txn_date, amount: -t.quantity * t.price, isin: t.isin, folio: t.folio, description: 'BUY' });
    } else {
      let remaining = t.quantity;
      for (const lot of [...h.lots].sort((a, b) => a.buy_date.localeCompare(b.buy_date))) {
        const take = Math.min(lot.quantity, remaining);
        lot.quantity -= take;
        remaining -= take;
        if (remaining <= 0) break;
      }
      h.lots = h.lots.filter(l => l.quantity > 1e-9);
      txns.push({ txn_date: t.txn_date, amount: t.quantity * t.price, isin: t.isin, folio: t.folio, description: 'SELL' });
    }
  }

  // Update avg_cost and quantity from lots
  for (const h of Object.values(holdings)) {
    if (h.lots.length && h.lots.some(l => l.source !== 'cas')) {
      const q = h.lots.reduce((s, l) => s + l.quantity, 0);
      h.avg_cost = q > 0
        ? Math.round(h.lots.reduce((s, l) => s + l.quantity * l.price, 0) / q * 10000) / 10000
        : null;
      if (h.quantity === 0) h.quantity = q;
    }
  }

  return txns;
}

function viewHolding(h: Holding, txns: Transaction[]): HoldingView {
  const current = h.last_price != null ? h.last_price * h.quantity : null;

  let invested: number | null;
  let pnl: number | null;
  let rate: number | null;
  let xirrExcluded: boolean;

  if (h.cost_basis_type === CostBasisType.UNKNOWN) {
    invested = null;
    pnl = null;
    rate = null;
    xirrExcluded = true;
  } else if (h.cost_basis_type === CostBasisType.ZERO) {
    invested = 0;
    pnl = current;
    rate = null;
    xirrExcluded = false;
  } else {
    invested = h.lots.reduce((s, l) => s + l.quantity * l.price, 0)
      || (h.avg_cost != null && h.quantity != null ? h.avg_cost * h.quantity : null);
    pnl = (current != null && invested != null) ? current - invested : null;

    const hKey = key(h.isin, h.folio);
    let flows = txns
      .filter(t => key(t.isin, t.folio) === hKey)
      .map(t => [new Date(t.txn_date), t.amount] as [Date, number]);

    if (!flows.length && h.lots.length && h.lots.some(l => l.source !== 'cas')) {
      flows = h.lots.map(l => [new Date(l.buy_date), -l.quantity * l.price] as [Date, number]);
    }
    rate = (flows.length && current != null) ? xirr([...flows, [new Date(), current]]) : null;
    xirrExcluded = rate == null && !flows.length;
  }

  const pnlPct = (pnl != null && invested != null && invested > 0)
    ? Math.round(pnl / invested * 10000) / 100 : null;

  return {
    isin: h.isin,
    name: h.name,
    asset_type: h.asset_type,
    quantity: h.quantity,
    symbol: h.symbol,
    folio: h.folio,
    avg_cost: h.avg_cost,
    invested: invested != null ? Math.round(invested * 100) / 100 : null,
    last_price: h.last_price,
    current_value: current != null ? Math.round(current * 100) / 100 : null,
    pnl: pnl != null ? Math.round(pnl * 100) / 100 : null,
    pnl_pct: pnlPct,
    xirr: rate != null ? Math.round(rate * 1000000) / 1000000 : null,
    price_as_of: h.price_as_of,
    cost_basis_type: h.cost_basis_type,
    xirr_excluded: xirrExcluded,
  };
}

export interface AnalyzeResult {
  summary: PortfolioSummary;
  holdings: HoldingView[];
  harvest: any;
  warnings: string[];
}

/**
 * Full portfolio analysis: price, compute XIRR, build tax harvest report.
 */
export async function analyze(
  holdings: Holding[],
  trades: TradeRow[],
  ltcgRealized = 0,
  fetchPrices = false,
): Promise<AnalyzeResult> {
  const warnings: string[] = [];

  // Build holdings map
  const holdingsMap: Record<string, Holding> = {};
  for (const h of holdings) {
    holdingsMap[key(h.isin, h.folio)] = { ...h, lots: [...h.lots] };
  }

  const txns = applyTrades(holdingsMap, trades);

  // Price
  if (fetchPrices) {
    const mfHoldings = Object.values(holdingsMap).filter(h => h.asset_type === AssetType.MUTUAL_FUND);
    if (mfHoldings.length) {
      try {
        const navs = await fetchAmfiNavs();
        for (const h of Object.values(holdingsMap)) {
          const rec = navs[h.isin];
          if (rec) {
            h.last_price = rec.nav;
            h.price_as_of = rec.nav_date;
          }
        }
      } catch (e: any) {
        warnings.push(`AMFI NAV fetch failed: ${e.message}`);
      }
    }

    const symbols = [...new Set(Object.values(holdingsMap).filter(h => h.symbol).map(h => h.symbol!))];
    if (symbols.length) {
      try {
        const quotes = await fetchStockPrices(symbols);
        for (const h of Object.values(holdingsMap)) {
          const q = h.symbol ? quotes[h.symbol] : undefined;
          if (q) {
            h.last_price = q.price;
            h.price_as_of = q.price_date;
          }
        }
      } catch (e: any) {
        warnings.push(`Stock price fetch failed: ${e.message}`);
      }
    }
  }

  // Build views
  const views = Object.values(holdingsMap)
    .filter(h => h.quantity > 0)
    .map(h => viewHolding(h, txns))
    .sort((a, b) => (b.current_value ?? -1e18) - (a.current_value ?? -1e18));

  const invested = views.reduce((s, v) => s + (v.invested || 0), 0);
  const current = views.reduce((s, v) => s + (v.current_value || 0), 0);
  const pnl = views.reduce((s, v) => s + (v.pnl || 0), 0);
  const pnlBase = views.reduce((s, v) => s + ((v.pnl != null && v.invested) ? v.invested : 0), 0);

  // Portfolio XIRR
  const flows = txns
    .filter(t => !Object.values(holdingsMap).some(h => h.isin === t.isin && h.cost_basis_type === CostBasisType.UNKNOWN))
    .map(t => [new Date(t.txn_date), t.amount] as [Date, number]);
  const xirrExcludedValue = views
    .filter(v => v.cost_basis_type === CostBasisType.UNKNOWN)
    .reduce((s, v) => s + (v.current_value || 0), 0);
  const xirrCurrent = current - xirrExcludedValue;
  const overall = flows.length && xirrCurrent
    ? xirr([...flows, [new Date(), xirrCurrent]])
    : null;

  const summary: PortfolioSummary = {
    invested: Math.round(invested * 100) / 100,
    current_value: Math.round(current * 100) / 100,
    pnl: Math.round(pnl * 100) / 100,
    pnl_pct: pnlBase ? Math.round(pnl / pnlBase * 10000) / 100 : null,
    xirr: overall != null ? Math.round(overall * 1000000) / 1000000 : null,
    holdings_count: views.length,
    priced_count: views.filter(v => v.last_price).length,
  };

  // Harvest report uses original holdings with priced lots
  const harvest = buildReport(
    Object.values(holdingsMap),
    new Date(),
    ltcgRealized,
  );

  return { summary, holdings: views, harvest, warnings };
}
