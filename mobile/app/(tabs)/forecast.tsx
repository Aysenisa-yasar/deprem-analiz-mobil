import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { RiskMap } from '@/components/RiskMap';
import { useColorScheme } from '@/components/useColorScheme';
import { theme, riskAccent, type ThemeTokens } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import {
  fetchForecastGrid,
  fetchForecastLocation,
  fetchForecastMap,
  fetchForecastModelStatus,
  type ForecastGridPoint,
  type ForecastPoint,
  type ModelHealth,
  type WarningCapability,
} from '@/lib/api';
import { getSafeDeviceLocation } from '@/lib/location';

function percent(value?: number | null) {
  if (value == null) return '--';
  return `${(value * 100).toFixed(1)}%`;
}

function metricLabel(health: ModelHealth | null): string {
  if (!health?.available) return 'Sunucuda model yok';
  return health.quality_label || 'Deneysel';
}

function advisoryAccent(t: ThemeTokens, level?: string | null): string {
  if (level === 'high_alert') return t.danger;
  if (level === 'prepare') return t.warn;
  if (level === 'watch') return t.accent;
  return t.success;
}

function backtestFourthMetricLabel(health: ModelHealth | null): string {
  if (health?.backtest?.legacy) return 'Legacy acc';
  return 'Recall';
}

function backtestFourthMetricValue(health: ModelHealth | null): string {
  if (health?.backtest?.legacy) return percent(health?.backtest?.accuracy);
  return percent(health?.backtest?.recall);
}

function formatTrainedAt(value?: string | null): string {
  if (!value) return 'Yuklu degil';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('tr-TR');
}

export default function ForecastScreen() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const t = theme[scheme];
  const styles = useMemo(() => makeStyles(t), [t]);

  const { apiBase, ready } = useAuth();
  const [points, setPoints] = useState<ForecastPoint[]>([]);
  const [heatPoints, setHeatPoints] = useState<ForecastGridPoint[]>([]);
  const [modelHealth, setModelHealth] = useState<ModelHealth | null>(null);
  const [warningCapability, setWarningCapability] = useState<WarningCapability | null>(null);
  const [locationPoint, setLocationPoint] = useState<ForecastPoint | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [locationNeedsSettings, setLocationNeedsSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const locationPromptedRef = useRef(false);

  const sortedPoints = useMemo(
    () => [...points].sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0)),
    [points]
  );
  const topHighlights = useMemo(() => sortedPoints.slice(0, 3), [sortedPoints]);

  const loadBase = useCallback(async () => {
    setErr(null);
    setLoading(true);
    const [mapResult, gridResult, statusResult] = await Promise.allSettled([
      fetchForecastMap(apiBase),
      fetchForecastGrid(apiBase),
      fetchForecastModelStatus(apiBase),
    ]);

    const mapOk = mapResult.status === 'fulfilled';
    const statusOk = statusResult.status === 'fulfilled';

    setPoints(mapOk ? mapResult.value : []);
    setHeatPoints(gridResult.status === 'fulfilled' ? gridResult.value : []);
    setModelHealth(statusOk ? statusResult.value.modelHealth : null);
    setWarningCapability(statusOk ? statusResult.value.warningCapability : null);

    if (!mapOk && !statusOk) {
      setErr(
        Platform.OS === 'web'
          ? 'Sunucuya ulasilamadi. Yerelde backend calisiyor mu ve API adresi dogru mu kontrol edin.'
          : 'Tahmin verisi alinamadi. Ayarlar ekranindaki API adresini kontrol edin.'
      );
    }
    setLoading(false);
  }, [apiBase]);

  const loadLocationForecast = useCallback(
    async (requestPermission: boolean) => {
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
        setLocationNeedsSettings(false);
        setUserLocation({ lat: location.lat, lon: location.lon });

        const result = await fetchForecastLocation(
          apiBase,
          location.lat,
          location.lon
        );
        setLocationPoint(result.point);
        if (result.modelHealth) setModelHealth(result.modelHealth);
        if (result.warningCapability) setWarningCapability(result.warningCapability);
        setLocationMessage(location.message || null);
      } catch {
        setLocationPoint(null);
        setUserLocation(null);
        setLocationNeedsSettings(false);
        if (requestPermission) {
          setLocationMessage('Konuma gore tahmin alinamadi. Biraz sonra tekrar dene.');
        }
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
    if (locationPromptedRef.current) return;
    locationPromptedRef.current = true;
    void loadLocationForecast(true);
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
            <Text style={[styles.heroTitle, { color: t.text }]}>Cok katmanli uyari merkezi</Text>
            <Text style={[styles.heroSub, { color: t.textSecondary }]}>
              Bu ekran resmi saniyeler-once erken uyari yerine gecmez. Model, son olay yogunlugu
              ve mekansal sinyallere gore bolgesel risk artisini yorumlar.
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
                <Text style={[styles.sectionTitle, { color: t.text }]}>Uyari yetenegi</Text>
                <Text style={[styles.sectionSub, { color: t.textSecondary }]}>
                  Hangi alarm katmanlarinin gercekten aktif oldugunu acikca gosterir.
                </Text>
              </View>
            </View>
            <Text style={[styles.modelSummary, { color: t.textSecondary }]}>
              {warningCapability?.summary ||
                'ML risk uyarilari hazir. Resmi sensornet tabanli erken uyari bu surumde yok.'}
            </Text>
            <View style={styles.capabilityRow}>
              <View style={[styles.capabilityPill, { backgroundColor: t.surfaceMuted }]}>
                <Text style={[styles.capabilityPillText, { color: t.text }]}>ML risk: Hazir</Text>
              </View>
              <View style={[styles.capabilityPill, { backgroundColor: t.surfaceMuted }]}>
                <Text style={[styles.capabilityPillText, { color: t.text }]}>
                  Resmi EEW: {warningCapability?.official_sensor_early_warning ? 'Var' : 'Yok'}
                </Text>
              </View>
              <View style={[styles.capabilityPill, { backgroundColor: t.surfaceMuted }]}>
                <Text style={[styles.capabilityPillText, { color: t.text }]}>
                  Siren alarm: {warningCapability?.seconds_before_alarm_supported ? 'Var' : 'Yok'}
                </Text>
              </View>
            </View>
          </View>

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
            <View style={[styles.modelMetaCard, { backgroundColor: t.surfaceMuted }]}>
              <Text style={[styles.modelMetaText, { color: t.text }]}>
                Son egitim: {formatTrainedAt(modelHealth?.trained_at)}
              </Text>
              <Text style={[styles.modelMetaText, { color: t.textSecondary }]}>
                Durum: {modelHealth?.available ? 'Egitilmis model yuklu' : 'Sunucu su an rules-only fallback modunda'}
              </Text>
            </View>
            <View style={styles.metricsGrid}>
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
                <Text style={[styles.metricLabel, { color: t.textMuted }]}>Precision</Text>
                <Text style={[styles.metricValue, { color: t.text }]}>
                  {percent(modelHealth?.backtest?.precision)}
                </Text>
              </View>
              <View style={[styles.metricBox, { backgroundColor: t.surfaceMuted }]}>
                <Text style={[styles.metricLabel, { color: t.textMuted }]}>
                  {backtestFourthMetricLabel(modelHealth)}
                </Text>
                <Text style={[styles.metricValue, { color: t.text }]}>
                  {backtestFourthMetricValue(modelHealth)}
                </Text>
              </View>
            </View>
            {modelHealth?.backtest?.top_decile_precision != null ? (
              <Text style={[styles.footnote, { color: t.textMuted }]}>
                Top %10 alarm adayi precision: {percent(modelHealth?.backtest?.top_decile_precision)}
              </Text>
            ) : null}
            {modelHealth?.backtest?.legacy ? (
              <Text style={[styles.footnote, { color: t.warn }]}>
                Bu model dosyasi eski backtest kaydiyla gelmis olabilir; kalite yorumu temkinli
                tutuldu.
              </Text>
            ) : null}
            {modelHealth?.available === false ? (
              <Text style={[styles.footnote, { color: t.warn }]}>
                Bu API su an egitilmis `forecast_latest.pkl` dosyasi olmadan calisiyor. Risk
                kartlari yine uretilir ama kural tabanli fallback agirliklidir.
              </Text>
            ) : null}
          </View>

          <View style={[styles.sectionCard, { backgroundColor: t.surface, borderColor: t.border }]}>
            <View style={styles.sectionHead}>
              <View>
                <Text style={[styles.sectionTitle, { color: t.text }]}>Bulundugun konum</Text>
                <Text style={[styles.sectionSub, { color: t.textSecondary }]}>
                  Konum verisiyle daha kisisel bir risk ve uyari karti uretilir.
                </Text>
              </View>
            </View>

            {locating ? (
              <ActivityIndicator color={t.accent} style={{ marginTop: 12 }} />
            ) : locationPoint ? (
              <>
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
                    Risk skoru {locationPoint.risk_score.toFixed(2)} - M4+ 24s{' '}
                    {percent(locationPoint.probability)}
                  </Text>
                  <View style={styles.locationMetrics}>
                    <Text style={[styles.locationMetric, { color: t.textMuted }]}>
                      M5+ 72s:{' '}
                      <Text style={{ color: t.text }}>{percent(locationPoint.m5_72h_probability)}</Text>
                    </Text>
                    <Text style={[styles.locationMetric, { color: t.textMuted }]}>
                      Sinyal event:{' '}
                      <Text style={{ color: t.text }}>{locationPoint.signal_event_count ?? 0}</Text>
                    </Text>
                    <Text style={[styles.locationMetric, { color: t.textMuted }]}>
                      Fay uzakligi:{' '}
                      <Text style={{ color: t.text }}>
                        {locationPoint.fault_distance != null
                          ? `${locationPoint.fault_distance.toFixed(0)} km`
                          : '--'}
                      </Text>
                    </Text>
                    {locationPoint.next_event_time_window ? (
                      <Text style={[styles.locationMetric, { color: t.textMuted }]}>
                        Beklenen pencere:{' '}
                        <Text style={{ color: t.text }}>{locationPoint.next_event_time_window}</Text>
                      </Text>
                    ) : null}
                  </View>
                </View>

                {locationPoint.alert_advisory ? (
                  <View
                    style={[
                      styles.advisoryCard,
                      {
                        backgroundColor: t.surfaceMuted,
                        borderColor: advisoryAccent(t, locationPoint.alert_advisory.level) + '55',
                      },
                    ]}>
                    <View style={styles.advisoryHead}>
                      <Text style={[styles.advisoryTitle, { color: t.text }]}>
                        Kisisel uyari seviyesi
                      </Text>
                      <View
                        style={[
                          styles.levelPill,
                          {
                            backgroundColor:
                              advisoryAccent(t, locationPoint.alert_advisory.level) + '22',
                          },
                        ]}>
                        <Text
                          style={[
                            styles.levelPillText,
                            { color: advisoryAccent(t, locationPoint.alert_advisory.level) },
                          ]}>
                          {locationPoint.alert_advisory.label}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.advisorySummary, { color: t.textSecondary }]}>
                      {locationPoint.alert_advisory.summary}
                    </Text>
                    {(locationPoint.alert_advisory.reasons || []).slice(0, 3).map((reason) => (
                      <Text key={reason} style={[styles.advisoryLine, { color: t.textMuted }]}>
                        - {reason}
                      </Text>
                    ))}
                    {(locationPoint.alert_advisory.actions || []).slice(0, 2).map((action) => (
                      <Text key={action} style={[styles.advisoryLine, { color: t.text }]}>
                        Yap: {action}
                      </Text>
                    ))}
                  </View>
                ) : null}
                {locationMessage ? (
                  <Text style={[styles.sectionSub, { color: t.textSecondary }]}>{locationMessage}</Text>
                ) : null}
              </>
            ) : (
              <>
                <Text style={[styles.sectionSub, { color: t.textSecondary }]}>
                  Konum izni verirsen bulundugun nokta icin risk karti olusturulur.
                </Text>
                {locationMessage ? (
                  <Text style={[styles.sectionSub, { color: t.textSecondary }]}>{locationMessage}</Text>
                ) : null}
              </>
            )}

            <Pressable
              onPress={() => void loadLocationForecast(true)}
              style={({ pressed }) => [
                styles.locationBtn,
                { backgroundColor: pressed || locating ? t.accentRipple : t.accent },
              ]}>
              <Text
                style={[styles.locationBtnText, { color: scheme === 'dark' ? t.onAccent : '#fff' }]}>
                {locating ? 'Konum aliniyor...' : locationPoint ? 'Konumumu yeniden hesapla' : 'Konum izni ver ve riskimi hesapla'}
              </Text>
            </Pressable>
            {locationNeedsSettings ? (
              <Pressable
                onPress={() => void Linking.openSettings()}
                style={({ pressed }) => [
                  styles.locationBtnSecondary,
                  {
                    backgroundColor: pressed ? t.surface : t.surfaceMuted,
                    borderColor: t.border,
                  },
                ]}>
                <Text style={[styles.locationBtnSecondaryText, { color: t.text }]}>
                  Konum ayarlarini ac
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View style={[styles.sectionCard, { backgroundColor: t.surface, borderColor: t.border }]}>
            <View style={styles.sectionHead}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionTitle, { color: t.text }]}>Risk haritasi</Text>
                <Text style={[styles.sectionSub, { color: t.textSecondary }]}>
                  Grid hucreleriyle olusan isi katmani risk yogunlugunu gosterir. Kendi konumunu da
                  bu katmanla karsilastirabilirsin.
                </Text>
              </View>
            </View>

            <View style={styles.highlightRow}>
              {topHighlights.map((item) => {
                const accent = riskAccent(scheme, item.risk_level, item.risk_score);
                return (
                  <View key={item.city} style={[styles.highlightPill, { backgroundColor: accent + '22' }]}>
                    <Text style={[styles.highlightCity, { color: accent }]}>{item.city}</Text>
                    <Text style={[styles.highlightMeta, { color: t.textSecondary }]}>
                      {item.risk_score.toFixed(2)} | {item.risk_level}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.heatLegendRow}>
              <View style={[styles.heatLegendPill, { backgroundColor: t.low + '22' }]}>
                <Text style={[styles.heatLegendText, { color: t.low }]}>Dusuk yayilim</Text>
              </View>
              <View style={[styles.heatLegendPill, { backgroundColor: t.mid + '22' }]}>
                <Text style={[styles.heatLegendText, { color: t.mid }]}>Orta yogunluk</Text>
              </View>
              <View style={[styles.heatLegendPill, { backgroundColor: t.high + '22' }]}>
                <Text style={[styles.heatLegendText, { color: t.high }]}>Yuksek birikim</Text>
              </View>
            </View>

            <RiskMap
              points={sortedPoints}
              heatPoints={heatPoints}
              scheme={scheme}
              t={t}
              userLocation={userLocation}
            />
          </View>

          <Text style={[styles.listTitle, { color: t.text }]}>81 il risk ozeti</Text>
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
                Risk {item.risk_score.toFixed(2)} - M4+ 24s {percent(item.probability)}
              </Text>
              <View style={styles.metrics}>
                <Text style={[styles.metric, { color: t.textMuted }]}>
                  M5+ 72s: <Text style={{ color: t.text }}>{percent(item.m5_72h_probability)}</Text>
                </Text>
                <Text style={[styles.metric, { color: t.textMuted }]}>
                  Sinyal event: <Text style={{ color: t.text }}>{item.signal_event_count ?? 0}</Text>
                </Text>
                {item.alert_advisory ? (
                  <Text style={[styles.metric, { color: t.textMuted }]}>
                    Uyari: <Text style={{ color: accent }}>{item.alert_advisory.label}</Text>
                  </Text>
                ) : null}
                {item.next_event_time_window ? (
                  <Text style={[styles.metric, { color: t.textMuted }]}>
                    Pencere: <Text style={{ color: t.text }}>{item.next_event_time_window}</Text>
                  </Text>
                ) : null}
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
    modelMetaCard: {
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 4,
    },
    modelMetaText: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
    locationBtn: {
      borderRadius: 14,
      marginTop: 4,
      alignItems: 'center',
      paddingVertical: 10,
    },
    locationBtnText: { fontSize: 13, fontWeight: '800' },
    locationBtnSecondary: {
      borderRadius: 14,
      marginTop: 2,
      alignItems: 'center',
      paddingVertical: 10,
      borderWidth: 1,
    },
    locationBtnSecondaryText: { fontSize: 13, fontWeight: '800' },
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
    capabilityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    capabilityPill: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    capabilityPillText: { fontSize: 12, fontWeight: '700' },
    metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    metricBox: {
      width: '48%',
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 10,
    },
    metricLabel: { fontSize: 11, fontWeight: '700' },
    metricValue: { fontSize: 18, fontWeight: '800', marginTop: 4 },
    footnote: { fontSize: 12, lineHeight: 18 },
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
    advisoryCard: {
      borderRadius: 18,
      borderWidth: 1,
      padding: 14,
      gap: 8,
    },
    advisoryHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    advisoryTitle: { fontSize: 15, fontWeight: '800' },
    advisorySummary: { fontSize: 13, lineHeight: 18 },
    advisoryLine: { fontSize: 13, lineHeight: 18 },
    levelPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
    levelPillText: { fontSize: 12, fontWeight: '800' },
    highlightRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    highlightPill: {
      flexGrow: 1,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minWidth: '30%',
    },
    highlightCity: { fontSize: 13, fontWeight: '800' },
    highlightMeta: { fontSize: 11, marginTop: 3, fontWeight: '700' },
    heatLegendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    heatLegendPill: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    heatLegendText: { fontSize: 11, fontWeight: '800' },
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
