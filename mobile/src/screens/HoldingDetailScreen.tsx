/**
 * HoldingDetailScreen — Per-holding detail with lots and transaction history
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { PortfolioStackParamList } from '../../App';
import { HoldingView } from '../models/HoldingView';
import { inr, pct } from '../utils/format';

type Route = RouteProp<PortfolioStackParamList, 'HoldingDetail'>;

export default function HoldingDetailScreen() {
  const route = useRoute<Route>();
  const { holding } = route.params;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Summary grid */}
      <View style={styles.grid}>
        {[
          ['Qty held', holding.quantity.toLocaleString('en-IN', { maximumFractionDigits: 3 })],
          ['Current value', holding.current_value ? `₹${inr(holding.current_value)}` : '—'],
          ['XIRR', pct(holding.xirr)],
          ['Invested', holding.invested ? `₹${inr(holding.invested)}` : '—'],
          ['Unrealised gain', holding.pnl != null ? `${holding.pnl >= 0 ? '+' : ''}₹${inr(holding.pnl)}` : '—'],
          ['Price / NAV', holding.last_price ? `₹${inr(holding.last_price, 2)}` : '—'],
        ].map(([label, val], i) => (
          <View key={i} style={styles.gridCell}>
            <Text style={styles.gridLabel}>{label}</Text>
            <Text style={[styles.gridValue, i >= 3 ? { fontFamily: 'monospace' } : undefined]}>
              {val}
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Holding info</Text>
      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>ISIN</Text>
        <Text style={styles.infoValue}>{holding.isin}</Text>
        <Text style={styles.infoLabel}>Folio</Text>
        <Text style={styles.infoValue}>{holding.folio || '—'}</Text>
        <Text style={styles.infoLabel}>Asset type</Text>
        <Text style={styles.infoValue}>{holding.asset_type}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 16 },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 1, backgroundColor: '#e0e0e0',
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10, overflow: 'hidden', marginBottom: 20,
  },
  gridCell: {
    width: '33.33%', backgroundColor: '#fff', padding: 12,
    borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: '#e0e0e0',
  },
  gridLabel: { fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  gridValue: { fontSize: 15, fontWeight: '600' },
  sectionTitle: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  infoCard: { backgroundColor: '#fff', borderRadius: 10, padding: 14, gap: 4 },
  infoLabel: { fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 14, fontFamily: 'monospace', marginBottom: 8 },
});
