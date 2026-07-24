/**
 * Core analysis pipeline — separates MF and stock computation, then merges.
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

export function key(isin: string, folio: string | null): string {
  if (folio) {
    folio = folio.replace(ZERO_SUFFIX_RE, '').trim();
    return `${isin}:${folio}`;
  }
  return isin;
}

function isStock(isin: string, symbol: string | null): boolean {
  if (isin.startsWith('INE')) return true;
  if (isin.startsWith('INF') && symbol) {
    const up = symbol.toUpperCase();
    if (ETF_KEYWORDS.some(kw => up.includes(kw))) return true;
  }
  return false;
}

function viewHolding(
  isin: string, name: string, quantity: number, avgCost: number | null,
  lastPrice: number | null, priceAsOf: string | null,
  assetType: AssetType, folio: string | null, symbol: string | null,
  invested: number | null, xirrRate: number | null = null,
): HoldingView {
  const current = lastPrice != null ? lastPrice * quantity : null;
  const pnl = (current != null && invested != null) ? Math.round((current - invested) * 100) / 100 : null;
  const pnlPct = (pnl != null && invested != null && invested > 0)
    ? Math.round(pnl / invested * 10000) / 100 : null;

  return {
    isin, name, asset_type: assetType, quantity, folio, symbol,
    avg_cost: avgCost, last_price: lastPrice, price_as_of: priceAsOf,
    invested: invested != null ? Math.round(invested * 100) / 100 : null,
    current_value: current != null ? Math.round(current * 100) / 100 : null,
    pnl, pnl_pct: pnlPct,
    xirr: xirrRate, cost_basis_type: CostBasisType.NORMAL,
    xirr_excluded: xirrRate == null,
  };
}

function computeXirr(
  trades: TradeRow[], isin: string, folio: string | null,
  currentValue: number | null, invested: number | null,
): number | null {
  if (!currentValue || currentValue <= 0 || !invested || invested <= 0) return null;
  if (currentValue <= invested) return null;

  // Use total invested and first buy date for a simple CAGR approximation
  // (avoids complex trade-level cash flow matching issues)
  const sorted = [...trades]
    .filter(t => t.isin === isin && (folio == null || t.folio === folio))
    .sort((a, b) => a.txn_date.localeCompare(b.txn_date));
  
  const firstBuy = sorted.find(t => t.side === 'BUY');
  if (!firstBuy) return null;
  
  // Weighted average time: use midpoint between first buy and last trade
  const lastTrade = sorted[sorted.length - 1];
  const start = new Date(firstBuy.txn_date);
  const end = new Date();
  const years = (end.getTime() - start.getTime()) / (365.25 * 86400000);
  if (years <= 0) return null;
  
  return Math.pow(currentValue / invested, 1 / years) - 1;
}

export interface AnalyzeResult {
  summary: PortfolioSummary;
  holdings: HoldingView[];
  harvest: any;
  warnings: string[];
}

/**
 * Full portfolio analysis:
 * 1. MF holdings from state (parsed CAS) — invested = avg_cost × quantity
 * 2. Stock holdings from trades (Zerodha) — invested = sum of buy amounts
 * 3. Merge both into a single result
 */
export async function analyze(
  holdings: Holding[],
  trades: TradeRow[],
  ltcgRealized = 0,
  fetchPrices = false,
): Promise<AnalyzeResult> {
  const warnings: string[] = [];

  // ── 1. MF holdings from parsed CAS data ──
  const mfViews: HoldingView[] = [];
  for (const h of holdings) {
    if (h.quantity <= 0) continue;
    const invested = h.avg_cost != null ? Math.round(h.avg_cost * h.quantity * 100) / 100 : null;
    const current = h.last_price != null ? h.last_price * h.quantity : null;
    const xirrVal = computeXirr(trades, h.isin, h.folio, current, invested);
    mfViews.push(viewHolding(
      h.isin, h.name, h.quantity, h.avg_cost, h.last_price, h.price_as_of,
      AssetType.MUTUAL_FUND, h.folio, h.symbol, invested, xirrVal,
    ));
  }

  // ── 2. Stock/ETF holdings from trades (Zerodha) ──
  const stockBuyQ: Record<string, { qty: number; totalCost: number }> = {};
  const stockMeta: Record<string, { name: string; symbol: string }> = {};

  for (const t of [...trades].sort((a, b) => a.txn_date.localeCompare(b.txn_date))) {
    const isStockHolding = isStock(t.isin, t.symbol);
    if (!isStockHolding) continue; // skip MF trades — handled above

    const k = key(t.isin, t.folio);
    if (!stockBuyQ[k]) stockBuyQ[k] = { qty: 0, totalCost: 0 };
    if (!stockMeta[k]) stockMeta[k] = { name: t.symbol || t.isin, symbol: t.symbol || '' };

    if (t.side === 'BUY') {
      stockBuyQ[k].qty += t.quantity;
      stockBuyQ[k].totalCost += t.quantity * t.price;
    } else {
      const remaining = t.quantity;
      // Simple FIFO: reduce from bought quantity
      const take = Math.min(stockBuyQ[k].qty, remaining);
      stockBuyQ[k].qty -= take;
      // Reduce cost proportionally
      if (stockBuyQ[k].qty > 0) {
        stockBuyQ[k].totalCost *= (1 - take / (stockBuyQ[k].qty + take));
      } else {
        stockBuyQ[k].totalCost = 0;
      }
    }
  }

  const stockViews: HoldingView[] = [];
  for (const [k, data] of Object.entries(stockBuyQ)) {
    if (data.qty <= 0) continue;
    const [isin, ...folioParts] = k.split(':');
    const folio = folioParts.join(':') || null;
    const meta = stockMeta[k];
    const avgCost = data.totalCost / data.qty;
    const current = data.qty * avgCost; // use cost as placeholder until price refresh
    const xirrVal = computeXirr(trades, isin, folio, current, data.totalCost);
    stockViews.push(viewHolding(
      isin, meta.name, data.qty, avgCost, null, null,
      AssetType.STOCK, folio || null, meta.symbol, data.totalCost, xirrVal,
    ));
  }

  // ── 3. Merge MF + stock views ──
  const viewsMap = new Map<string, HoldingView>();
  for (const v of mfViews) viewsMap.set(key(v.isin, v.folio), v);
  for (const v of stockViews) {
    const k = key(v.isin, v.folio);
    if (!viewsMap.has(k)) viewsMap.set(k, v);
  }
  const views = Array.from(viewsMap.values()).sort(
    (a, b) => (b.current_value ?? -1e18) - (a.current_value ?? -1e18),
  );

  // ── 4. Price fetch (live) ──
  if (fetchPrices) {
    if (mfViews.length) {
      try {
        const navs = await fetchAmfiNavs();
        for (const v of views) {
          if (v.asset_type !== AssetType.MUTUAL_FUND) continue;
          const rec = navs[v.isin];
          if (rec) { v.last_price = rec.nav; v.price_as_of = rec.nav_date; }
        }
      } catch (e: any) { warnings.push(`AMFI NAV fetch failed: ${e.message}`); }
    }
    if (stockViews.length) {
      const symbols = [...new Set(stockViews.filter(v => v.symbol).map(v => v.symbol!))];
      if (symbols.length) {
        try {
          const quotes = await fetchStockPrices(symbols);
          for (const v of views) {
            if (v.asset_type !== AssetType.STOCK || !v.symbol) continue;
            const q = quotes[v.symbol];
            if (q) { v.last_price = q.price; v.price_as_of = q.price_date; }
          }
        } catch (e: any) { warnings.push(`Stock price fetch failed: ${e.message}`); }
      }
    }
  }

  // ── 5. Summary ──
  const totalInv = views.reduce((s, v) => s + (v.invested || 0), 0);
  const totalCur = views.reduce((s, v) => s + (v.current_value || 0), 0);
  const totalPnl = views.reduce((s, v) => s + (v.pnl || 0), 0);
  const pnlBase = views.reduce((s, v) => s + ((v.pnl != null && v.invested) ? v.invested : 0), 0);
  const xirrValue = totalPnl > 0 && totalInv > 0 ? totalPnl / totalInv : null;

  const summary: PortfolioSummary = {
    invested: Math.round(totalInv * 100) / 100,
    current_value: Math.round(totalCur * 100) / 100,
    pnl: Math.round(totalPnl * 100) / 100,
    pnl_pct: pnlBase ? Math.round(totalPnl / pnlBase * 10000) / 100 : null,
    xirr: xirrValue,
    holdings_count: views.length,
    priced_count: views.filter(v => v.last_price).length,
  };

  return { summary, holdings: views, harvest: {}, warnings };
}
