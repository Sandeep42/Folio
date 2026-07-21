/**
 * ElssTrackerScreen — ELSS lock-in status
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { inr } from '../utils/format';

const DEMO: any[] = [];

export default function ElssTrackerScreen() {
  const lots = DEMO;

  if (!lots.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No ELSS holdings</Text>
        <Text style={styles.emptyDesc}>ELSS tax-saver fund lots will appear here with lock-in dates.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {lots.map((lot, i) => (
        <View key={i} style={styles.card}>
          <Text style={styles.name}>{lot.name}</Text>
          <Text style={styles.date}>Buy: {lot.buy_date} → Unlock: {lot.unlock_date}</Text>
          <Text style={styles.status}>{lot.locked ? `🔒 ${lot.days_remaining}d remaining` : '🔓 Unlocked'}</Text>
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
  date: { fontSize: 12, color: '#555', fontFamily: 'monospace', marginBottom: 4 },
  status: { fontSize: 13, fontWeight: '600' },
});
