/**
 * FundPnlScreen — Consolidated P&L per fund (realised + unrealised)
 */

import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { usePortfolio } from '../hooks/usePortfolio';
import { inr } from '../utils/format';

function classifyTerm(buyDate: string, sellDate: string): 'LTCG' | 'STCG' {
  const days = (new Date(sellDate).getTime() - new Date(buyDate).getTime()) / 86400000;
  return days > 365 ? 'LTCG' : 'STCG';
}

export default function FundPnlScreen() {
  const { state, result, loading } = usePortfolio();

  const rows = useMemo(() => {
    const buyQ: Record<string, any[]> = {};
    const realised: Record<string, any> = {};
    const invested: Record<string, number> = {};
    const nameMap: Record<string, string> = {};

    for (const h of result?.holdings || []) nameMap[h.isin] = h.name;

    for (const t of [...(state?.trades || [])].sort((a: any, b: any) => a.txn_date.localeCompare(b.txn_date))) {
      const isin = t.isin;
      if (!nameMap[isin]) nameMap[isin] = isin;
      if (t.side === 'BUY') {
        if (!buyQ[isin]) buyQ[isin] = [];
        buyQ[isin].push({ date: t.txn_date, qty: t.quantity, price: t.price });
        invested[isin] = (invested[isin] || 0) + t.quantity * t.price;
      } else {
        if (!realised[isin]) realised[isin] = { ltcg: 0, stcg: 0, sellAmt: 0, costSold: 0 };
        realised[isin].sellAmt += t.quantity * t.price;
        let remaining = t.quantity;
        const queue = buyQ[isin] || [];
        while (remaining > 1e-6 && queue.length) {
          const lot = queue[0];
          const take = Math.min(lot.qty, remaining);
          const gain = (t.price - lot.price) * take;
          const term = classifyTerm(lot.date, t.txn_date);
          realised[isin][term === 'LTCG' ? 'ltcg' : 'stcg'] += gain;
          realised[isin].costSold += take * lot.price;
          lot.qty -= take;
          remaining -= take;
          if (lot.qty < 1e-6) queue.shift();
        }
      }
    }

    const allIsins = new Set([...Object.keys(invested), ...Object.keys(realised)]);
    const out: any[] = [];

    for (const isin of allIsins) {
      const lots = buyQ[isin] || [];
      const remQty = lots.reduce((s: number, l: any) => s + l.qty, 0);
      const remCost = lots.reduce((s: number, l: any) => s + l.qty * l.price, 0);
      const h = result?.holdings?.find((v: any) => v.isin === isin);
      const price = h?.last_price || null;
      const curVal = price && remQty > 0 ? Math.round(remQty * price * 100) / 100 : null;
      const unrealised = curVal != null ? Math.round((curVal - remCost) * 100) / 100 : null;
      const r = realised[isin] || { ltcg: 0, stcg: 0, sellAmt: 0, costSold: 0 };
      const realisedGain = Math.round((r.ltcg + r.stcg) * 100) / 100;
      const totalPnl = Math.round((realisedGain + (unrealised || 0)) * 100) / 100;

      out.push({
        isin, name: nameMap[isin] || isin,
        total_invested: Math.round((invested[isin] || 0) * 100) / 100,
        realised_gain: realisedGain,
        rem_qty: Math.round(remQty * 10000) / 10000,
        current_value: curVal,
        unrealised,
        total_pnl: totalPnl,
      });
    }

    return out.sort((a, b) => (b.total_pnl || 0) - (a.total_pnl || 0));
  }, [state, result]);

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" /></View>;

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
          <Text style={styles.name} numberOfLines={1}>{r.name}</Text>
          <Text style={[styles.total, { color: (r.total_pnl || 0) >= 0 ? '#2e7d32' : '#d32f2f' }]}>
            {r.total_pnl >= 0 ? '+' : ''}{inr(r.total_pnl)}
          </Text>
          <Text style={styles.detail}>
            Realised: {inr(r.realised_gain)} · Unrealised: {inr(r.unrealised)}
          </Text>
          <Text style={styles.invested}>Invested: {inr(r.total_invested)}</Text>
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
  total: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  detail: { fontSize: 12, color: '#555' },
  invested: { fontSize: 11, color: '#999', marginTop: 4 },
});
