import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CosmicBackdrop, CosmicLabel, GlassCard, GlowButton, MiniBars, alpha } from '@/components/cosmic';
import { QuakeMap } from '@/components/QuakeMap';
import { RiskMap } from '@/components/RiskMap';
import { useColorScheme } from '@/components/useColorScheme';
import { theme, riskAccent, type ThemeTokens } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import {
  fetchForecastGrid,
  fetchForecastLocation,
  fetchForecastMap,
  fetchForecastModelStatus,
  fetchRecentQuakes,
  type ForecastGridPoint,
  type ForecastPoint,
  type ModelHealth,
  type QuakeEvent,
  type WarningCapability,
} from '@/lib/api';
import { getSafeDeviceLocation } from '@/lib/location';
import { relativeTimeTr } from '@/lib/quakeFormat';

const LEGEND = [
  { key: 'low', label: 'Dusuk' },
  { key: 'mid', label: 'Izleme' },
  { key: 'high', label: 'Yuksek' },
];

const SEARCH_CHAR_MAP: Record<string, string> = {
  c: 'c',
  g: 'g',
  i: 'i',
  o: 'o',
  s: 's',
  u: 'u',
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  i̇: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
};

function percent(value?: number | null) {
  if (value == null) return '--';
  return `${Math.round(value * 100)}%`;
}

function riskValue(value?: number | null) {
  if (value == null) return 0;
  return value <= 1 ? value : value / 10;
}

function modelLabel(health: ModelHealth | null) {
  if (!health?.available) return 'Fallback';
  return health.quality_label || 'Deneysel';
}

function trainedAt(value?: string | null) {
  if (!value) return 'Yuklu degil';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function normalizeSearch(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüi̇]/g, (char) => SEARCH_CHAR_MAP[char] || char);
}

function filterPoints(points: ForecastPoint[], query: string) {
  const needle = normalizeSearch(query);
  if (!needle) return points;
  return points.filter((point) => {
    const city = normalizeSearch(point.city);
    const region = normalizeSearch(point.region || '');
    return city.includes(needle) || region.includes(needle);
  });
}

export default function ForecastScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const t = theme[scheme];
  const styles = useMemo(() => makeStyles(t), [t]);
  const { apiBase, ready } = useAuth();

  const [points, setPoints] = useState<ForecastPoint[]>([]);
  const [heatPoints, setHeatPoints] = useState<ForecastGridPoint[]>([]);
  const [recentQuakes, setRecentQuakes] = useState<QuakeEvent[]>([]);
  const [modelHealth, setModelHealth] = useState<ModelHealth | null>(null);
  const [warningCapability, setWarningCapability] = useState<WarningCapability | null>(null);
  const [locationPoint, setLocationPoint] = useState<ForecastPoint | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [locationNeedsSettings, setLocationNeedsSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const locationPromptedRef = useRef(false);
  const deferredQuery = useDeferredValue(searchQuery);

  const sortedPoints = useMemo(() => [...points].sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0)), [points]);
  const filteredPoints = useMemo(() => filterPoints(sortedPoints, deferredQuery), [deferredQuery, sortedPoints]);
  const topPoints = useMemo(() => filteredPoints.slice(0, 3), [filteredPoints]);
  const focusPoint = useMemo(() => {
    const selected = selectedCity ? filteredPoints.find((point) => point.city === selectedCity) : null;
    return selected ?? filteredPoints[0] ?? locationPoint ?? sortedPoints[0] ?? null;
  }, [filteredPoints, locationPoint, selectedCity, sortedPoints]);
  const trendBars = useMemo(() => {
    const sample = filteredPoints.slice(0, 7);
    if (!sample.length) return [0.2, 0.3, -0.1, 0.25, 0.36, 0.18, 0.32];
    const avg = sample.reduce((sum, point) => sum + riskValue(point.risk_score), 0) / sample.length;
    return sample.map((point, index) => riskValue(point.risk_score) - avg + (index % 2 === 0 ? 0.08 : -0.04));
  }, [filteredPoints]);

  useEffect(() => {
    if (!selectedCity) return;
    if (!filteredPoints.some((point) => point.city === selectedCity)) setSelectedCity(null);
  }, [filteredPoints, selectedCity]);

  const loadBase = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [mapRes, gridRes, statusRes, quakeRes] = await Promise.allSettled([
      fetchForecastMap(apiBase),
      fetchForecastGrid(apiBase),
      fetchForecastModelStatus(apiBase),
      fetchRecentQuakes(apiBase, 80),
    ]);
    if (mapRes.status === 'fulfilled') setPoints(mapRes.value);
    if (gridRes.status === 'fulfilled') setHeatPoints(gridRes.value);
    if (quakeRes.status === 'fulfilled') setRecentQuakes(quakeRes.value);
    if (statusRes.status === 'fulfilled') {
      setModelHealth(statusRes.value.modelHealth);
      setWarningCapability(statusRes.value.warningCapability);
    }
    const hasMapData = mapRes.status === 'fulfilled' && mapRes.value.length > 0;
    const hasQuakeData = quakeRes.status === 'fulfilled' && quakeRes.value.length > 0;
    const hasStatusData = statusRes.status === 'fulfilled' && Boolean(statusRes.value.modelHealth || statusRes.value.warningCapability);

    if (!hasMapData && !hasStatusData) {
      setError('Tahmin verisi alinamadi. API adresini ve backend durumunu kontrol et.');
    } else if (!hasMapData && hasQuakeData) {
      setError('Canli risk katmani gecikiyor. Son senkronize deprem ve durum verileri gosteriliyor.');
    } else if (gridRes.status !== 'fulfilled') {
      setError('Isi katmani gecikiyor. Il risk listesi yine de hazir.');
    }
    setLoading(false);
  }, [apiBase]);

  const loadLocation = useCallback(async (requestPermission: boolean) => {
    try {
      setLocating(true);
      const location = await getSafeDeviceLocation({ requestPermission, allowLastKnown: true });
      if (!location.ok) {
        setLocationPoint(null);
        setUserLocation(null);
        setLocationNeedsSettings(Boolean(location.needsSettings));
        if (requestPermission) setLocationMessage(location.message);
        return;
      }
      setUserLocation({ lat: location.lat, lon: location.lon });
      setLocationNeedsSettings(false);
      const result = await fetchForecastLocation(apiBase, location.lat, location.lon);
      setLocationPoint(result.point);
      if (result.modelHealth) setModelHealth(result.modelHealth);
      if (result.warningCapability) setWarningCapability(result.warningCapability);
      setLocationMessage(location.message || null);
    } catch {
      setLocationMessage('Konuma gore tahmin su an alinamadi.');
    } finally {
      setLocating(false);
    }
  }, [apiBase]);

  useEffect(() => {
    if (!ready) return;
    void loadBase();
  }, [loadBase, ready]);

  useEffect(() => {
    if (!ready || locationPromptedRef.current) return;
    locationPromptedRef.current = true;
    void loadLocation(true);
  }, [loadLocation, ready]);

  if (!ready) {
    return <View style={[styles.center, { backgroundColor: t.bg }]}><ActivityIndicator size="large" color={t.accent} /></View>;
  }

  return (
    <View style={styles.root}>
      <CosmicBackdrop t={t} />
      <SafeAreaView style={styles.safe}>
        <FlatList
          data={filteredPoints}
          keyExtractor={(item) => item.city}
          contentContainerStyle={styles.listPad}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void loadBase()} tintColor={t.brandTab} colors={[t.brandTab]} />}
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <View style={styles.headerTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.headerTitle, { color: t.text }]}>Turkiye Deprem Risk Haritasi</Text>
                  <Text style={[styles.headerSub, { color: t.textSecondary }]}>Il bazli arama, risk katmani ve son deprem haritasi tek ekranda.</Text>
                </View>
                <CosmicLabel t={t}>{filteredPoints.length}/{sortedPoints.length} il</CosmicLabel>
              </View>

              <GlassCard t={t} style={styles.searchCard}>
                <View style={styles.searchRow}>
                  <FontAwesome name="search" size={16} color={t.textMuted} />
                  <TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Il veya bolge ara" placeholderTextColor={t.textMuted} style={[styles.searchInput, { color: t.text }]} />
                  {searchQuery.trim() ? <Pressable onPress={() => setSearchQuery('')}><FontAwesome name="times-circle" size={16} color={t.textMuted} /></Pressable> : null}
                </View>
                <View style={styles.legendRow}>
                  {LEGEND.map((item) => {
                    const accent = item.key === 'high' ? t.high : item.key === 'mid' ? t.mid : t.low;
                    return <View key={item.key} style={[styles.legendChip, { backgroundColor: alpha(accent, 0.12), borderColor: alpha(accent, 0.26) }]}><View style={[styles.legendDot, { backgroundColor: accent }]} /><Text style={[styles.legendText, { color: t.text }]}>{item.label}</Text></View>;
                  })}
                </View>
              </GlassCard>

              <GlassCard t={t} tone="warm" style={styles.card}>
                <View style={styles.rowBetween}>
                  <CosmicLabel t={t} accent={t.high}>risk haritasi</CosmicLabel>
                  <Text style={[styles.meta, { color: t.textSecondary }]}>Siyah etiket + kirmizi-sari-yesil risk</Text>
                </View>
                <View style={styles.pillRow}>
                  {topPoints.map((item) => {
                    const accent = riskAccent(scheme, item.risk_level, item.risk_score);
                    return <Pressable key={item.city} onPress={() => setSelectedCity(item.city)} style={[styles.pill, { backgroundColor: alpha(accent, 0.12), borderColor: alpha(accent, 0.26) }]}><Text style={[styles.pillTitle, { color: accent }]}>{item.city}</Text><Text style={[styles.pillMeta, { color: t.textSecondary }]}>%{Math.round(riskValue(item.risk_score) * 100)}</Text></Pressable>;
                  })}
                </View>
                <View style={styles.mapWrap}>
                  <RiskMap points={filteredPoints.length ? filteredPoints : sortedPoints} heatPoints={heatPoints} scheme={scheme} t={t} userLocation={userLocation} focusPoint={focusPoint ? { lat: focusPoint.lat, lon: focusPoint.lon } : userLocation} />
                  <View style={[styles.overlay, { backgroundColor: t.glassOverlay, borderColor: t.border }]}>
                    <Text style={[styles.overlayTitle, { color: t.text }]}>{focusPoint?.city || 'Harita odagi'}</Text>
                    <Text style={[styles.overlayBody, { color: t.textSecondary }]}>{focusPoint ? `${focusPoint.risk_level} risk - M4+ ${percent(focusPoint.probability)}` : 'Bir il secerek odak detayi goster.'}</Text>
                  </View>
                </View>
              </GlassCard>

              <GlassCard t={t} tone="cool" style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.cardTitle, { color: t.text }]}>Son Deprem Haritasi</Text>
                  <CosmicLabel t={t} accent={t.warn}>{recentQuakes.length} olay</CosmicLabel>
                </View>
                <View style={styles.quakeWrap}><QuakeMap events={recentQuakes} scheme={scheme} t={t} /></View>
                <Text style={[styles.meta, { color: t.textSecondary }]}>{recentQuakes[0] ? `Son olay M${recentQuakes[0].mag.toFixed(1)} - ${recentQuakes[0].depth.toFixed(0)} km - ${relativeTimeTr(recentQuakes[0].timestamp)}` : 'Son deprem verisi bekleniyor.'}</Text>
              </GlassCard>

              <View style={styles.grid}>
                <GlassCard t={t} tone="warm" style={styles.gridCard}>
                  <Text style={[styles.cardTitle, { color: t.text }]}>Odak Risk</Text>
                  <Text style={[styles.bigValue, { color: focusPoint ? riskAccent(scheme, focusPoint.risk_level, focusPoint.risk_score) : t.warn }]}>%{Math.round(riskValue(focusPoint?.risk_score) * 100)}</Text>
                  <MiniBars t={t} values={trendBars} positiveColor={alpha(t.success, 0.9)} negativeColor={alpha(t.high, 0.82)} />
                </GlassCard>
                <GlassCard t={t} tone="cool" style={styles.gridCard}>
                  <Text style={[styles.cardTitle, { color: t.text }]}>Model Hazirligi</Text>
                  <Text style={[styles.bigValue, { color: t.glowBlue }]}>{modelLabel(modelHealth)}</Text>
                  <Text style={[styles.meta, { color: t.textSecondary }]}>ROC-AUC {modelHealth?.metrics?.roc_auc_mean?.toFixed(2) ?? '--'} - Precision {percent(modelHealth?.backtest?.precision)}</Text>
                  <Text style={[styles.meta, { color: t.textSecondary }]}>Son egitim: {trainedAt(modelHealth?.trained_at)}</Text>
                </GlassCard>
              </View>

              <GlassCard t={t} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={[styles.cardTitle, { color: t.text }]}>Bulundugun Konum</Text>
                  {locationPoint ? <CosmicLabel t={t} accent={riskAccent(scheme, locationPoint.risk_level, locationPoint.risk_score)}>{locationPoint.risk_level}</CosmicLabel> : null}
                </View>
                {locating ? <ActivityIndicator color={t.accent} /> : <Text style={[styles.meta, { color: t.textSecondary }]}>{locationPoint ? `Risk ${riskValue(locationPoint.risk_score).toFixed(2)} - M5+ ${percent(locationPoint.m5_72h_probability)} - Fay ${locationPoint.fault_distance != null ? `${locationPoint.fault_distance.toFixed(0)} km` : '--'}` : 'Konum izni ile kisisel risk karti gosterilir.'}</Text>}
                {locationMessage ? <Text style={[styles.meta, { color: t.textSecondary }]}>{locationMessage}</Text> : null}
                <View style={styles.actions}>
                  <GlowButton t={t} label={locating ? 'Konum aliniyor...' : 'Konum riskimi hesapla'} onPress={() => void loadLocation(true)} disabled={locating} style={styles.flex} />
                  {locationNeedsSettings ? <GlowButton t={t} tone="orange" label="Ayarlari ac" onPress={() => void Linking.openSettings()} style={styles.flex} /> : null}
                </View>
              </GlassCard>

              <GlassCard t={t} tone="cool" style={styles.card}>
                <Text style={[styles.cardTitle, { color: t.text }]}>Alarm Durumu</Text>
                <Text style={[styles.meta, { color: t.textSecondary }]}>{warningCapability?.summary || 'ML tabanli risk uyarilari hazir. Resmi sensor tabanli saniyeler-once erken uyari bu surumde yok.'}</Text>
              </GlassCard>

              {error ? <Text style={[styles.error, { color: t.danger }]}>{error}</Text> : null}
              <Text style={[styles.cardTitle, { color: t.text }]}>Il Risk Listesi</Text>
            </View>
          }
          ListEmptyComponent={loading ? <ActivityIndicator style={styles.pad} color={t.accent} /> : <Text style={[styles.empty, { color: t.textSecondary }]}>Bu arama icin sonuc bulunamadi.</Text>}
          renderItem={({ item }) => {
            const accent = riskAccent(scheme, item.risk_level, item.risk_score);
            const selected = focusPoint?.city === item.city;
            return (
              <Pressable onPress={() => setSelectedCity(item.city)}>
                <GlassCard t={t} style={[styles.listCard, selected ? { backgroundColor: alpha(accent, 0.08), borderColor: alpha(accent, 0.42) } : null]}>
                  <View style={[styles.listBar, { backgroundColor: accent }]} />
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.city, { color: t.text }]}>{item.city}</Text>
                      <Text style={[styles.meta, { color: t.textSecondary }]}>Risk {riskValue(item.risk_score).toFixed(2)} - M4+ {percent(item.probability)} - Fay {item.fault_distance != null ? `${item.fault_distance.toFixed(0)} km` : '--'}</Text>
                    </View>
                    <CosmicLabel t={t} accent={accent}>{item.risk_level}</CosmicLabel>
                  </View>
                </GlassCard>
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    safe: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    listPad: { padding: 18, paddingBottom: 118, gap: 14 },
    headerBlock: { gap: 16 },
    headerTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    headerTitle: { fontSize: 28, fontWeight: '800', fontFamily: t.displayFont },
    headerSub: { fontSize: 14, lineHeight: 20, marginTop: 6 },
    searchCard: { gap: 10 },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: t.border, borderRadius: 18, backgroundColor: t.inputBg, paddingHorizontal: 14, paddingVertical: 10 },
    searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
    legendRow: { flexDirection: 'row', gap: 8 },
    legendChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderRadius: 14, paddingVertical: 9 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendText: { fontSize: 12, fontWeight: '700' },
    card: { gap: 12 },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
    meta: { fontSize: 13, lineHeight: 18 },
    pillRow: { flexDirection: 'row', gap: 8 },
    pill: { flex: 1, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 10 },
    pillTitle: { fontSize: 13, fontWeight: '800' },
    pillMeta: { fontSize: 12, marginTop: 3 },
    mapWrap: { minHeight: 320, borderRadius: 20, overflow: 'hidden' },
    overlay: { position: 'absolute', left: 14, right: 14, bottom: 14, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, gap: 4 },
    overlayTitle: { fontSize: 15, fontWeight: '800' },
    overlayBody: { fontSize: 13, lineHeight: 18 },
    quakeWrap: { minHeight: 240, borderRadius: 18, overflow: 'hidden' },
    grid: { flexDirection: 'row', gap: 12 },
    gridCard: { flex: 1, gap: 12 },
    cardTitle: { fontSize: 18, fontWeight: '800' },
    bigValue: { fontSize: 30, fontWeight: '800', fontFamily: t.displayFont },
    actions: { flexDirection: 'row', gap: 10 },
    flex: { flex: 1 },
    error: { fontSize: 13, lineHeight: 18 },
    listCard: { marginBottom: 12, position: 'relative', paddingTop: 18 },
    listBar: { position: 'absolute', left: 0, top: 18, bottom: 18, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
    city: { fontSize: 18, fontWeight: '800' },
    pad: { marginTop: 24 },
    empty: { marginTop: 24, textAlign: 'center', fontSize: 15 },
  });
}
