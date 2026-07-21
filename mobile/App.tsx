/**
 * App.tsx — Folio Mobile
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';

import { loadState, saveState, PortfolioState } from './src/storage';
import { HoldingView } from './src/models/HoldingView';
import { analyze, AnalyzeResult } from './src/services/analysis';
import { PortfolioCtx } from './src/hooks/usePortfolio';

import UploadScreen from './src/screens/UploadScreen';
import HoldingsScreen from './src/screens/HoldingsScreen';
import HoldingDetailScreen from './src/screens/HoldingDetailScreen';
import TaxHarvestScreen from './src/screens/TaxHarvestScreen';
import CapitalGainsScreen from './src/screens/CapitalGainsScreen';
import AllocationScreen from './src/screens/AllocationScreen';
import ElssTrackerScreen from './src/screens/ElssTrackerScreen';
import FundPnlScreen from './src/screens/FundPnlScreen';
import RollingReturnsScreen from './src/screens/RollingReturnsScreen';

export type RootTabParamList = {
  Portfolio: undefined;
  TaxHarvest: undefined;
  CapitalGains: undefined;
  Allocation: undefined;
  More: undefined;
  Upload: undefined;
};

export type PortfolioStackParamList = {
  HoldingsList: undefined;
  HoldingDetail: { holding: HoldingView };
};

export type MoreStackParamList = {
  MoreMenu: undefined;
  ElssTracker: undefined;
  FundPnl: undefined;
  RollingReturns: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const PStack = createNativeStackNavigator<PortfolioStackParamList>();
const MStack = createNativeStackNavigator<MoreStackParamList>();

function PortfolioStackNav() {
  return (
    <PStack.Navigator>
      <PStack.Screen name="HoldingsList" component={HoldingsScreen} options={{ title: 'Portfolio' }} />
      <PStack.Screen name="HoldingDetail" component={HoldingDetailScreen} options={{ title: 'Detail' }} />
    </PStack.Navigator>
  );
}

function MoreStackNav() {
  return (
    <MStack.Navigator>
      <MStack.Screen name="ElssTracker" component={ElssTrackerScreen} options={{ title: 'ELSS Tracker' }} />
      <MStack.Screen name="FundPnl" component={FundPnlScreen} options={{ title: 'Fund P&L' }} />
      <MStack.Screen name="RollingReturns" component={RollingReturnsScreen} options={{ title: 'Rolling Returns' }} />
    </MStack.Navigator>
  );
}

export default function App() {
  const [state, setState] = useState<PortfolioState | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadState().then(s => { setState(s); setLoading(false); });
  }, []);

  useEffect(() => { if (state) saveState(state); }, [state]);

  const compute = useCallback(async (fetchPrices: boolean) => {
    if (!state) return;
    if (!state.holdings.length && !state.trades.length) { setResult(null); return; }
    setLoading(true); setError('');
    try {
      const res = await analyze(state.holdings, state.trades, state.ltcgRealized, fetchPrices);
      setResult(res);
      if (res.warnings.length) setError(res.warnings.join(' · '));
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [state]);

  useEffect(() => { if (state) compute(false); }, [state, compute]);

  const refreshPrices = useCallback(() => compute(true), [compute]);

  const mergeHoldings = (incoming: any[]) =>
    setState(s => {
      if (!s) return s;
      const map = new Map(s.holdings.map(h => [`${h.isin}:${h.folio || ''}`, h]));
      for (const h of incoming) {
        const key = `${h.isin}:${h.folio || ''}`;
        map.set(key, map.get(key) ? { ...h, symbol: map.get(key)!.symbol || h.symbol } : h);
      }
      return { ...s, holdings: [...map.values()] };
    });

  const addTrades = (trades: any[]) =>
    setState(s => s ? { ...s, trades: [...s.trades, ...trades] } : s);

  const ctx = useMemo(() => ({
    state: state!, result,
    setState,
    onHoldings: mergeHoldings,
    onTrades: addTrades,
    refreshPrices,
    loading,
  }), [state, result, loading, refreshPrices]);

  if (!state) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <PortfolioCtx.Provider value={ctx}>
      <NavigationContainer>
        <Tab.Navigator screenOptions={{ headerShown: false }}>
          <Tab.Screen name="Portfolio" options={{ title: 'Portfolio' }} children={() => <PortfolioStackNav />} />
          <Tab.Screen name="TaxHarvest" options={{ title: 'Harvest' }} children={() => <TaxHarvestScreen />} />
          <Tab.Screen name="CapitalGains" options={{ title: 'Gains' }} children={() => <CapitalGainsScreen />} />
          <Tab.Screen name="Allocation" options={{ title: 'Allocation' }} children={() => <AllocationScreen />} />
          <Tab.Screen name="More" options={{ title: 'More' }} children={() => <MoreStackNav />} />
          <Tab.Screen name="Upload" options={{ title: 'Import' }}>
            {() => <UploadScreen />}
          </Tab.Screen>
        </Tab.Navigator>
      </NavigationContainer>
    </PortfolioCtx.Provider>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
