/**
 * CapitalGainsScreen — Realised capital gains grouped by FY
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { inr } from '../utils/format';

const DEMO: any[] = [];

export default function CapitalGainsScreen() {
  const gains = DEMO;

  if (!gains.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No realised gains</Text>
        <Text style={styles.emptyDesc}>Sell transactions will appear here grouped by financial year.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {gains.map((fy, i) => (
        <View key={i} style={styles.card}>
          <Text style={styles.fy}>{fy.fy}</Text>
          <Text style={styles.total}>LTCG: {inr(fy.ltcg)} · STCG: {inr(fy.stcg)}</Text>
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
  fy: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  total: { fontSize: 13, color: '#555', fontFamily: 'monospace' },
});
