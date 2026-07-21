/** A single cash-flow row for XIRR computation. */
export interface Transaction {
  txn_date: string;   // YYYY-MM-DD
  amount: number;     // negative = invested, positive = redeemed
  isin: string;
  folio: string | null;
  description: string;
}
