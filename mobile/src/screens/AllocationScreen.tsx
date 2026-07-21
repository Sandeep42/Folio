/**
 * AllocationScreen — Portfolio allocation breakdown
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { inr } from '../utils/format';

const DEMO: any[] = [];

export default function AllocationScreen() {
  const categories = DEMO;

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
  value: { fontSize: 13, color: '#555', fontFamily: 'monospace' },
});
