/**
 * RollingReturnsScreen — 1Y / 3Y / 5Y XIRR per holding
 */

import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { usePortfolio } from '../hooks/usePortfolio';
import { xirr } from '../services/xirr';

const WINDOWS: [string, number][] = [['1Y', 365], ['3Y', 1095], ['5Y', 1825]];

function computeRolling(state: any, result: any) {
  const today = new Date();
  const byIsin: Record<string, any[]> = {};
  for (const t of state?.trades || []) {
    if (!byIsin[t.isin]) byIsin[t.isin] = [];
    byIsin[t.isin].push(t);
  }

  const rows: any[] = [];
  for (const [isin, trades] of Object.entries(byIsin)) {
    const h = result?.holdings?.find((v: any) => v.isin === isin);
    if (!h || !h.last_price || h.quantity <= 0) continue;

    const sorted = (trades as any[]).sort((a, b) => a.txn_date.localeCompare(b.txn_date));
    const currentVal = h.last_price * h.quantity;
    const row: any = { isin, name: h.name, current_value: Math.round(currentVal * 100) / 100 };

    for (const [label, days] of WINDOWS) {
      const cutoff = new Date(today.getTime() - days * 86400000);

      const lotsBefore = sorted.filter((t: any) => t.side === 'BUY' && new Date(t.txn_date) < cutoff);
      const sellsBeforeQty = sorted
        .filter((t: any) => t.side === 'SELL' && new Date(t.txn_date) < cutoff)
        .reduce((s: number, t: any) => s + t.quantity, 0);
      const qtyBefore = lotsBefore.reduce((s: number, t: any) => s + t.quantity, 0) - sellsBeforeQty;

      const flows: [Date, number][] = [];
      if (qtyBefore > 0 && lotsBefore.length) {
        const totalCost = lotsBefore.reduce((s: number, l: any) => s + l.quantity * l.price, 0);
        const totalQty = lotsBefore.reduce((s: number, l: any) => s + l.quantity, 0);
        flows.push([cutoff, -Math.round(qtyBefore * totalCost / totalQty * 100) / 100]);
      }

      for (const t of sorted) {
        const d = new Date(t.txn_date);
        if (d < cutoff) continue;
        const amt = t.side === 'BUY' ? -t.quantity * t.price : t.quantity * t.price;
        flows.push([d, Math.round(amt * 100) / 100]);
      }
      flows.push([today, currentVal]);

      row[label] = flows.length >= 2 ? xirr(flows) : null;
    }
    rows.push(row);
  }

  return rows.sort((a, b) => (b.current_value || 0) - (a.current_value || 0));
}

export default function RollingReturnsScreen() {
  const { state, result, loading } = usePortfolio();
  const rows = useMemo(() => computeRolling(state, result), [state, result]);

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" /></View>;

  if (!rows.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No return data</Text>
        <Text style={styles.emptyDesc}>Import trade history to see rolling returns.</Text>
      </View>
    );
  }

  const pct = (v: number | null) => v != null ? `${(v * 100).toFixed(2)}%` : '—';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {rows.map((r, i) => (
        <View key={i} style={styles.card}>
          <Text style={styles.name} numberOfLines={1}>{r.name}</Text>
          <View style={styles.returnsRow}>
            <View style={styles.retItem}>
              <Text style={styles.retLabel}>1Y</Text>
              <Text style={[styles.retVal, { color: (r['1Y'] || 0) >= 0 ? '#2e7d32' : '#d32f2f' }]}>{pct(r['1Y'])}</Text>
            </View>
            <View style={styles.retItem}>
              <Text style={styles.retLabel}>3Y</Text>
              <Text style={[styles.retVal, { color: (r['3Y'] || 0) >= 0 ? '#2e7d32' : '#d32f2f' }]}>{pct(r['3Y'])}</Text>
            </View>
            <View style={styles.retItem}>
              <Text style={styles.retLabel}>5Y</Text>
              <Text style={[styles.retVal, { color: (r['5Y'] || 0) >= 0 ? '#2e7d32' : '#d32f2f' }]}>{pct(r['5Y'])}</Text>
            </View>
          </View>
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
  name: { fontSize: 14, fontWeight: '600', marginBottom: 10 },
  returnsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  retItem: { alignItems: 'center' },
  retLabel: { fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  retVal: { fontSize: 16, fontWeight: '700' },
});
