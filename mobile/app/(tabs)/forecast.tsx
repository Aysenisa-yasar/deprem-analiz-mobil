import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/context/AuthContext';
import { theme, riskAccent, type ThemeTokens } from '@/constants/theme';
import {
  fetchForecastLocation,
  fetchForecastMap,
  fetchForecastModelStatus,
  type ForecastPoint,
  type ModelHealth,
} from '@/lib/api';

function percent(value?: number | null) {
  if (value == null) return '--';
  return `${(value * 100).toFixed(1)}%`;
}

function metricLabel(health: ModelHealth | null): string {
  if (!health?.available) return 'Model yuklenemedi';
  return health.quality_label || 'Deneysel';
}

export default function ForecastScreen() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const t = theme[scheme];
  const styles = useMemo(() => makeStyles(t), [t]);

  const { apiBase, ready } = useAuth();
  const [points, setPoints] = useState<ForecastPoint[]>([]);
  const [modelHealth, setModelHealth] = useState<ModelHealth | null>(null);
  const [locationPoint, setLocationPoint] = useState<ForecastPoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sortedPoints = useMemo(
    () => [...points].sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0)),
    [points]
  );

  const loadBase = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const [mapPoints, health] = await Promise.all([
        fetchForecastMap(apiBase),
        fetchForecastModelStatus(apiBase),
      ]);
      setPoints(mapPoints);
      setModelHealth(health);
    } catch {
      setErr(
        Platform.OS === 'web'
          ? 'Sunucuya ulasilamadi. Yerelde backend calisiyor mu ve API adresi dogru mu kontrol edin.'
          : 'Tahmin verisi alinamadi. Ayarlar ekranindaki API adresini kontrol edin.'
      );
      setPoints([]);
      setModelHealth(null);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  const loadLocationForecast = useCallback(
    async (requestPermission: boolean) => {
      try {
        setLocating(true);
        const permission = requestPermission
          ? await Location.requestForegroundPermissionsAsync()
          : await Location.getForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          setLocationPoint(null);
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const result = await fetchForecastLocation(
          apiBase,
          position.coords.latitude,
          position.coords.longitude
        );
        setLocationPoint(result.point);
        if (result.modelHealth) {
          setModelHealth(result.modelHealth);
        }
      } catch {
        setLocationPoint(null);
      } finally {
        setLocating(false);
      }
    },
    [apiBase]
  );

  useEffect(() => {
    if (!ready) return;
    void loadBase();
  }, [loadBase, ready]);

  useEffect(() => {
    if (!ready) return;
    void loadLocationForecast(false);
  }, [loadLocationForecast, ready]);

  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator size="large" color={t.accent} />
      </View>
    );
  }

  return (
    <FlatList
      data={sortedPoints}
      keyExtractor={(item) => item.city}
      style={[styles.container, { backgroundColor: t.bg }]}
      contentContainerStyle={styles.listPad}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => void loadBase()}
          tintColor={t.accent}
          colors={[t.accent]}
        />
      }
      ListHeaderComponent={
        <View style={styles.headerPad}>
          <View style={[styles.hero, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.heroTitle, { color: t.text }]}>Kisa vadeli risk sinyali</Text>
            <Text style={[styles.heroSub, { color: t.textSecondary }]}>
              Bu ekran kesin deprem zamani vermez. Model, son olay yogunlugu ve mekansal sinyallere
              gore bolgesel olasilik uretir.
            </Text>
          </View>

          {err ? (
            <View style={[styles.bannerErr, { borderColor: t.danger, backgroundColor: t.surface }]}>
              <Text style={[styles.errText, { color: t.danger }]}>{err}</Text>
            </View>
          ) : null}

          <View style={[styles.sectionCard, { backgroundColor: t.surface, borderColor: t.border }]}>
            <View style={styles.sectionHead}>
              <View>
                <Text style={[styles.sectionTitle, { color: t.text }]}>Model sagligi</Text>
                <Text style={[styles.sectionSub, { color: t.textSecondary }]}>
                  Kullaniciya gostermeden once modelin kendisini de kontrol et.
                </Text>
              </View>
              <View style={[styles.healthBadge, { backgroundColor: t.surfaceMuted }]}>
                <Text style={[styles.healthBadgeText, { color: t.text }]}>
                  {metricLabel(modelHealth)}
                </Text>
              </View>
            </View>
            <Text style={[styles.modelSummary, { color: t.textSecondary }]}>
              {modelHealth?.summary || 'Model metrikleri henuz okunamadi.'}
            </Text>
            <View style={styles.metricsRow}>
              <View style={[styles.metricBox, { backgroundColor: t.surfaceMuted }]}>
                <Text style={[styles.metricLabel, { color: t.textMuted }]}>ROC-AUC</Text>
                <Text style={[styles.metricValue, { color: t.text }]}>
                  {modelHealth?.metrics?.roc_auc_mean?.toFixed(2) ?? '--'}
                </Text>
              </View>
              <View style={[styles.metricBox, { backgroundColor: t.surfaceMuted }]}>
                <Text style={[styles.metricLabel, { color: t.textMuted }]}>PR-AUC</Text>
                <Text style={[styles.metricValue, { color: t.text }]}>
                  {modelHealth?.metrics?.pr_auc_mean?.toFixed(2) ?? '--'}
                </Text>
              </View>
              <View style={[styles.metricBox, { backgroundColor: t.surfaceMuted }]}>
                <Text style={[styles.metricLabel, { color: t.textMuted }]}>Backtest hit</Text>
                <Text style={[styles.metricValue, { color: t.text }]}>
                  {percent(modelHealth?.backtest?.hit_rate)}
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.sectionCard, { backgroundColor: t.surface, borderColor: t.border }]}>
            <View style={styles.sectionHead}>
              <View>
                <Text style={[styles.sectionTitle, { color: t.text }]}>Bulundugun konum</Text>
                <Text style={[styles.sectionSub, { color: t.textSecondary }]}>
                  Konum verisiyle daha kisisel bir risk karti uretilir.
                </Text>
              </View>
              <Pressable
                onPress={() => void loadLocationForecast(true)}
                style={({ pressed }) => [
                  styles.locationBtn,
                  { backgroundColor: pressed ? t.accentRipple : t.accent },
                ]}>
                <Text style={[styles.locationBtnText, { color: scheme === 'dark' ? t.onAccent : '#fff' }]}>
                  {locating ? 'Hesaplaniyor' : 'Konumumu guncelle'}
                </Text>
              </Pressable>
            </View>

            {locating ? (
              <ActivityIndicator color={t.accent} style={{ marginTop: 12 }} />
            ) : locationPoint ? (
              <View style={[styles.locationCard, { backgroundColor: t.surfaceMuted }]}>
                <View style={styles.locationHead}>
                  <Text style={[styles.locationTitle, { color: t.text }]}>Bulundugun konum</Text>
                  <View
                    style={[
                      styles.levelPill,
                      {
                        backgroundColor:
                          riskAccent(scheme, locationPoint.risk_level, locationPoint.risk_score) + '22',
                      },
                    ]}>
                    <Text
                      style={[
                        styles.levelPillText,
                        { color: riskAccent(scheme, locationPoint.risk_level, locationPoint.risk_score) },
                      ]}>
                      {locationPoint.risk_level}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.locationScore, { color: t.textSecondary }]}>
                  Risk skoru {locationPoint.risk_score.toFixed(2)} · M4+ 24s {percent(locationPoint.probability)}
                </Text>
                <View style={styles.locationMetrics}>
                  <Text style={[styles.locationMetric, { color: t.textMuted }]}>
                    M5+ 72s: <Text style={{ color: t.text }}>{percent(locationPoint.m5_72h_probability)}</Text>
                  </Text>
                  <Text style={[styles.locationMetric, { color: t.textMuted }]}>
                    Sinyal event: <Text style={{ color: t.text }}>{locationPoint.signal_event_count ?? 0}</Text>
                  </Text>
                  <Text style={[styles.locationMetric, { color: t.textMuted }]}>
                    Fay uzakligi: <Text style={{ color: t.text }}>
                      {locationPoint.fault_distance != null ? `${locationPoint.fault_distance.toFixed(0)} km` : '--'}
                    </Text>
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={[styles.sectionSub, { color: t.textSecondary }]}>
                Konum izni verirsen bulundugun nokta icin risk karti olusturulur.
              </Text>
            )}
          </View>

          <Text style={[styles.listTitle, { color: t.text }]}>Sehir ozeti</Text>
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator style={styles.pad} color={t.accent} />
        ) : (
          <Text style={[styles.empty, { color: t.textSecondary }]}>Tahmin kaydi bulunamadi.</Text>
        )
      }
      renderItem={({ item }) => {
        const accent = riskAccent(scheme, item.risk_level, item.risk_score);
        return (
          <View
            style={[
              styles.card,
              {
                backgroundColor: t.listCard,
                borderColor: t.border,
              },
            ]}>
            <View style={[styles.cardAccent, { backgroundColor: accent }]} />
            <View style={styles.cardBody}>
              <View style={styles.cardTop}>
                <Text style={[styles.city, { color: t.text }]}>{item.city}</Text>
                <View style={[styles.badge, { backgroundColor: accent + '22' }]}>
                  <Text style={[styles.badgeText, { color: accent }]}>{item.risk_level}</Text>
                </View>
              </View>
              <Text style={[styles.score, { color: t.textSecondary }]}>
                Risk {item.risk_score.toFixed(2)} · M4+ 24s {percent(item.probability)}
              </Text>
              <View style={styles.metrics}>
                <Text style={[styles.metric, { color: t.textMuted }]}>
                  M5+ 72s: <Text style={{ color: t.text }}>{percent(item.m5_72h_probability)}</Text>
                </Text>
                <Text style={[styles.metric, { color: t.textMuted }]}>
                  Sinyal event: <Text style={{ color: t.text }}>{item.signal_event_count ?? 0}</Text>
                </Text>
              </View>
            </View>
          </View>
        );
      }}
    />
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    headerPad: { padding: 16, paddingBottom: 8, gap: 12 },
    hero: {
      borderRadius: 20,
      borderWidth: 1,
      padding: 18,
    },
    heroTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
    heroSub: { fontSize: 14, marginTop: 8, lineHeight: 20 },
    sectionCard: {
      borderRadius: 20,
      borderWidth: 1,
      padding: 16,
      gap: 12,
    },
    sectionHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    sectionTitle: { fontSize: 17, fontWeight: '800' },
    sectionSub: { fontSize: 13, lineHeight: 18, marginTop: 4 },
    locationBtn: {
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    locationBtnText: { fontSize: 13, fontWeight: '800' },
    bannerErr: {
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
    },
    errText: { fontSize: 14, lineHeight: 20 },
    healthBadge: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    healthBadgeText: { fontSize: 12, fontWeight: '800' },
    modelSummary: { fontSize: 13, lineHeight: 20 },
    metricsRow: { flexDirection: 'row', gap: 8 },
    metricBox: {
      flex: 1,
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 10,
    },
    metricLabel: { fontSize: 11, fontWeight: '700' },
    metricValue: { fontSize: 18, fontWeight: '800', marginTop: 4 },
    locationCard: {
      borderRadius: 18,
      padding: 14,
      gap: 10,
    },
    locationHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    locationTitle: { fontSize: 16, fontWeight: '800' },
    locationScore: { fontSize: 13, lineHeight: 18 },
    locationMetrics: { gap: 4 },
    locationMetric: { fontSize: 13 },
    levelPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
    levelPillText: { fontSize: 12, fontWeight: '800' },
    listTitle: { fontSize: 16, fontWeight: '800', marginTop: 4 },
    pad: { marginTop: 24 },
    listPad: { paddingBottom: 110 },
    empty: { textAlign: 'center', marginTop: 32, fontSize: 15 },
    card: {
      marginHorizontal: 16,
      marginBottom: 12,
      borderRadius: 20,
      borderWidth: 1,
      overflow: 'hidden',
      flexDirection: 'row',
    },
    cardAccent: { width: 4 },
    cardBody: { flex: 1, padding: 16 },
    cardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
    },
    city: { fontSize: 18, fontWeight: '700', flex: 1 },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    badgeText: { fontSize: 12, fontWeight: '700' },
    score: { fontSize: 13, marginTop: 4 },
    metrics: { marginTop: 12, gap: 4 },
    metric: { fontSize: 13 },
  });
}
