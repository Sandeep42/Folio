/**
 * TaxHarvestScreen — Gain & loss harvesting suggestions from context
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { usePortfolio } from '../hooks/usePortfolio';
import { inr } from '../utils/format';

export default function TaxHarvestScreen() {
  const { result, loading } = usePortfolio();
  const suggestions = result?.harvest?.suggestions || [];

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" /></View>;

  if (!suggestions.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No harvest suggestions</Text>
        <Text style={styles.emptyDesc}>Import trade history to see tax harvesting opportunities.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {suggestions.map((s: any, i: number) => (
        <View key={i} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={[styles.badge, s.kind === 'gain_harvest' ? styles.badgeGain : styles.badgeLoss]}>
              {s.kind === 'gain_harvest' ? 'GAIN' : 'LOSS'}
            </Text>
            <Text style={styles.cardTitle} numberOfLines={2}>{s.name}</Text>
          </View>
          <Text style={styles.gain}>{inr(s.estimated_gain)}</Text>
          <Text style={styles.rationale}>{s.rationale}</Text>
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
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  badge: { fontSize: 10, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  badgeGain: { backgroundColor: '#e8f5e9', color: '#2e7d32' },
  badgeLoss: { backgroundColor: '#fce4ec', color: '#c62828' },
  cardTitle: { fontSize: 14, fontWeight: '600', flex: 1 },
  gain: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  rationale: { fontSize: 12, color: '#555', lineHeight: 18 },
});
