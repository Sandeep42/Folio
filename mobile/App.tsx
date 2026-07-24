/**
 * App.tsx — Folio Mobile
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View, StyleSheet, Text, StatusBar } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { loadState, saveState, PortfolioState } from './src/storage';
import { HoldingView } from './src/models/HoldingView';
import { analyze, AnalyzeResult } from './src/services/analysis';
import { PortfolioCtx } from './src/hooks/usePortfolio';

import UploadScreen from './src/screens/UploadScreen';
import HoldingsScreen from './src/screens/HoldingsScreen';
import HoldingDetailScreen from './src/screens/HoldingDetailScreen';
import AllocationScreen from './src/screens/AllocationScreen';

export type RootTabParamList = {
  Portfolio: undefined;
  Allocation: undefined;
  Upload: undefined;
};

export type PortfolioStackParamList = {
  HoldingsList: undefined;
  HoldingDetail: { holding: HoldingView };
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const PStack = createNativeStackNavigator<PortfolioStackParamList>();

function PortfolioStackNav() {
  return (
    <PStack.Navigator screenOptions={{
      headerStyle: { backgroundColor: '#1976d2' },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: '600' },
    }}>
      <PStack.Screen name="HoldingsList" component={HoldingsScreen} options={{ title: 'Portfolio' }} />
      <PStack.Screen name="HoldingDetail" component={HoldingDetailScreen} options={{ title: 'Detail' }} />
    </PStack.Navigator>
  );
}

function TabNav() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#1976d2' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
        tabBarActiveTintColor: '#1976d2',
        tabBarInactiveTintColor: '#999',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: { paddingBottom: insets.bottom + 4, paddingTop: 4, height: 56 + insets.bottom },
      }}>
      <Tab.Screen name="Portfolio" options={{ headerShown: false, tabBarLabel: 'Portfolio', tabBarIcon: ({ color }) => <MaterialCommunityIcons name="finance" size={22} color={color} /> }} children={() => <PortfolioStackNav />} />
      <Tab.Screen name="Allocation" options={{ title: 'Allocation', tabBarLabel: 'Allocation', tabBarIcon: ({ color }) => <MaterialCommunityIcons name="pie-chart" size={22} color={color} /> }} children={() => <AllocationScreen />} />
      <Tab.Screen name="Upload" options={{ title: 'Import', tabBarLabel: 'Import', tabBarIcon: ({ color }) => <MaterialCommunityIcons name="file-upload" size={22} color={color} /> }}>
        {() => <UploadScreen />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function App() {
  const [state, setState] = useState<PortfolioState | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const computeIdRef = useRef(0);

  useEffect(() => {
    loadState().then(s => { setState(s); setLoading(false); });
  }, []);

  useEffect(() => { if (state) saveState(state); }, [state]);

  const compute = useCallback(async (fetchPrices: boolean) => {
    if (!state) return;
    if (!state.holdings.length && !state.trades.length) { setResult(null); return; }
    const id = ++computeIdRef.current;
    setLoading(true); setError('');
    try {
      const res = await analyze(state.holdings, state.trades, state.ltcgRealized, fetchPrices);
      if (id !== computeIdRef.current) return;
      setResult(res);
      if (res.warnings.length) setError(res.warnings.join(' · '));
    } catch (e: any) { setError(e.message); }
    finally { if (id === computeIdRef.current) setLoading(false); }
  }, [state]);

  useEffect(() => { if (state) compute(false); }, [state, compute]);

  const refreshPrices = useCallback(() => compute(true), [compute]);
  const recompute = useCallback(() => compute(false), [compute]);

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

  const clearData = useCallback(() => {
    setState({ holdings: [], trades: [], ltcgRealized: 0 });
    setResult(null);
    import('./src/storage').then(m => m.clearState());
  }, []);

  const ctx = useMemo(() => ({
    state: state!, result, setState,
    onHoldings: mergeHoldings, onTrades: addTrades,
    refreshPrices, recompute, loading, clearData,
  }), [state, result, loading, refreshPrices, recompute]);

  if (!state) {
    return <View style={styles.centered}><ActivityIndicator size="large" /></View>;
  }

  return (
    <PortfolioCtx.Provider value={ctx}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor="#1976d2" />
        <View style={{ flex: 1 }}>
        <NavigationContainer>
        <TabNav />
        </NavigationContainer>
        </View>
      </SafeAreaProvider>
    </PortfolioCtx.Provider>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
