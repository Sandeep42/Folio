/**
 * Parser specifically for PDFBox-extracted CAMS/KFintech CAS PDF text.
 *
 * PDFBox outputs table cells on a single line (space separated) instead of
 * one-per-line like PyMuPDF. The column order is also different:
 *   Date | Transaction Type | Amount | Units | Price | Balance
 * vs PyMuPDF's cell-per-line: Date, Amount, Price, Units, Type, Balance.
 *
 * This parser splits compound lines into individual cells so the standard
 * parseText() state machine can process them correctly.
 */

const CELL_DATE_RE = /^\d{2}-[A-Z][a-z]{2}-\d{4}$/;
const CELL_NUM_RE = /^\(?[\d,]+\.?\d*\)?$/;

/**
 * Split PDFBox compound lines into individual cell lines matching
 * PyMuPDF's output format (Date, Amount, Price, Units, Type, Balance).
 */
export function preprocessPdfBox(text: string): string {
  const lines: string[] = [];
  for (const rawLine of text.split('\n')) {
    const ln = rawLine.trim();
    if (!ln) continue;

    const toks = ln.split(/\s+/);

    // Check if this line starts with a date
    if (CELL_DATE_RE.test(toks[0])) {
      // Count numeric tokens after the date
      const numToks = toks.filter((t, i) => i > 0 && CELL_NUM_RE.test(t.replace(/[()]/g, ''))).length;

      if (numToks >= 3) {
        // PDFBox compound line — split into cell-per-line format
        // Tokens: Date | Type... | Amount | Units | Price | Balance
        // Target: Date, Amount, Price, Units, Type..., Balance
        const date = toks[0];

        // Find numeric tokens by position
        const numIndices: number[] = [];
        for (let i = 1; i < toks.length; i++) {
          const clean = toks[i].replace(/[()]/g, '');
          if (CELL_NUM_RE.test(clean)) numIndices.push(i);
        }

        if (numIndices.length >= 4) {
          // Standard format: Date | Type... | Amount | Units | Price | Balance
          const amountIdx = numIndices[0];
          const unitsIdx = numIndices[1];
          const priceIdx = numIndices[2];
          const balIdx = numIndices[3];

          const txnType = toks.slice(1, amountIdx).join(' ');

          lines.push(date);
          lines.push(toks[amountIdx]);   // Amount
          lines.push(toks[priceIdx]);    // Price
          lines.push(toks[unitsIdx]);    // Units
          lines.push(txnType);           // Transaction type
          lines.push(toks[balIdx]);      // Running balance
          continue;
        } else if (numIndices.length === 1 && ln.includes('***')) {
          // Non-financial entry: Date | *** Description ***
          lines.push(date);
          lines.push(toks.slice(1).join(' '));
          continue;
        }
      }
    }

    // Check if this is a closing data line with multiple values merged
    if (ln.includes('Closing Unit Balance:') && ln.includes('NAV on ') && ln.includes('Total Cost Value:')) {
      // Parse the merged closing line
      const parts: string[] = [];
      let buf = '';
      for (const t of toks) {
        if (t.startsWith('Closing') || t.startsWith('NAV') || t.startsWith('Total') || t.startsWith('Market')) {
          if (buf) parts.push(buf.trim());
          buf = t;
        } else if (t.startsWith('INR') || t.startsWith(':') || CELL_NUM_RE.test(t.replace(/,/g, ''))) {
          buf += ' ' + t;
        } else {
          buf += ' ' + t;
        }
      }
      if (buf) parts.push(buf.trim());
      for (const p of parts) lines.push(p);
      continue;
    }

    // Pass through all other lines
    lines.push(ln);
  }

  return lines.join('\n');
}

/**
 * Parse CAMS/KFintech CAS text using the PDFBox-aware pre-processor.
 * First tries standard parseText, if trades=0 and text looks like PDFBox
 * format, pre-processes and re-parses.
 */
export function parseCamsKfinPdfBoxText(text: string): ReturnType<typeof import('./casPdf').parseCamsKfinCasText> {
  // Dynamic import to avoid circular dependency
  const { parseCamsKfinCasText } = require('./casPdf');

  // Try standard parser first
  let result = parseCamsKfinCasText(text);

  // If no trades but text has PDFBox-style compound lines, pre-process
  if (!result.trades.length && text.includes('Purchase-SIP')) {
    const processed = preprocessPdfBox(text);
    result = parseCamsKfinCasText(processed);
  }

  return result;
}
