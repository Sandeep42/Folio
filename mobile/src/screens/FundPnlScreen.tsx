/**
 * FundPnlScreen — P&L per fund using portfolio result data + realised gains
 */

import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { usePortfolio } from '../hooks/usePortfolio';
import { inr } from '../utils/format';

export default function FundPnlScreen() {
  const { state, result, loading } = usePortfolio();

  const rows = useMemo(() => {
    const views = result?.holdings || [];
    const trades = state?.trades || [];

    // Start with portfolio result values (already computed correctly)
    const byIsin: Record<string, any> = {};
    for (const v of views) {
      byIsin[v.isin] = {
        isin: v.isin, name: v.name,
        total_invested: v.invested || 0,
        current_value: v.current_value || 0,
        unrealised: v.pnl || 0,
        realised_gain: 0,
      };
    }

    // Add realised gains from sell trades (simple sum, no FIFO needed for total)
    for (const t of trades) {
      if (t.side !== 'SELL') continue;
      if (!byIsin[t.isin]) {
        byIsin[t.isin] = {
          isin: t.isin, name: t.symbol || t.isin,
          total_invested: 0, current_value: 0, unrealised: 0, realised_gain: 0,
        };
      }
      byIsin[t.isin].realised_gain += Math.round(t.quantity * t.price * 100) / 100;
    }

    return Object.values(byIsin)
      .map(r => ({
        ...r,
        total_pnl: Math.round((r.realised_gain + r.unrealised) * 100) / 100,
      }))
      .sort((a, b) => (b.total_pnl || 0) - (a.total_pnl || 0));
  }, [state, result]);

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" /></View>;
  if (!rows.length) return <View style={styles.centered}><Text style={styles.emptyTitle}>No P&L data</Text><Text style={styles.emptyDesc}>Import trade history to see per-fund profit and loss.</Text></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {rows.map((r, i) => (
        <View key={i} style={styles.card}>
          <Text style={styles.name} numberOfLines={1}>{r.name}</Text>
          <Text style={[styles.total, { color: (r.total_pnl || 0) >= 0 ? '#2e7d32' : '#d32f2f' }]}>
            {r.total_pnl >= 0 ? '+' : ''}{inr(r.total_pnl)}
          </Text>
          <Text style={styles.detail}>Realised: {inr(r.realised_gain)} · Unrealised: {inr(r.unrealised)}</Text>
          <Text style={styles.invested}>Invested: {inr(r.total_invested)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 16, gap: 12 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: '#666', textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14 },
  name: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  total: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  detail: { fontSize: 12, color: '#555' },
  invested: { fontSize: 11, color: '#999', marginTop: 4 },
});
