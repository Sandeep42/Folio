/**
 * UploadScreen — Import CAS PDF, Zerodha CSV, or Generic CSV
 */

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, Alert,
  StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { usePortfolio } from '../hooks/usePortfolio';
import { parseCamsKfinCasText, ParsedHolding } from '../parsers/casPdf';
import { preprocessPdfBox } from '../parsers/pdfboxCompat';
import { mergeZerodhaFiles } from '../parsers/zerodha';
import { parseTradebookCsv } from '../parsers/tradebook';
import { pickPdf, pickCsvs, pickCsv, readPdfAsText, readFileAsText } from '../utils/filePicker';
import { Holding } from '../models/Holding';
import { AssetType, CostBasisType } from '../models/enums';

/** Convert a ParsedHolding from the CAS parser into a full Holding model. */
function toHolding(ph: ParsedHolding, asOf: string): Holding {
  const lots = ph.avg_cost != null && ph.quantity > 0
    ? [{ buy_date: asOf, quantity: ph.quantity, price: ph.avg_cost, source: 'cas' as const }]
    : [];
  return {
    isin: ph.isin,
    name: ph.name,
    asset_type: AssetType.MUTUAL_FUND,
    quantity: ph.quantity,
    symbol: null,
    folio: ph.folio,
    amfi_code: null,
    avg_cost: ph.avg_cost,
    last_price: ph.last_price,
    price_as_of: ph.price_as_of || asOf,
    lots,
    cost_basis_type: CostBasisType.NORMAL,
  };
}

export default function UploadScreen() {
  const { state, onHoldings, onTrades, clearData } = usePortfolio();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);

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
    // PDFBox outputs cells on one line — pre-process if needed
    const processed = preprocessPdfBox(text);
    const parsed = parseCamsKfinCasText(processed);
    if (parsed.holdings.length) {
      const asOf = parsed.as_of || new Date().toISOString().slice(0, 10);
      onHoldings(parsed.holdings.map(ph => toHolding(ph, asOf)));
    }
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

      {/* DATA section */}
      <View style={styles.section}>
        <Text style={styles.title}>Data</Text>
        <Text style={styles.desc}>{state?.holdings.length || 0} holdings · {state?.trades.length || 0} trades</Text>
        <TouchableOpacity
          style={[styles.clearBtn, confirmClear && styles.clearBtnConfirm]}
          onPress={() => {
            if (!confirmClear) { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 4000); return; }
            clearData(); setConfirmClear(false); setMsg('Data cleared');
          }}>
          <Text style={[styles.clearBtnText, confirmClear && styles.clearBtnTextConfirm]}>
            {confirmClear ? 'Tap again to confirm' : 'Clear all data'}
          </Text>
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
  clearBtn: { backgroundColor: '#fce4ec', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 4 },
  clearBtnConfirm: { backgroundColor: '#d32f2f' },
  clearBtnText: { color: '#c62828', fontWeight: '600', fontSize: 14 },
  clearBtnTextConfirm: { color: '#fff' },
});
