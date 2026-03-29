import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { fetchForecastMap, type ForecastPoint } from '@/lib/api';

export default function TahminScreen() {
  const { apiBase, ready } = useAuth();
  const [points, setPoints] = useState<ForecastPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const p = await fetchForecastMap(apiBase);
      setPoints(p);
    } catch {
      setErr(
        Platform.OS === 'web'
          ? 'Sunucuya ulaşılamadı. Proje kökünde Flask’ı başlatın: python app.py (varsayılan port 5000). Web ve bu makine için API genelde http://127.0.0.1:5000 olmalı.'
          : 'Sunucuya ulaşılamadı. Ayarlar’dan API adresini kontrol edin (ör. bilgisayarınızın IP’si:5000).'
      );
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.head}>İl tahminleri (v2 hybrid)</Text>
      {err ? <Text style={styles.err}>{err}</Text> : null}
      {loading && points.length === 0 ? (
        <ActivityIndicator style={styles.pad} />
      ) : (
        <FlatList
          data={points}
          keyExtractor={(i) => i.city}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={load} />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.city}>{item.city}</Text>
              <Text style={styles.row}>Risk: {item.risk_level} — skor {item.risk_score?.toFixed?.(2) ?? item.risk_score}</Text>
              <Text style={styles.sub}>
                Olasılık (24s M4+): {((item.probability ?? 0) * 100).toFixed(1)}%
              </Text>
              {item.m5_72h_probability != null ? (
                <Text style={styles.sub}>
                  M5+ (72s): {((item.m5_72h_probability as number) * 100).toFixed(1)}%
                </Text>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 12, backgroundColor: '#f4f4f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  head: { fontSize: 18, fontWeight: '700', paddingHorizontal: 16, marginBottom: 8 },
  err: { color: '#b91c1c', paddingHorizontal: 16, marginBottom: 8 },
  pad: { marginTop: 24 },
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e4e4e7',
  },
  city: { fontSize: 17, fontWeight: '600' },
  row: { marginTop: 6, fontSize: 14, color: '#27272a' },
  sub: { marginTop: 4, fontSize: 13, color: '#71717a' },
});
