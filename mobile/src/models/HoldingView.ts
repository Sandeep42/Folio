import { CostBasisType, AssetType } from './enums';

/** Enriched holding returned to the UI after analysis. */
export interface HoldingView {
  isin: string;
  name: string;
  asset_type: AssetType;
  quantity: number;
  symbol: string | null;
  folio: string | null;
  avg_cost: number | null;
  invested: number | null;
  last_price: number | null;
  current_value: number | null;
  pnl: number | null;
  pnl_pct: number | null;
  xirr: number | null;
  price_as_of: string | null;
  cost_basis_type: CostBasisType;
  xirr_excluded: boolean;
}
