/**
 * Zerodha Console tradebook CSV parser.
 *
 * Format (new):
 *   symbol, isin, trade_date, exchange, segment, series,
 *   trade_type, quantity, price, trade_id, order_id, order_execution_time
 *
 * Old format (auto-detected):
 *   Trade Date, Buy/Sell, Quantity, Price, ...
 */

import Papa from 'papaparse';

export interface ZerodhaParseResult {
  trades: Array<{
    isin: string;
    txn_date: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    folio: null;
    symbol: string | null;
  }>;
  skipped_fo: number;
  skipped_no_isin: number;
  duplicate_trade_ids: number;
  warnings: string[];
}

function detectFormat(fieldnames: string[]): 'new' | 'old' {
  const names = new Set(fieldnames.map(f => f.toLowerCase().trim()));
  if (names.has('trade_type') && names.has('isin')) return 'new';
  if (names.has('buy/sell') || names.has('trade type')) return 'old';
  return 'new';
}

function parseDate(s: string): string {
  s = s.trim();
  // Try YYYY-MM-DD first
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Try DD-Mon-YYYY
  const m = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    return `${m[3]}-${months[m[2].toLowerCase()] || '01'}-${m[1]}`;
  }
  // Try DD/MM/YYYY or DD-MM-YYYY
  const m2 = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
  throw new Error(`Unrecognised date: ${s}`);
}

/**
 * Parse a single Zerodha tradebook CSV string.
 * Pass a shared seenTradeIds set across multiple files for dedup.
 */
export function parseZerodhaCsv(
  text: string,
  seenTradeIds?: Set<string>,
): ZerodhaParseResult {
  const result: ZerodhaParseResult = {
    trades: [], skipped_fo: 0, skipped_no_isin: 0,
    duplicate_trade_ids: 0, warnings: [],
  };
  const ids = seenTradeIds ?? new Set<string>();

  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (!parsed.meta.fields?.length) {
    result.warnings.push('Empty CSV.');
    return result;
  }

  const fmt = detectFormat(parsed.meta.fields);
  // Normalise column names
  const cols: Record<string, string> = {};
  for (const f of parsed.meta.fields) {
    cols[f.toLowerCase().trim().replace(/\s+/g, '_')] = f;
  }

  for (const row of parsed.data as any[]) {
    // Filter non-equity
    const segment = (row[cols['segment']] || '').toString().toUpperCase().trim();
    if (segment && !['EQ', 'BE', 'BL', ''].includes(segment)) {
      result.skipped_fo++;
      continue;
    }

    const isin = (row[cols['isin']] || '').toString().trim();
    if (!isin || !isin.startsWith('IN')) {
      result.skipped_no_isin++;
      continue;
    }

    // Dedup by trade_id
    const tradeId = (row[cols['trade_id']] || '').toString().trim();
    if (tradeId) {
      if (ids.has(tradeId)) {
        result.duplicate_trade_ids++;
        continue;
      }
      ids.add(tradeId);
    }

    // Side
    let rawSide: string;
    if (fmt === 'new') {
      rawSide = (row[cols['trade_type']] || '').toString().toLowerCase().trim();
    } else {
      rawSide = (row[cols['buy/sell']] || row[cols['trade_type']] || '').toString().toLowerCase().trim();
    }
    let side: 'BUY' | 'SELL';
    if (rawSide === 'buy' || rawSide === 'b') side = 'BUY';
    else if (rawSide === 'sell' || rawSide === 's') side = 'SELL';
    else {
      result.warnings.push(`Unknown trade_type ${rawSide} — skipped.`);
      continue;
    }

    // Date
    const rawDate = (row[cols['trade_date']] || row[cols['date']] || '').toString().trim();
    let txnDate: string;
    try { txnDate = parseDate(rawDate); }
    catch {
      result.warnings.push(`Bad date ${rawDate} — skipped.`);
      continue;
    }

    const quantity = parseFloat((row[cols['quantity']] || '0').toString());
    const price = parseFloat((row[cols['price']] || '0').toString());
    if (isNaN(quantity) || isNaN(price) || quantity <= 0 || price <= 0) {
      result.warnings.push(`Non-numeric quantity/price on ${txnDate} — skipped.`);
      continue;
    }

    result.trades.push({
      isin,
      txn_date: txnDate,
      side,
      quantity,
      price,
      folio: null,
      symbol: (row[cols['symbol']] || '').toString().trim() || null,
    });
  }

  return result;
}

/**
 * Parse and merge multiple Zerodha tradebook CSVs (e.g. one per FY).
 * A single seenTradeIds set is shared across all files for dedup.
 */
export function mergeZerodhaFiles(files: string[]): ZerodhaParseResult {
  const merged: ZerodhaParseResult = {
    trades: [], skipped_fo: 0, skipped_no_isin: 0,
    duplicate_trade_ids: 0, warnings: [],
  };
  const seen = new Set<string>();

  for (const text of files) {
    const r = parseZerodhaCsv(text, seen);
    merged.trades.push(...r.trades);
    merged.skipped_fo += r.skipped_fo;
    merged.skipped_no_isin += r.skipped_no_isin;
    merged.duplicate_trade_ids += r.duplicate_trade_ids;
    merged.warnings.push(...r.warnings);
  }

  merged.trades.sort((a, b) => a.txn_date.localeCompare(b.txn_date));
  return merged;
}
