/**
 * MoreMenuScreen — Links to ELSS, Fund P&L, Rolling Returns, Clear Data
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MoreStackParamList } from '../../App';
import { usePortfolio } from '../hooks/usePortfolio';
import { clearState } from '../storage';

type Nav = NativeStackNavigationProp<MoreStackParamList, 'MoreMenu'>;

export default function MoreMenuScreen() {
  const nav = useNavigation<Nav>();
  const { state, setState } = usePortfolio();
  const [confirming, setConfirming] = useState(false);

  const handleClear = () => {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    clearState();
    setState({ holdings: [], trades: [], ltcgRealized: 0 });
    setConfirming(false);
  };

  const items = [
    { label: 'ELSS Tracker', icon: '🔒', screen: 'ElssTracker' as const },
    { label: 'Fund P&L', icon: '📊', screen: 'FundPnl' as const },
    { label: 'Rolling Returns', icon: '📈', screen: 'RollingReturns' as const },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Reports</Text>
        {items.map((item, i) => (
          <TouchableOpacity key={i} style={styles.row} onPress={() => nav.navigate(item.screen)}>
            <Text style={styles.rowIcon}>{item.icon}</Text>
            <Text style={styles.rowLabel}>{item.label}</Text>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data</Text>
        <Text style={styles.sectionDesc}>
          {state?.holdings.length || 0} holdings · {state?.trades.length || 0} trades
        </Text>
        <TouchableOpacity
          style={[styles.clearBtn, confirming && styles.clearBtnConfirm]}
          onPress={handleClear}
        >
          <Text style={[styles.clearBtnText, confirming && styles.clearBtnTextConfirm]}>
            {confirming ? 'Tap again to confirm' : 'Clear all data'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16, gap: 16 },
  section: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, padding: 14, paddingBottom: 8 },
  sectionDesc: { fontSize: 12, color: '#999', paddingHorizontal: 14, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  rowIcon: { fontSize: 18, marginRight: 12 },
  rowLabel: { fontSize: 15, flex: 1 },
  rowArrow: { fontSize: 20, color: '#ccc' },
  clearBtn: { margin: 14, padding: 14, borderRadius: 8, alignItems: 'center', backgroundColor: '#fce4ec', marginTop: 0 },
  clearBtnConfirm: { backgroundColor: '#d32f2f' },
  clearBtnText: { color: '#c62828', fontWeight: '600', fontSize: 14 },
  clearBtnTextConfirm: { color: '#fff' },
});
