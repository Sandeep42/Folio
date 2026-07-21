/** A single buy/sell row from a tradebook CSV. */
export interface TradeRow {
  isin: string;
  txn_date: string;       // YYYY-MM-DD
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  folio: string | null;
  symbol: string | null;  // stock ticker for yfinance lookup
}
