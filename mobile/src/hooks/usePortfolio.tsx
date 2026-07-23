/**
 * PortfolioContext — shares analyze result and state across all screens
 */

import React, { createContext, useContext } from 'react';
import { PortfolioState } from '../storage';
import { AnalyzeResult } from '../services/analysis';

export interface PortfolioContextValue {
  state: PortfolioState;
  result: AnalyzeResult | null;
  setState: React.Dispatch<React.SetStateAction<PortfolioState | null>>;
  onHoldings: (h: any[]) => void;
  onTrades: (t: any[]) => void;
  refreshPrices: () => void;
  recompute: () => void;
  loading: boolean;
}

export const PortfolioCtx = createContext<PortfolioContextValue | null>(null);

export function usePortfolio() {
  const ctx = useContext(PortfolioCtx);
  if (!ctx) throw new Error('usePortfolio must be used within PortfolioProvider');
  return ctx;
}
