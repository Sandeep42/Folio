/**
 * UploadScreen — Import CAS PDF, Zerodha CSV, or Generic CSV
 */

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, Alert,
  StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import { usePortfolio } from '../hooks/usePortfolio';
import { parseCamsKfinCas } from '../parsers/casPdf';
import { mergeZerodhaFiles } from '../parsers/zerodha';
import { parseTradebookCsv } from '../parsers/tradebook';

export default function UploadScreen() {
  const { state, onHoldings, onTrades } = usePortfolio();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg('');
    try { await fn(); }
    catch (e: any) { Alert.alert('Error', e.message); }
    finally { setBusy(false); }
  };

  const handleCas = async () => {
    const res = await DocumentPicker.pick({ type: [DocumentPicker.types.pdf] });
    if (!res[0]) return;
    const response = await fetch(res[0].uri);
    const buffer = await response.arrayBuffer();
    const parsed = await parseCamsKfinCas(buffer, password || undefined);
    if (parsed.holdings.length) onHoldings(parsed.holdings);
    if (parsed.trades.length) onTrades(parsed.trades);
    setMsg(`Imported ${parsed.holdings.length} holdings, ${parsed.trades.length} transactions`);
  };

  const handleZerodha = async () => {
    const res = await DocumentPicker.pick({
      type: [DocumentPicker.types.csv, DocumentPicker.types.plainText],
      allowMultiSelection: true,
    });
    if (!res.length) return;
    const texts = await Promise.all(res.map(async (f) => { const r = await fetch(f.uri); return r.text(); }));
    const parsed = mergeZerodhaFiles(texts);
    if (parsed.trades.length) onTrades(parsed.trades);
    setMsg(`Imported ${parsed.trades.length} trades from ${res.length} file(s)`);
  };

  const handleTradebook = async () => {
    const res = await DocumentPicker.pick({ type: [DocumentPicker.types.csv, DocumentPicker.types.plainText] });
    if (!res[0]) return;
    const response = await fetch(res[0].uri);
    const text = await response.text();
    const parsed = parseTradebookCsv(text);
    if (parsed.trades.length) onTrades(parsed.trades);
    setMsg(`Imported ${parsed.trades.length} trades`);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}

      <View style={styles.section}>
        <Text style={styles.title}>CAS — CAMS + KFinTech Consolidated Statement</Text>
        <Text style={styles.desc}>Get it from CAMS with Detailed option — covers all MF holdings and history.</Text>
        <TextInput style={styles.input} placeholder="PDF password" value={password}
          onChangeText={setPassword} secureTextEntry />
        <TouchableOpacity style={styles.btn} onPress={handleCas} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Pick PDF</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>Zerodha tradebook (CSV)</Text>
        <Text style={styles.desc}>Console → Reports → Tradebook. Select multiple FY files.</Text>
        <TouchableOpacity style={styles.btn} onPress={handleZerodha} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Pick CSV(s)</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>Generic tradebook (CSV)</Text>
        <Text style={styles.desc}>Any broker: columns isin, date, side, quantity, price.</Text>
        <TouchableOpacity style={styles.btn} onPress={handleTradebook} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Pick CSV</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 16, gap: 16 },
  msg: { backgroundColor: '#e8f5e9', color: '#2e7d32', padding: 12, borderRadius: 8 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 10 },
  title: { fontSize: 16, fontWeight: '600' },
  desc: { fontSize: 13, color: '#666' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 14 },
  btn: { backgroundColor: '#1976d2', borderRadius: 8, padding: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
