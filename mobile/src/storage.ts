/**
 * Browser-like persistence using AsyncStorage.
 * Same key structure as the desktop app: 'cas-portfolio-v1'
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Holding } from './models/Holding';
import { TradeRow } from './models/TradeRow';

const KEY = 'cas-portfolio-v1';

export interface PortfolioState {
  holdings: Holding[];
  trades: TradeRow[];
  ltcgRealized: number;
}

const defaultState: PortfolioState = {
  holdings: [],
  trades: [],
  ltcgRealized: 0,
};

export async function loadState(): Promise<PortfolioState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return defaultState;
}

export async function saveState(state: PortfolioState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

export async function clearState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch { /* ignore */ }
}
