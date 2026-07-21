/**
 * AllocationScreen — Portfolio allocation breakdown from context
 */

import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { usePortfolio } from '../hooks/usePortfolio';
import { inr } from '../utils/format';

function classify(name: string, isin: string): string {
  const n = name.toUpperCase();
  if (isin.startsWith('INE')) return 'Stocks';
  if (['ETF', 'BEES', 'EXCHANGE TRADED'].some(x => n.includes(x))) return 'ETF';
  if (['ELSS', 'TAX SAVER', 'TAX PLAN'].some(x => n.includes(x))) return 'ELSS';
  if (['US ', 'NASDAQ', 'S&P', 'WORLD', 'OVERSEAS', 'INTERNATIONAL', 'GLOBAL', 'FOF'].some(x => n.includes(x))) return 'International';
  if (['INDEX', 'NIFTY', 'SENSEX'].some(x => n.includes(x))) return 'Index';
  if (['SMALL CAP', 'SMALLCAP'].some(x => n.includes(x))) return 'Small cap';
  if (['MID CAP', 'MIDCAP'].some(x => n.includes(x))) return 'Mid cap';
  if (['LARGE CAP', 'LARGECAP', 'BLUECHIP'].some(x => n.includes(x))) return 'Large cap';
  if (['FLEXI', 'MULTI CAP', 'MULTICAP', 'FLEXICAP'].some(x => n.includes(x))) return 'Flexi cap';
  if (['HYBRID', 'BALANCED', 'CONSERVATIVE'].some(x => n.includes(x))) return 'Hybrid';
  if (['DEBT', 'LIQUID', 'SHORT TERM', 'DURATION', 'SAVINGS', 'MONEY MARKET'].some(x => n.includes(x))) return 'Debt';
  return 'Equity (other)';
}

export default function AllocationScreen() {
  const { result, loading } = usePortfolio();

  const categories = useMemo(() => {
    const views = result?.holdings || [];
    const byCat: Record<string, { value: number; invested: number; count: number }> = {};

    for (const v of views) {
      const cat = classify(v.name, v.isin);
      if (!byCat[cat]) byCat[cat] = { value: 0, invested: 0, count: 0 };
      byCat[cat].value += v.current_value || 0;
      byCat[cat].invested += v.invested || 0;
      byCat[cat].count++;
    }

    const totalValue = Object.values(byCat).reduce((s, c) => s + c.value, 0);
    return Object.entries(byCat)
      .map(([category, d]) => ({
        category, value: Math.round(d.value * 100) / 100,
        invested: Math.round(d.invested * 100) / 100,
        pct: totalValue ? Math.round(d.value / totalValue * 10000) / 100 : 0,
        count: d.count,
      }))
      .sort((a, b) => b.value - a.value);
  }, [result]);

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" /></View>;

  if (!categories.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No allocation data</Text>
        <Text style={styles.emptyDesc}>Import holdings to see your portfolio breakdown.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {categories.map((cat, i) => (
        <View key={i} style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.catName}>{cat.category}</Text>
            <Text style={styles.pct}>{cat.pct}%</Text>
          </View>
          <Text style={styles.value}>{inr(cat.value)}</Text>
          <Text style={styles.invested}>Invested: {inr(cat.invested)} · {cat.count} holding(s)</Text>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  catName: { fontSize: 15, fontWeight: '600' },
  pct: { fontSize: 15, fontWeight: '700', color: '#1976d2' },
  value: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  invested: { fontSize: 12, color: '#555' },
});
