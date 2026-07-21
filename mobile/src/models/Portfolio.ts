export interface PortfolioSummary {
  invested: number | null;
  current_value: number | null;
  pnl: number | null;
  pnl_pct: number | null;
  xirr: number | null;
  holdings_count: number;
  priced_count: number;
}

export interface AnalyzeRequest {
  holdings: any[];
  trades: any[];
  ltcg_realized: number;
  fetch_prices: boolean;
}

export interface AnalyzeResponse {
  summary: PortfolioSummary;
  holdings: any[];
  harvest: any;
  warnings: string[];
}
