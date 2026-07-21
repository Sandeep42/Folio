/**
 * HoldingsScreen — Main portfolio view
 */

import React, { useState, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HoldingView } from '../models/HoldingView';
import { PortfolioStackParamList } from '../../App';

type Nav = NativeStackNavigationProp<PortfolioStackParamList, 'HoldingsList'>;

// Inline from api.ts helpers
const inr = (v: number | null | undefined, d = 0) => {
  if (v == null) return '—';
  return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d });
};

const pct = (v: number | null | undefined) => {
  if (v == null) return '—';
  return (v * 100).toFixed(2) + '%';
};

// Dummy result until we thread analyze through
const DEMO_VIEWS: HoldingView[] = [];

export default function HoldingsScreen() {
  const nav = useNavigation<Nav>();
  const [views] = useState(DEMO_VIEWS);

  const totalInvested = useMemo(() => views.reduce((s, v) => s + (v.invested || 0), 0), [views]);
  const totalCurrent = useMemo(() => views.reduce((s, v) => s + (v.current_value || 0), 0), [views]);

  if (!views.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No holdings yet</Text>
        <Text style={styles.emptyDesc}>Import your CAS PDF or tradebook to get started.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Summary bar */}
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Invested</Text>
          <Text style={styles.summaryValue}>{inr(totalInvested)}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Current</Text>
          <Text style={styles.summaryValue}>{inr(totalCurrent)}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>P&L</Text>
          <Text style={[styles.summaryValue, { color: totalCurrent >= totalInvested ? '#2e7d32' : '#d32f2f' }]}>
            {inr(totalCurrent - totalInvested)}
          </Text>
        </View>
      </View>

      <FlatList
        data={views}
        keyExtractor={(item) => `${item.isin}:${item.folio || ''}`}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => nav.navigate('HoldingDetail', { holding: item })}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.rowIsin}>{item.isin}</Text>
              <Text style={styles.rowQty}>
                {item.quantity.toLocaleString('en-IN', { maximumFractionDigits: 3 })} units
              </Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>{inr(item.current_value)}</Text>
              <Text style={[styles.rowPnl, { color: (item.pnl || 0) >= 0 ? '#2e7d32' : '#d32f2f' }]}>
                {item.pnl != null ? `${item.pnl >= 0 ? '+' : ''}${inr(item.pnl)}` : '—'}
              </Text>
              <Text style={styles.rowXirr}>{pct(item.xirr)}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: '#666', textAlign: 'center' },
  summary: {
    flexDirection: 'row', backgroundColor: '#fff', padding: 16, gap: 16,
    borderBottomWidth: 1, borderBottomColor: '#e0e0e0',
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { fontSize: 16, fontWeight: '600', fontFamily: 'monospace', marginTop: 4 },
  row: {
    flexDirection: 'row', backgroundColor: '#fff', padding: 14, marginHorizontal: 8, marginVertical: 4,
    borderRadius: 10, justifyContent: 'space-between',
  },
  rowLeft: { flex: 1, marginRight: 12 },
  rowName: { fontSize: 14, fontWeight: '600' },
  rowIsin: { fontSize: 11, color: '#999', marginTop: 2 },
  rowQty: { fontSize: 12, color: '#666', marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  rowValue: { fontSize: 14, fontWeight: '600', fontFamily: 'monospace' },
  rowPnl: { fontSize: 12, fontFamily: 'monospace', marginTop: 2 },
  rowXirr: { fontSize: 11, color: '#666', marginTop: 2 },
});
