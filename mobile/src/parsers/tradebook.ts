/**
 * Generic tradebook CSV parser.
 * Columns: isin, date, side (BUY/SELL), quantity, price[, folio]
 */

import Papa from 'papaparse';

export interface TradebookParseResult {
  trades: Array<{
    isin: string;
    txn_date: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    folio: string | null;
  }>;
  warnings: string[];
}

function parseDate(s: string): string {
  s = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    return `${m[3]}-${months[m[2].toLowerCase()] || '01'}-${m[1]}`;
  }
  const m2 = s.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
  throw new Error(`Unrecognised date: ${s}`);
}

export function parseTradebookCsv(text: string): TradebookParseResult {
  const result: TradebookParseResult = { trades: [], warnings: [] };

  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (!parsed.meta.fields?.length) {
    result.warnings.push('Empty CSV.');
    return result;
  }

  const cols: Record<string, string> = {};
  for (const f of parsed.meta.fields) {
    cols[f.toLowerCase().trim()] = f;
  }

  const required = ['isin', 'date', 'side', 'quantity', 'price'];
  for (const r of required) {
    if (!cols[r]) {
      result.warnings.push(`Missing column: ${r}. Got: ${parsed.meta.fields.join(', ')}`);
      return result;
    }
  }

  for (const row of parsed.data as any[]) {
    const isin = (row[cols['isin']] || '').toString().trim().toUpperCase();
    if (!isin) continue;

    const rawSide = (row[cols['side']] || '').toString().trim().toUpperCase();
    let side: 'BUY' | 'SELL';
    if (rawSide === 'BUY') side = 'BUY';
    else if (rawSide === 'SELL') side = 'SELL';
    else {
      result.warnings.push(`side must be BUY or SELL, got ${rawSide} — skipped.`);
      continue;
    }

    const rawDate = (row[cols['date']] || '').toString().trim();
    let txnDate: string;
    try { txnDate = parseDate(rawDate); }
    catch {
      result.warnings.push(`Bad date ${rawDate} — skipped.`);
      continue;
    }

    const quantity = parseFloat((row[cols['quantity']] || '0').toString());
    const price = parseFloat((row[cols['price']] || '0').toString());
    if (isNaN(quantity) || isNaN(price) || quantity <= 0 || price <= 0) continue;

    const folio = cols['folio']
      ? (row[cols['folio']] || '').toString().trim() || null
      : null;

    result.trades.push({ isin, txn_date: txnDate, side, quantity, price, folio });
  }

  return result;
}
