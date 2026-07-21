/**
 * App.tsx — Folio Mobile
 *
 * Bottom tab navigation with a Stack for the main portfolio flow.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text, ActivityIndicator, View, StyleSheet } from 'react-native';

import { loadState, saveState, clearState, PortfolioState } from './src/storage';
import { HoldingView } from './src/models/HoldingView';
import { analyze, AnalyzeResult } from './src/services/analysis';

// Lazy-import screens so we can build them incrementally
import UploadScreen from './src/screens/UploadScreen';
import HoldingsScreen from './src/screens/HoldingsScreen';
import HoldingDetailScreen from './src/screens/HoldingDetailScreen';

export type RootTabParamList = {
  Portfolio: undefined;
  Upload: undefined;
};

export type PortfolioStackParamList = {
  HoldingsList: undefined;
  HoldingDetail: { holding: HoldingView };
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<PortfolioStackParamList>();

function PortfolioStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="HoldingsList"
        component={HoldingsScreen}
        options={{ title: 'Portfolio' }}
      />
      <Stack.Screen
        name="HoldingDetail"
        component={HoldingDetailScreen}
        options={{ title: 'Detail' }}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  const [state, setState] = useState<PortfolioState | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadState().then(s => {
      setState(s);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (state) saveState(state);
  }, [state]);

  const compute = useCallback(async (fetchPrices: boolean) => {
    if (!state) return;
    if (!state.holdings.length && !state.trades.length) { setResult(null); return; }
    setLoading(true);
    setError('');
    try {
      const res = await analyze(state.holdings, state.trades, state.ltcgRealized, fetchPrices);
      setResult(res);
      if (res.warnings.length) setError(res.warnings.join(' · '));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [state]);

  useEffect(() => {
    if (state) compute(false);
  }, [state, compute]);

  const mergeHoldings = (incoming: any[]) =>
    setState(s => {
      if (!s) return s;
      const map = new Map(s.holdings.map(h => [`${h.isin}:${h.folio || ''}`, h]));
      for (const h of incoming) {
        const key = `${h.isin}:${h.folio || ''}`;
        const prev = map.get(key);
        map.set(key, prev ? { ...h, symbol: prev.symbol || h.symbol } : h);
      }
      return { ...s, holdings: [...map.values()] };
    });

  const addTrades = (trades: any[]) =>
    setState(s => s ? { ...s, trades: [...s.trades, ...trades] } : s);

  if (!state) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={{ headerShown: false }}>
        <Tab.Screen
          name="Portfolio"
          options={{ title: 'Portfolio' }}
        >
          {() => (
            <PortfolioStack />
          )}
        </Tab.Screen>
        <Tab.Screen
          name="Upload"
          options={{ title: 'Import' }}
        >
          {() => (
            <UploadScreen
              holdings={state.holdings}
              onHoldings={mergeHoldings}
              onTrades={addTrades}
            />
          )}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
