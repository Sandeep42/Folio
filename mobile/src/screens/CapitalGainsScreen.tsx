/**
 * CapitalGainsScreen — Realised capital gains with separate MF/stock FIFO
 */

import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { usePortfolio } from '../hooks/usePortfolio';
import { inr } from '../utils/format';

function classifyTerm(buyDate: string, sellDate: string): 'LTCG' | 'STCG' {
  const days = (new Date(sellDate).getTime() - new Date(buyDate).getTime()) / 86400000;
  return days > 365 ? 'LTCG' : 'STCG';
}

function computeGains(trades: any[], useFolio: boolean): any[] {
  const buyQ: Record<string, any[]> = {};
  const realised: any[] = [];

  for (const t of [...trades].sort((a: any, b: any) => a.txn_date.localeCompare(b.txn_date))) {
    const key = useFolio ? (t.isin + ':' + (t.folio || '')) : t.isin;
    if (t.side === 'BUY') {
      if (!buyQ[key]) buyQ[key] = [];
      buyQ[key].push({ date: t.txn_date, qty: t.quantity, price: t.price });
    } else if (t.side === 'SELL') {
      let remaining = t.quantity || 0;
      if (remaining <= 0) continue;
      const queue = buyQ[key] || [];
      while (remaining > 1e-6 && queue.length) {
        const lot = queue[0];
        const take = Math.min(lot.qty, remaining);
        const gain = (t.price - lot.price) * take;
        const term = classifyTerm(lot.date, t.txn_date);
        realised.push({ sell_date: t.txn_date, isin: t.isin, gain: Math.round(gain * 100) / 100, term });
        remaining -= take;
        lot.qty -= take;
        if (lot.qty < 1e-6) queue.shift();
      }
    }
  }
  return realised;
}

function groupFy(realised: any[]) {
  const groups: Record<string, any> = {};
  for (const r of realised) {
    const y = new Date(r.sell_date).getMonth() >= 3 ? new Date(r.sell_date).getFullYear() : new Date(r.sell_date).getFullYear() - 1;
    const fy = `FY ${y}-${String(y + 1).slice(-2)}`;
    if (!groups[fy]) groups[fy] = { fy, ltcg: 0, stcg: 0, count: 0 };
    groups[fy][r.term === 'LTCG' ? 'ltcg' : 'stcg'] += r.gain;
    groups[fy].count++;
  }
  return Object.values(groups).sort((a: any, b: any) => b.fy.localeCompare(a.fy));
}

export default function CapitalGainsScreen() {
  const { state, result, loading } = usePortfolio();
  const gains = useMemo(() => {
    const trades = state?.trades || [];
    const mfTrades = trades.filter((t: any) => t.folio);
    const stockTrades = trades.filter((t: any) => !t.folio);
    const mfGains = computeGains(mfTrades, true);
    const stockGains = computeGains(stockTrades, false);
    return groupFy([...mfGains, ...stockGains]);
  }, [state]);

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" /></View>;
  if (!gains.length) return <View style={styles.centered}><Text style={styles.emptyTitle}>No realised gains</Text><Text style={styles.emptyDesc}>Sell transactions will appear here grouped by financial year.</Text></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {gains.map((fy: any, i: number) => (
        <View key={i} style={styles.card}>
          <Text style={styles.fy}>{fy.fy}</Text>
          <Text style={styles.total}>LTCG: <Text style={{color: fy.ltcg>=0?'#2e7d32':'#d32f2f'}}>{inr(fy.ltcg)}</Text> · STCG: <Text style={{color: fy.stcg>=0?'#2e7d32':'#d32f2f'}}>{inr(fy.stcg)}</Text></Text>
          <Text style={styles.count}>{fy.count} transaction(s)</Text>
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
  total: { fontSize: 13, color: '#555' },
  count: { fontSize: 11, color: '#999', marginTop: 4 },
});
