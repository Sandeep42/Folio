/**
 * RollingReturnsScreen — 1Y / 3Y / 5Y XIRR per holding
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { pct } from '../utils/format';

const DEMO: any[] = [];

export default function RollingReturnsScreen() {
  const rows = DEMO;

  if (!rows.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No return data</Text>
        <Text style={styles.emptyDesc}>Import trade history to see rolling returns.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {rows.map((r, i) => (
        <View key={i} style={styles.card}>
          <Text style={styles.name}>{r.name}</Text>
          <View style={styles.returns}>
            <Text style={styles.returnLabel}>1Y</Text>
            <Text style={styles.returnVal}>{pct(r['1Y'])}</Text>
            <Text style={styles.returnLabel}>3Y</Text>
            <Text style={styles.returnVal}>{pct(r['3Y'])}</Text>
            <Text style={styles.returnLabel}>5Y</Text>
            <Text style={styles.returnVal}>{pct(r['5Y'])}</Text>
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
  name: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  returns: { flexDirection: 'row', gap: 16 },
  returnLabel: { fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 },
  returnVal: { fontSize: 14, fontWeight: '700', fontFamily: 'monospace' },
});
