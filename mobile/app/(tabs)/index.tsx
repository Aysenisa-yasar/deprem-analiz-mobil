import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SeismicPulseMark } from '@/components/brand';
import {
  AvatarOrb,
  CosmicBackdrop,
  CosmicLabel,
  GlassCard,
  GlowButton,
  MiniBars,
  alpha,
} from '@/components/cosmic';
import { useColorScheme } from '@/components/useColorScheme';
import { theme, riskAccent, type ThemeTokens } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import {
  fetchForecastMap,
  fetchRecentQuakes,
  haversineKm,
  type ForecastPoint,
  type QuakeEvent,
} from '@/lib/api';
import { formatQuakeDateTime, relativeTimeTr } from '@/lib/quakeFormat';

function normalizeRiskScore(value?: number | null): number {
  if (value == null) return 0;
  return value <= 1 ? value : value / 10;
}

function findIstanbulPoint(points: ForecastPoint[]): ForecastPoint | null {
  return (
    points.find((point) => point.city.toLocaleLowerCase('tr-TR').includes('istanbul')) ||
    points[0] ||
    null
  );
}

function buildTrendBars(events: QuakeEvent[]) {
  const sample = events.slice(0, 7).reverse();
  if (!sample.length) return [0.22, -0.12, 0.28, -0.08, 0.34, 0.18, 0.42];
  const average = sample.reduce((sum, item) => sum + item.mag, 0) / sample.length;
  return sample.map((item, index) => {
    const centered = item.mag - average;
    return centered + (index % 2 === 0 ? 0.12 : -0.05);
  });
}

function insightLines(point: ForecastPoint | null, nearbyCount: number): string[] {
  if (point?.alert_advisory?.reasons?.length) {
    return point.alert_advisory.reasons.slice(0, 3);
  }

  const lines = [
    nearbyCount > 0
      ? `Son 24 saatte yakin bolgede ${nearbyCount} sismik olay one cikti.`
      : 'Son 24 saat icinde ciddi yogunluk gorunmuyor.',
  ];

  if (point?.signal_event_count != null) {
    lines.push(`Sinyal event sayisi ${point.signal_event_count} ile dikkat cekiyor.`);
  }
  if (point?.fault_distance != null) {
    lines.push(`Fay hattina tahmini uzaklik ${point.fault_distance.toFixed(0)} km.`);
  }

  return lines;
}

function quakeSourceLabel(event: QuakeEvent | null): string {
  if (!event?.source) return 'Sunucu senkronu';
  if (event.source === 'kandilli_live') return 'Kandilli canli besleme';
  if (event.source === 'usgs_direct') return 'USGS yedek besleme';
  return event.source;
}

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const t = theme[scheme];
  const styles = useMemo(() => makeStyles(t), [t]);
  const { apiBase, ready, user } = useAuth();

  const [quakes, setQuakes] = useState<QuakeEvent[]>([]);
  const [forecast, setForecast] = useState<ForecastPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);

    try {
      const [quakeResult, forecastResult] = await Promise.all([
        fetchRecentQuakes(apiBase, 60),
        fetchForecastMap(apiBase),
      ]);
      setQuakes(quakeResult);
      setForecast(forecastResult);

      if (!quakeResult.length && !forecastResult.length) {
        setError('Canli veri alinamadi. API adresini ve backend durumunu kontrol et.');
      }
    } catch {
      setQuakes([]);
      setForecast([]);
      setError('Veri akisi su an alinamadi. Yenileyip tekrar deneyebilirsin.');
    } finally {
      setLoading(false);
    }
  }, [apiBase, ready]);

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      void load();
    }, [load, ready])
  );

  const focusPoint = useMemo(() => findIstanbulPoint(forecast), [forecast]);
  const lastQuake = quakes[0] ?? null;
  const focusAccent = riskAccent(scheme, focusPoint?.risk_level, focusPoint?.risk_score);
  const normalizedRisk = normalizeRiskScore(focusPoint?.risk_score);
  const confidencePct = Math.round((focusPoint?.probability ?? 0.62) * 100);
  const trendBars = useMemo(() => buildTrendBars(quakes), [quakes]);
  const nearbyCount = useMemo(() => {
    if (!focusPoint) return 0;
    return quakes.filter((item) => {
      const distance = haversineKm(focusPoint.lat, focusPoint.lon, item.lat, item.lon);
      const ageHours = (Date.now() / 1000 - item.timestamp) / 3600;
      return distance <= 180 && ageHours <= 24;
    }).length;
  }, [focusPoint, quakes]);

  const trendLabel =
    focusPoint?.alert_advisory?.label ||
    (normalizedRisk >= 0.72 ? 'Yukseliyor' : normalizedRisk >= 0.46 ? 'Izleniyor' : 'Sakin');
  const trendIcon =
    normalizedRisk >= 0.72 ? 'arrow-up' : normalizedRisk >= 0.46 ? 'signal' : 'check';
  const insight = insightLines(focusPoint, nearbyCount);

  if (!ready) {
    return (
      <View style={[styles.loadingRoot, { backgroundColor: t.bg }]}>
        <ActivityIndicator size="large" color={t.brandTab} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CosmicBackdrop t={t} />
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scrollPad}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => void load()}
              tintColor={t.brandTab}
              colors={[t.brandTab]}
            />
          }>
          <View style={styles.topRow}>
            <View style={styles.brandLockup}>
              <SeismicPulseMark t={t} size={48} />
              <View style={styles.brandCopy}>
                <Text style={[styles.brandTitle, { color: t.text }]}>DepremAnaliz Live</Text>
                <Text style={[styles.brandSub, { color: t.textSecondary }]}>
                  Risk, mesaj ve P2P ayni akista
                </Text>
              </View>
            </View>

            <AvatarOrb
              t={t}
              size={42}
              label={(user?.username?.slice(0, 2) || 'DA').toUpperCase()}
            />
          </View>

          <GlassCard t={t} tone="warm" style={styles.heroCard}>
            <CosmicLabel t={t} accent={focusAccent}>
              canli risk paneli
            </CosmicLabel>
            <Text style={[styles.heroTitle, { color: t.text }]}>
              {focusPoint?.city || 'Istanbul'} Risk Durumu
            </Text>

            <View style={styles.metricRow}>
              <Text style={[styles.metricLabel, { color: t.textSecondary }]}>Risk Skoru</Text>
              <View style={styles.metricValueRow}>
                <Text style={[styles.metricValue, { color: focusAccent }]}>
                  {focusPoint ? normalizedRisk.toFixed(2) : '--'}
                </Text>
                <FontAwesome name="fire" size={20} color={focusAccent} />
              </View>
            </View>

            <View style={styles.metricRow}>
              <Text style={[styles.metricLabel, { color: t.textSecondary }]}>Trend</Text>
              <View style={styles.metricValueRow}>
                <Text style={[styles.metricSubValue, { color: focusAccent }]}>{trendLabel}</Text>
                <FontAwesome name={trendIcon} size={16} color={focusAccent} />
              </View>
            </View>

            <View style={styles.metricRow}>
              <Text style={[styles.metricLabel, { color: t.textSecondary }]}>Guven</Text>
              <Text style={[styles.metricSubValue, { color: t.mid }]}>
                %{confidencePct}{' '}
                {confidencePct >= 70 ? 'Guclu' : confidencePct >= 45 ? 'Orta' : 'Temkinli'}
              </Text>
            </View>

            <MiniBars
              t={t}
              values={trendBars}
              style={styles.trendBars}
              positiveColor={alpha(t.glowBlue, 0.88)}
              negativeColor={alpha(t.glowOrange, 0.86)}
            />

            <GlassCard t={t} tone="cool" style={styles.innerCard}>
              <Text style={[styles.innerTitle, { color: t.text }]}>Model Ozeti</Text>
              {insight.map((line) => (
                <Text key={line} style={[styles.innerCopy, { color: t.textSecondary }]}>
                  {line}
                </Text>
              ))}
            </GlassCard>
          </GlassCard>

          <GlassCard t={t} style={styles.quakeCard}>
            <View style={styles.quakeTop}>
              <Text style={[styles.cardTitle, { color: t.text }]}>Son Deprem</Text>
              <View style={styles.metricValueRow}>
                <FontAwesome name="map-marker" size={16} color={t.danger} />
                <Text style={[styles.quakeMag, { color: t.text }]}>
                  {lastQuake ? `M ${lastQuake.mag.toFixed(1)}` : 'Veri yok'}
                </Text>
              </View>
            </View>
            <MiniBars
              t={t}
              values={trendBars.map((value) => value * 0.84)}
              style={styles.quakeTrend}
              positiveColor={alpha(t.glowBlue, 0.82)}
              negativeColor={alpha(t.glowOrange, 0.72)}
            />
            <Text style={[styles.quakeMeta, { color: t.textSecondary }]}>
              {lastQuake
                ? `${quakeSourceLabel(lastQuake)} - ${lastQuake.depth.toFixed(0)} km derinlik - ${relativeTimeTr(lastQuake.timestamp)}`
                : 'Henuz son deprem verisi alinamadi.'}
            </Text>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: t.textSecondary }]}>Yakin Fay Mesafesi</Text>
              <Text style={[styles.detailValue, { color: t.warn }]}>
                {focusPoint?.fault_distance != null ? `${focusPoint.fault_distance.toFixed(0)} km` : '--'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: t.textSecondary }]}>Son Guncelleme</Text>
              <Text style={[styles.detailCaption, { color: t.textMuted }]}>
                {lastQuake ? formatQuakeDateTime(lastQuake.timestamp) : 'Bekleniyor'}
              </Text>
            </View>
          </GlassCard>

          <View style={styles.actionRow}>
            <GlowButton
              t={t}
              label="Son Depremler"
              onPress={() => router.push('/(tabs)/forecast')}
              trailing={<FontAwesome name="line-chart" size={15} color="#eef7ff" />}
              style={styles.actionButton}
            />
            <GlowButton
              t={t}
              label="Acil Mesajlar"
              tone="orange"
              onPress={() => router.push('/(tabs)/messages')}
              trailing={<FontAwesome name="comments" size={15} color="#eef7ff" />}
              style={styles.actionButton}
            />
          </View>

          <GlassCard t={t} tone="cool" style={styles.feedCard}>
            <View style={styles.feedHead}>
              <View>
                <Text style={[styles.cardTitle, { color: t.text }]}>Canli Akis</Text>
                <Text style={[styles.feedSub, { color: t.textSecondary }]}>
                  Son 24 saatte one cikan sismik hareketler
                </Text>
              </View>
              <CosmicLabel t={t}>{nearbyCount} yakin sinyal</CosmicLabel>
            </View>

            {(quakes.slice(0, 3).length ? quakes.slice(0, 3) : FALLBACK_ITEMS).map((item, index) => {
              const isFallback = 'title' in item;
              const title = isFallback
                ? item.title
                : `M${item.mag.toFixed(1)} - ${item.depth.toFixed(0)} km derinlik`;
              const subtitle = isFallback
                ? item.subtitle
                : `${quakeSourceLabel(item)} - ${relativeTimeTr(item.timestamp)} - ${item.lat.toFixed(2)}, ${item.lon.toFixed(2)}`;
              const accent = isFallback
                ? index === 0
                  ? t.glowOrange
                  : t.glowBlue
                : riskAccent(scheme, undefined, item.mag / 5);

              return (
                <View key={isFallback ? item.title : item.event_key} style={styles.feedRow}>
                  <View style={[styles.feedDot, { backgroundColor: accent }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.feedTitle, { color: t.text }]}>{title}</Text>
                    <Text style={[styles.feedText, { color: t.textSecondary }]}>{subtitle}</Text>
                  </View>
                </View>
              );
            })}
          </GlassCard>

          {error ? <Text style={[styles.errorText, { color: t.danger }]}>{error}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const FALLBACK_ITEMS = [
  { title: 'Risk verisi yukleniyor', subtitle: 'Sunucudan yeni tahminler bekleniyor.' },
  { title: 'Aktivite penceresi hazirlaniyor', subtitle: 'Ilk veri geldikce kartlar canli dolacak.' },
];

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    safe: { flex: 1 },
    loadingRoot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scrollPad: { padding: 18, paddingBottom: 118, gap: 16 },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    brandCopy: { gap: 2 },
    brandTitle: { fontSize: 16, fontWeight: '800', fontFamily: t.displayFont },
    brandSub: { fontSize: 12, lineHeight: 17 },
    heroCard: { padding: 18, gap: 12 },
    heroTitle: { fontSize: 32, fontWeight: '800', lineHeight: 38, fontFamily: t.displayFont },
    metricRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 4,
      paddingBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: alpha(t.border, 0.7),
    },
    metricLabel: { fontSize: 16, fontWeight: '600' },
    metricValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    metricValue: { fontSize: 42, fontWeight: '800', letterSpacing: -1.6, fontFamily: t.displayFont },
    metricSubValue: { fontSize: 22, fontWeight: '700', fontFamily: t.displayFont },
    trendBars: { marginTop: 4, marginBottom: 2 },
    innerCard: { borderRadius: 20, padding: 16, gap: 8 },
    innerTitle: { fontSize: 21, fontWeight: '800', fontFamily: t.displayFont },
    innerCopy: { fontSize: 18, lineHeight: 28 },
    quakeCard: { gap: 12, padding: 18 },
    quakeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardTitle: { fontSize: 18, fontWeight: '800' },
    quakeMag: { fontSize: 19, fontWeight: '800', fontFamily: t.displayFont },
    quakeTrend: { marginTop: 2 },
    quakeMeta: { fontSize: 16, lineHeight: 23 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    detailLabel: { fontSize: 15, fontWeight: '600' },
    detailValue: { fontSize: 16, fontWeight: '800' },
    detailCaption: { fontSize: 14, fontWeight: '600' },
    actionRow: { flexDirection: 'row', gap: 10 },
    actionButton: { flex: 1 },
    feedCard: { gap: 14 },
    feedHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
    feedSub: { fontSize: 13, lineHeight: 18, marginTop: 4, maxWidth: 220 },
    feedRow: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'flex-start',
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: alpha(t.border, 0.6),
    },
    feedDot: { width: 11, height: 11, borderRadius: 999, marginTop: 6 },
    feedTitle: { fontSize: 15, fontWeight: '700' },
    feedText: { fontSize: 13, lineHeight: 19, marginTop: 3 },
    errorText: {
      fontSize: 13,
      lineHeight: 18,
      paddingHorizontal: 4,
    },
  });
}
