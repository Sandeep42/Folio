/**
 * FundPnlScreen — Consolidated P&L per fund (realised + unrealised)
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { inr } from '../utils/format';

const DEMO: any[] = [];

export default function FundPnlScreen() {
  const rows = DEMO;

  if (!rows.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No P&L data</Text>
        <Text style={styles.emptyDesc}>Import trade history to see per-fund profit and loss.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {rows.map((r, i) => (
        <View key={i} style={styles.card}>
          <Text style={styles.name}>{r.name}</Text>
          <Text style={styles.total}>
            Total: <Text style={{ color: (r.total_pnl || 0) >= 0 ? '#2e7d32' : '#d32f2f' }}>
              {inr(r.total_pnl)}
            </Text>
          </Text>
          <Text style={styles.detail}>
            Realised: {inr(r.realised_gain)} · Unrealised: {inr(r.unrealised)}
          </Text>
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
  total: { fontSize: 16, fontWeight: '700', fontFamily: 'monospace', marginBottom: 4 },
  detail: { fontSize: 12, color: '#555' },
});
