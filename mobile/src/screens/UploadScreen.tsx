/**
 * UploadScreen — Import CAS PDF, Zerodha CSV, or Generic CSV
 */

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, Alert,
  StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { usePortfolio } from '../hooks/usePortfolio';
import { parseCamsKfinCasText } from '../parsers/casPdf';
import { mergeZerodhaFiles } from '../parsers/zerodha';
import { parseTradebookCsv } from '../parsers/tradebook';
import { pickPdf, pickCsvs, pickCsv, readPdfAsText, readFileAsText } from '../utils/filePicker';

export default function UploadScreen() {
  const { state, onHoldings, onTrades } = usePortfolio();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg(''); setWarnings([]);
    try { await fn(); }
    catch (e: any) { Alert.alert('Error', e.message); }
    finally { setBusy(false); }
  };

  const handleCas = async () => {
    const res = await pickPdf();
    if (res.canceled || !res.uri) return;
    const text = await readPdfAsText(res.uri, password);
    const parsed = parseCamsKfinCasText(text);
    if (parsed.holdings.length) onHoldings(parsed.holdings);
    if (parsed.trades.length) onTrades(parsed.trades);
    setMsg(`Imported ${parsed.holdings.length} holdings, ${parsed.trades.length} transactions`);
    setWarnings(parsed.warnings);
  };

  const handleZerodha = async () => {
    const res = await pickCsvs();
    if (res.canceled || !res.uris?.length) return;
    const texts = await Promise.all(res.uris.map(u => readFileAsText(u)));
    const parsed = mergeZerodhaFiles(texts);
    if (parsed.trades.length) onTrades(parsed.trades);
    setMsg(`Imported ${parsed.trades.length} trades from ${res.uris.length} file(s)`);
  };

  const handleTradebook = async () => {
    const res = await pickCsv();
    if (res.canceled || !res.uri) return;
    const text = await readFileAsText(res.uri);
    const parsed = parseTradebookCsv(text);
    if (parsed.trades.length) onTrades(parsed.trades);
    setMsg(`Imported ${parsed.trades.length} trades`);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}
      {warnings.map((w, i) => (
        <Text key={i} style={styles.warning} numberOfLines={3}>{w}</Text>
      ))}

      <View style={styles.section}>
        <Text style={styles.title}>CAS — CAMS + KFinTech Consolidated Statement</Text>
        <Text style={styles.desc}>Get it from CAMS with Detailed option — covers all MF holdings and history.</Text>
        <TextInput style={styles.input} placeholder="PDF password" placeholderTextColor="#999" value={password}
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
  warning: { backgroundColor: '#fff3e0', color: '#e65100', padding: 10, borderRadius: 8, fontSize: 12 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 10 },
  title: { fontSize: 16, fontWeight: '600' },
  desc: { fontSize: 13, color: '#666' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 14, color: '#000' },
  btn: { backgroundColor: '#1976d2', borderRadius: 8, padding: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
