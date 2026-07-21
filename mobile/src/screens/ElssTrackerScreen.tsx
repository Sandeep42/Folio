/**
 * ElssTrackerScreen — ELSS lock-in status
 */

import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { usePortfolio } from '../hooks/usePortfolio';
import { inr } from '../utils/format';

const ELSS_KEYWORDS = ['ELSS', 'TAX SAVER', 'TAX PLAN', 'TAX SAVING'];
const LOCK_IN_DAYS = 3 * 365;

export default function ElssTrackerScreen() {
  const { state, result, loading } = usePortfolio();

  const lots = useMemo(() => {
    const elssIsins = new Set(
      (result?.holdings || [])
        .filter(h => ELSS_KEYWORDS.some(kw => h.name.toUpperCase().includes(kw)))
        .map(h => h.isin),
    );
    const nameMap: Record<string, string> = {};
    for (const h of result?.holdings || []) nameMap[h.isin] = h.name;

    const today = new Date();
    return (state?.trades || [])
      .filter((t: any) => elssIsins.has(t.isin) && t.side === 'BUY')
      .map((t: any) => {
        const buyDate = new Date(t.txn_date);
        const unlockDate = new Date(buyDate.getTime() + LOCK_IN_DAYS * 86400000);
        const daysRemaining = Math.ceil((unlockDate.getTime() - today.getTime()) / 86400000);
        return {
          isin: t.isin,
          name: nameMap[t.isin] || t.isin,
          buy_date: t.txn_date,
          unlock_date: unlockDate.toISOString().slice(0, 10),
          quantity: t.quantity,
          buy_price: t.price,
          invested: Math.round(t.quantity * t.price * 100) / 100,
          locked: daysRemaining > 0,
          days_remaining: Math.max(0, daysRemaining),
        };
      })
      .sort((a: any, b: any) => a.buy_date.localeCompare(b.buy_date));
  }, [state, result]);

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" /></View>;

  if (!lots.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No ELSS holdings</Text>
        <Text style={styles.emptyDesc}>ELSS tax-saver fund lots will appear here with lock-in dates.</Text>
      </View>
    );
  }

  const lockedAmt = lots.filter((l: any) => l.locked).reduce((s: number, l: any) => s + l.invested, 0);
  const unlockedAmt = lots.filter((l: any) => !l.locked).reduce((s: number, l: any) => s + l.invested, 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.summary}>
        <Text style={styles.summaryText}>🔒 Locked: {inr(lockedAmt)} · 🔓 Unlocked: {inr(unlockedAmt)}</Text>
      </View>
      {lots.map((lot: any, i: number) => (
        <View key={i} style={styles.card}>
          <Text style={styles.name} numberOfLines={1}>{lot.name}</Text>
          <Text style={styles.date}>Buy: {lot.buy_date} → Unlock: {lot.unlock_date}</Text>
          <Text style={styles.invested}>Invested: {inr(lot.invested)}</Text>
          <Text style={[styles.status, { color: lot.locked ? '#e65100' : '#2e7d32' }]}>
            {lot.locked ? `🔒 ${lot.days_remaining}d remaining` : '🔓 Unlocked'}
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
  summary: { backgroundColor: '#fff', borderRadius: 10, padding: 14, alignItems: 'center' },
  summaryText: { fontSize: 14, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14 },
  name: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  date: { fontSize: 12, color: '#555', marginBottom: 2 },
  invested: { fontSize: 12, color: '#555', marginBottom: 4 },
  status: { fontSize: 13, fontWeight: '600' },
});
