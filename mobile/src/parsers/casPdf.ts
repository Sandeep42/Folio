/**
 * Parser for CAMS/KFintech Consolidated Account Statement (CAS) PDF.
 *
 * Extracts both holdings AND full transaction history from a single PDF.
 *
 * Uses pdfjs-dist for PDF text extraction (no native dependencies).
 * Also accepts pre-parsed JSON as a fallback for mobile environments
 * where PDF text extraction may be unreliable.
 */

// ── helpers ────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{2}-[A-Z][a-z]{2}-\d{4}$/;
const ISIN_RE = /\bIN[EF][A-Z0-9]{9}\b/;
const CLOSING_LABELS = new Set([
  'NAV on ', 'Market Value on ', 'Closing Unit Balance:', 'Total Cost Value:',
]);

const PAGE_BOILERPLATE = new Set([
  'Date', 'Amount', 'Price', 'Units', 'Transaction', 'Unit', 'Balance',
  '(INR)', 'Cost Value', 'Market Value', 'PORTFOLIO SUMMARY',
  'Mutual Fund', 'Total', 'Consolidated Account Statement',
]);

const BUY_KW = ['purchase', 'sip', 'systematic investment', 'sys. investment',
  'sys.invest', 'new purchase', 'switch in', 'switch-in',
  'allotment', 'reinvestment', 'dividend reinvest'];

const SELL_KW = ['redemption', 'switch out', 'switch-out', 'repurchase'];
const SKIP_KW = ['stamp duty', 'stt paid', 'registration of nominee',
  'address updated', 'invalid purchase', 'cancelled',
  'sipterminated', 'sipcancelled', 'refund payout',
  'refund', 'non demat folio', 'sip terminated'];

function parseDate(s: string): string | null {
  try {
    const [d, m, y] = s.trim().split('-');
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    return `${y}-${months[m?.toLowerCase()] || '01'}-${d.padStart(2, '0')}`;
  } catch { return null; }
}

function parseNum(s: string): number | null {
  s = s.trim().replace(/,/g, '');
  const neg = s.startsWith('(') && s.endsWith(')');
  s = s.replace(/[()]/g, '');
  const v = parseFloat(s);
  return isNaN(v) ? null : (neg ? -v : v);
}

function isNum(s: string): boolean {
  return /^\(?[\d,]+\.?\d*\)?$/.test(s.trim());
}

function classify(txnText: string, unitsVal: number): 'BUY' | 'SELL' | null {
  const lower = txnText.toLowerCase().trim();
  if (lower.includes('reversed')) return unitsVal < 0 ? 'SELL' : 'BUY';
  for (const kw of SKIP_KW) if (lower.includes(kw)) return null;
  for (const kw of SELL_KW) if (lower.includes(kw)) return 'SELL';
  for (const kw of BUY_KW) if (lower.includes(kw)) return 'BUY';
  return unitsVal < 0 ? 'SELL' : 'BUY';
}

const PROD_CODE_RE = /^[A-Z0-9]{3,8}-/;

function cleanName(name: string): string {
  name = name.replace(PROD_CODE_RE, '').trim().replace(/^[- ]+/, '').replace(/[- ]+$/, '');
  name = name.replace(/\s+/g, ' ');
  name = name.replace(/\(Non.?Demat\)/g, '');
  name = name.replace(/\(Demat\)/g, '');
  return name.trim().slice(0, 120);
}

// ── data types ─────────────────────────────────────────────────────────────

export interface ParsedHolding {
  isin: string;
  name: string;
  quantity: number;
  nav: number | null;
  market_value: number | null;
  avg_cost: number | null;
  folio: string | null;
  registrar: string | null;
}

export interface ParsedTrade {
  isin: string;
  txn_date: string;
  side: string;
  quantity: number;
  price: number;
  amount: number;
  folio: string | null;
}

export interface CamsKfinParseResult {
  holdings: ParsedHolding[];
  trades: ParsedTrade[];
  statement_period: string | null;
  as_of: string | null;
  warnings: string[];
  skipped_txns: number;
}

// ── PDF text extraction ────────────────────────────────────────────────────

/**
 * Extract text from a PDF buffer using pdfjs-dist.
 * Returns lines of text, one per table cell (similar to PyMuPDF's behavior).
 */
async function extractPdfText(data: ArrayBuffer, password?: string): Promise<string> {
  // Dynamic import: pdfjs-dist is large and may not be available in all environments
  const pdfjsLib = await import('pdfjs-dist');
  
  // Set worker path — for React Native this might need a custom setup
  if (!(pdfjsLib as any).GlobalWorkerOptions.workerSrc) {
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = '';
  }
  
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(data),
    password: password || undefined,
  });
  
  const doc = await loadingTask.promise;
  const lines: string[] = [];
  
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    
    // Group text items by their Y position (line)
    const itemsByY: Map<number, string[]> = new Map();
    for (const item of content.items) {
      const ti = item as any;
      const y = Math.round(ti.transform?.[5] || 0);
      if (!itemsByY.has(y)) itemsByY.set(y, []);
      itemsByY.get(y)!.push(ti.str || '');
    }
    
    // Sort lines by Y (top to bottom), join items within each line
    const sortedYs = Array.from(itemsByY.keys()).sort((a, b) => b - a);
    for (const y of sortedYs) {
      const lineText = itemsByY.get(y)!.join(' ').trim();
      if (lineText) lines.push(lineText);
    }
  }
  
  return lines.join('\n');
}

// ── main parser ────────────────────────────────────────────────────────────

export async function parseCamsKfinCas(
  data: ArrayBuffer,
  password?: string,
): Promise<CamsKfinParseResult> {
  const fullText = await extractPdfText(data, password);

  const result: CamsKfinParseResult = {
    holdings: [],
    trades: [],
    statement_period: null,
    as_of: null,
    warnings: [],
    skipped_txns: 0,
  };

  // Extract statement period
  const periodMatch = fullText.slice(0, 2000).match(
    /(\d{2}-[A-Z][a-z]{2}-\d{4})\s+To\s+(\d{2}-[A-Z][a-z]{2}-\d{4})/i,
  );
  if (periodMatch) {
    result.statement_period = `${periodMatch[1]} to ${periodMatch[2]}`;
  }

  // Clean lines
  const raw = fullText.split('\n').map(l => l.trim()).filter(Boolean);

  // Boilerplate detection
  const nPages = Math.max(1, (fullText.match(/\f/g) || []).length + 1);
  const freq: Record<string, number> = {};
  for (const ln of raw) {
    if (!isNum(ln) && !ISIN_RE.test(ln) && !ln.includes('***') && !DATE_RE.test(ln)
      && !Array.from(CLOSING_LABELS).some(lb => ln.startsWith(lb))
      && !ln.startsWith('Folio No:') && !ln.startsWith('Registrar :')
      && !ln.startsWith('Opening Unit Balance:') && !ln.startsWith('Nominee')
      && !ln.startsWith('PAN:') && !ln.startsWith('KYC:')
      && !ln.includes('INR') && !ln.startsWith('W.e.f')) {
      freq[ln] = (freq[ln] || 0) + 1;
    }
  }
  const th = Math.max(4, Math.floor(nPages * 0.4));
  const boiler = new Set(Object.entries(freq).filter(([, c]) => c >= th).map(([k]) => k));
  PAGE_BOILERPLATE.forEach(b => boiler.add(b));
  raw.filter(l => l.includes('Mutual Fund')).forEach(l => boiler.add(l));

  const lines = raw.filter(l =>
    !boiler.has(l) && !/^Page \d+ of \d+$/.test(l) && !l.startsWith('CAMSCASWS'),
  );

  // ── state machine ──
  let curIsin: string | null = null;
  let curScheme: string | null = null;
  let curFolio: string | null = null;
  let curRegistrar: string | null = null;
  let inFolio = false;
  let readingTxns = false;

  let folioTrades: ParsedTrade[] = [];
  let closNav: number | null = null;
  let closMv: number | null = null;
  let closUnits: number | null = null;
  let totCost: number | null = null;
  let asOfDate: string | null = null;
  let prevDataLine: string | null = null;

  const flushFolio = () => {
    if (!curIsin) return;
    if (closUnits && closUnits > 0) {
      const avg = totCost && closUnits ? Math.round(totCost / closUnits * 10000) / 10000 : null;
      result.holdings.push({
        isin: curIsin, name: (curScheme || '').slice(0, 120),
        quantity: closUnits, nav: closNav,
        market_value: closMv, avg_cost: avg,
        folio: curFolio, registrar: curRegistrar,
      });
    }
    for (const t of folioTrades) {
      t.isin = curIsin!;
      t.folio = curFolio;
      result.trades.push(t);
    }
  };

  const reset = () => {
    curIsin = curScheme = curFolio = curRegistrar = null;
    folioTrades = [];
    closNav = closMv = closUnits = totCost = null;
    inFolio = false;
    readingTxns = false;
  };

  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    const isinM = ln.match(ISIN_RE);

    // ── ISIN line — new folio ──
    if (isinM) {
      if (curIsin && inFolio) flushFolio();
      reset();
      curIsin = isinM[0];

      let rawName: string;
      if (ln.includes(' - ISIN:')) {
        rawName = ln.split(' - ISIN:')[0].replace(/^[- ]+|[- ]+$/g, '');
      } else if (ln.includes(' - ')) {
        rawName = ln.split(' - ')[0].trim();
      } else {
        rawName = ln.slice(0, 120);
      }
      rawName = rawName.split('(Advisor:')[0].replace(/^[- ]+|[- ]+$/g, '').slice(0, 120);

      if (prevDataLine && (rawName.startsWith('Fund') || rawName.startsWith('fund')
        || rawName.startsWith('-') || rawName.length < 15)) {
        let prev = prevDataLine.replace(/^[A-Z0-9]{3,8}-/, '').replace(/^[- ]+|[- ]+$/g, '');
        rawName = (prev + ' ' + rawName).trim();
        rawName = rawName.replace(/(\w+)\s+\1/, '$1');
      }

      curScheme = cleanName(rawName);
      inFolio = true;
      readingTxns = false;
      prevDataLine = null;
      i++;
      continue;
    }

    // Track previous data line
    if (!isinM && ln && !isNum(ln) && !ln.includes('***') && !DATE_RE.test(ln)
      && !ln.startsWith('Folio No:') && !ln.startsWith('Registrar :')
      && !Array.from(CLOSING_LABELS).some(lb => ln.startsWith(lb))
      && !ln.startsWith('Nominee') && !ln.startsWith('Opening Unit Balance:')) {
      prevDataLine = ln;
    }

    if (!inFolio) { i++; continue; }

    // ── folio metadata ──
    if (ln.startsWith('Folio No:')) {
      curFolio = ln.split('Folio No:', 1)[1].trim().split(' / ')[0];
      i++; continue;
    }
    if (ln.startsWith('Registrar :')) {
      curRegistrar = ln.split('Registrar :', 1)[1].trim();
      i++; continue;
    }
    if (ln.startsWith('Opening Unit Balance:')) {
      readingTxns = true;
      i++; continue;
    }
    if (!readingTxns) { i++; continue; }

    // ── closing data ──
    if (ln.startsWith('NAV on ')) {
      const mm = ln.match(/INR\s+([\d,]+\.?\d*)/);
      if (mm) closNav = parseFloat(mm[1].replace(/,/g, ''));
      const dm = ln.match(/(\d{2}-[A-Z][a-z]{2}-\d{4})/);
      if (dm) asOfDate = parseDate(dm[1]);
      i++; continue;
    }
    if (ln.startsWith('Market Value on ')) {
      const mm = ln.match(/INR\s+([\d,]+\.?\d*)/);
      if (mm) closMv = parseFloat(mm[1].replace(/,/g, ''));
      i++; continue;
    }
    if (ln.startsWith('Closing Unit Balance:')) {
      const mm = ln.match(/([\d,]+\.?\d*)/);
      if (mm) closUnits = parseFloat(mm[1].replace(/,/g, ''));
      i++; continue;
    }
    if (ln.startsWith('Total Cost Value:')) {
      const mm = ln.match(/([\d,]+\.?\d*)/);
      if (mm) totCost = parseFloat(mm[1].replace(/,/g, ''));
      i++; continue;
    }
    if (ln.startsWith('PAN:')) {
      flushFolio();
      reset();
      i++; continue;
    }
    if (ln.startsWith('KYC:')) { i++; continue; }
    if (ln.includes('***')) { i++; continue; }

    // ── transaction row ──
    if (DATE_RE.test(ln)) {
      const txnDateStr = ln.trim();
      let ahead = i + 1;

      while (ahead < lines.length && boiler.has(lines[ahead])) ahead++;
      if (ahead < lines.length && lines[ahead].includes('***')) {
        result.skipped_txns++;
        i = ahead;
        while (i < lines.length && lines[i].includes('***')) i++;
        continue;
      }

      if (ahead >= lines.length || !isNum(lines[ahead])) {
        result.skipped_txns++;
        i++;
        continue;
      }

      const amtVal = parseNum(lines[ahead]) || 0;
      ahead++;
      while (ahead < lines.length && boiler.has(lines[ahead])) ahead++;

      const priceVal = (ahead < lines.length && isNum(lines[ahead]))
        ? parseNum(lines[ahead]) || 0 : 0;
      if (ahead < lines.length && isNum(lines[ahead])) ahead++;
      while (ahead < lines.length && boiler.has(lines[ahead])) ahead++;

      const unitsVal = (ahead < lines.length && isNum(lines[ahead]))
        ? parseNum(lines[ahead]) || 0 : 0;
      if (ahead < lines.length && isNum(lines[ahead])) ahead++;
      while (ahead < lines.length && boiler.has(lines[ahead])) ahead++;

      // Transaction type + running balance
      const txnParts: string[] = [];
      while (ahead < lines.length) {
        const l = lines[ahead];
        if (DATE_RE.test(l) || l.startsWith('PAN:') || l.startsWith('KYC:')) break;
        if (Array.from(CLOSING_LABELS).some(lb => l.startsWith(lb))) break;
        if (l.includes('***')) break;
        if (boiler.has(l)) { ahead++; continue; }
        if (isNum(l)) {
          const peek = ahead + 1;
          const nextIsBreak = peek >= lines.length || DATE_RE.test(lines[peek])
            || lines[peek].startsWith('PAN:') || lines[peek].startsWith('KYC:')
            || Array.from(CLOSING_LABELS).some(lb => lines[peek].startsWith(lb))
            || lines[peek].includes('***');
          if (nextIsBreak) { ahead++; break; }
        }
        txnParts.push(l);
        ahead++;
      }

      const txnText = txnParts.join(' ').trim();

      if (Math.abs(unitsVal) < 1e-6) {
        result.skipped_txns++;
        i = ahead;
        continue;
      }

      const side = classify(txnText, unitsVal);
      if (!side) { result.skipped_txns++; i = ahead; continue; }

      const finalPrice = priceVal === 0 && Math.abs(unitsVal) > 1e-6
        ? Math.abs(amtVal) / Math.abs(unitsVal) : priceVal;

      folioTrades.push({
        isin: '',
        txn_date: parseDate(txnDateStr) || txnDateStr,
        side,
        quantity: Math.abs(unitsVal),
        price: Math.round(finalPrice * 10000) / 10000,
        amount: Math.abs(amtVal),
        folio: null,
      });
      i = ahead;
      continue;
    }

    i++;
  }

  // Flush last folio
  if (curIsin && inFolio) flushFolio();

  // Merge holdings with same ISIN:folio key
  const merged: Record<string, ParsedHolding> = {};
  for (const h of result.holdings) {
    const key = h.folio ? `${h.isin}:${h.folio}` : h.isin;
    if (merged[key]) {
      const m = merged[key];
      m.quantity += h.quantity;
      m.market_value = (m.market_value || 0) + (h.market_value || 0);
      if (m.quantity && m.market_value) {
        m.nav = Math.round(m.market_value / m.quantity * 10000) / 10000;
      }
    } else {
      merged[key] = h;
    }
  }
  result.holdings = Object.values(merged).filter(h => h.quantity > 0);

  if (asOfDate) result.as_of = asOfDate;
  if (!result.holdings.length) {
    result.warnings.push(
      'No holdings or transactions recognised. '
      + 'The PDF layout may differ from the expected CAMS/KFintech CAS format.',
    );
  }
  if (result.skipped_txns) {
    result.warnings.push(`${result.skipped_txns} non-financial rows skipped.`);
  }

  return result;
}
