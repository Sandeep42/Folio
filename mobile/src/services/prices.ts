/**
 * Live prices.
 *
 * Mutual funds: AMFI publishes all NAVs daily as a semicolon-delimited text
 *               file at portal.amfiindia.com. Parsed by ISIN.
 * Stocks:       Yahoo Finance v8 chart API via plain fetch — no npm package.
 *               Symbols without a exchange suffix get .NS appended for NSE.
 */

const AMFI_NAV_URL = 'https://portal.amfiindia.com/spages/NAVAll.txt';
const AMFI_TTL_MS = 6 * 3600 * 1000;

interface AmfiRecord {
  nav: number;
  name: string;
  amfi_code: string;
  nav_date: string; // YYYY-MM-DD
}

let amfiCache: { fetchedAt: number; byIsin: Record<string, AmfiRecord> } = {
  fetchedAt: 0,
  byIsin: {},
};

/**
 * Fetch all AMFI NAVs and return a map keyed by ISIN.
 * Results are cached for 6 hours.
 */
export async function fetchAmfiNavs(force = false): Promise<Record<string, AmfiRecord>> {
  const now = Date.now();
  if (!force && Object.keys(amfiCache.byIsin).length && now - amfiCache.fetchedAt < AMFI_TTL_MS) {
    return amfiCache.byIsin;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const resp = await fetch(AMFI_NAV_URL, { signal: controller.signal as any });
  clearTimeout(timeout);
  if (!resp.ok) throw new Error(`AMFI HTTP ${resp.status}`);
  const text = await resp.text();

  const byIsin: Record<string, AmfiRecord> = {};

  for (const line of text.split('\n')) {
    const parts = line.split(';');
    if (parts.length !== 6 || !/^\d+$/.test(parts[0].trim())) continue;
    const [code, isin1, isin2, name, navStr, dateStr] = parts.map((p: string) => p.trim());
    const nav = parseFloat(navStr);
    if (isNaN(nav)) continue;
    // Parse "dd-Mon-yyyy" date format
    const [d, m, y] = dateStr.split('-');
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const navDate = `${y}-${months[m?.toLowerCase()] || '01'}-${d.padStart(2, '0')}`;

    const rec: AmfiRecord = { nav, name, amfi_code: code, nav_date: navDate };
    for (const isin of [isin1, isin2]) {
      if (isin && isin !== '-') {
        byIsin[isin] = rec;
      }
    }
  }

  amfiCache = { fetchedAt: now, byIsin };
  return byIsin;
}

/** Normalise Indian ticker for yahoo-finance2: add .NS if missing. */
function yfSym(sym: string): string {
  return sym.includes('.') ? sym : `${sym}.NS`;
}

interface StockQuote {
  price: number;
  price_date: string; // YYYY-MM-DD
}

/**
 * Fetch current stock prices via Yahoo Finance v8 chart API (no npm package).
 * Returns a map keyed by the original symbol (without .NS suffix).
 */
export async function fetchStockPrices(symbols: string[]): Promise<Record<string, StockQuote>> {
  if (!symbols.length) return {};

  const symMap: Record<string, string> = {};
  for (const s of symbols) {
    symMap[s] = s.includes('.') ? s : `${s}.NS`;
  }

  const out: Record<string, StockQuote> = {};
  for (const [origSym, yfSymStr] of Object.entries(symMap)) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yfSymStr)}?interval=1d&range=5d`;
      const resp = await fetch(url, {
        signal: controller.signal as any,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      clearTimeout(timeout);
      if (!resp.ok) continue;
      const json: any = await resp.json();
      const meta = json?.chart?.result?.[0]?.meta;
      if (!meta) continue;
      const price = meta.regularMarketPrice;
      if (price == null) continue;
      const ts = meta.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000)
        : new Date();
      out[origSym] = {
        price: typeof price === 'number' ? price : parseFloat(String(price)),
        price_date: ts.toISOString().slice(0, 10),
      };
    } catch {
      // symbol not found / delisted — skip silently
    }
  }

  return out;
}
