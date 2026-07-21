import { AssetType, CostBasisType } from './enums';
import { Lot } from './Lot';

export interface Holding {
  isin: string;
  name: string;
  asset_type: AssetType;
  quantity: number;
  symbol: string | null;
  folio: string | null;
  amfi_code: string | null;
  avg_cost: number | null;
  last_price: number | null;
  price_as_of: string | null;
  lots: Lot[];
  cost_basis_type: CostBasisType;
}
