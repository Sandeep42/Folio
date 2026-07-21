/** A single acquisition lot — one buy transaction or a CAS synthetic lot. */
export interface Lot {
  buy_date: string;       // YYYY-MM-DD
  quantity: number;
  price: number;
  source: 'cas' | 'tradebook' | 'manual';
}
