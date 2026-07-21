import { AssetType } from './enums';

export interface HarvestLot {
  isin: string;
  name: string;
  asset_type: AssetType;
  buy_date: string;       // YYYY-MM-DD
  quantity: number;
  buy_price: number;
  last_price: number;
  unrealized_gain: number;
  term: 'LTCG' | 'STCG';
  days_to_ltcg: number | null;
}

export interface SellLot {
  buy_date: string;
  quantity_to_sell: number;
  buy_price: number;
  last_price: number;
  gain: number;
  term: 'LTCG' | 'STCG';
  days_to_ltcg: number | null;
}

export interface HarvestSuggestion {
  kind: 'gain_harvest' | 'loss_harvest';
  isin: string;
  name: string;
  quantity: number;
  estimated_gain: number;
  rationale: string;
  lot_breakdown: SellLot[];
  within_exemption: boolean;
}

export interface TaxHarvestReport {
  fy_label: string;
  ltcg_exemption_limit: number;
  ltcg_realized_assumed: number;
  ltcg_exemption_remaining: number;
  unrealized_ltcg: number;
  unrealized_stcg: number;
  unrealized_lt_losses: number;
  unrealized_st_losses: number;
  lots: HarvestLot[];
  suggestions: HarvestSuggestion[];
}
