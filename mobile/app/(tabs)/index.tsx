import { useFocusEffect } from '@react-navigation/native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QuakeMap } from '@/components/QuakeMap';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/context/AuthContext';
import { theme, type ThemeTokens } from '@/constants/theme';
import { fetchRecentQuakes, haversineKm, type QuakeEvent } from '@/lib/api';
import { getSafeDeviceLocation } from '@/lib/location';
import {
  countBuckets,
  filterQuakes,
  formatCoordShort,
  formatQuakeDateTime,
  magBucketColor,
  relativeTimeTr,
} from '@/lib/quakeFormat';

type TimeFilter = 'all' | '24h' | '7d';

export default function DepremlerScreen() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const t = theme[scheme];
  const styles = useMemo(() => makeStyles(t), [t]);

  const { apiBase, ready } = useAuth();
  const [raw, setRaw] = useState<QuakeEvent[]>([]);
  const [query, setQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('24h');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [userLoc, setUserLoc] = useState<{ lat: number; lon: number } | null>(null);

  const maxAgeSec = timeFilter === 'all' ? null : timeFilter === '24h' ? 86_400 : 604_800;

  const timeFiltered = useMemo(
    () => filterQuakes(raw, '', maxAgeSec),
    [raw, maxAgeSec]
  );
  const displayed = useMemo(
    () => filterQuakes(timeFiltered, query, null),
    [timeFiltered, query]
  );
  const buckets = useMemo(() => countBuckets(timeFiltered), [timeFiltered]);

  const load = useCallback(async () => {
    if (!ready) return;
    setErr(null);
    setLoading(true);
    try {
      const ev = await fetchRecentQuakes(apiBase, 120);
      setRaw(ev);
      setUpdatedAt(Math.floor(Date.now() / 1000));
    } catch {
      setErr('Liste alınamadı. Ağ ve API adresini kontrol edin.');
      setRaw([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, ready]);

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      load();
    }, [ready, load])
  );

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    (async () => {
      const result = await getSafeDeviceLocation({ requestPermission: false, accuracy: 1 });
      if (alive && result.ok) setUserLoc({ lat: result.lat, lon: result.lon });
    })();
    return () => {
      alive = false;
    };
  }, [ready]);

  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator size="large" color={t.brandTab} />
      </View>
    );
  }

  const updateLabel =
    updatedAt != null
      ? new Date(updatedAt * 1000).toLocaleTimeString('tr-TR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';

  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <SafeAreaView edges={['top']} style={[styles.headerBlock, { backgroundColor: t.brandHeader }]}>
        <View style={styles.headerTop}>
          <Text style={[styles.headerTitle, { color: t.brandOnHeader }]}>Depremler</Text>
          <Pressable
            onPress={load}
            style={[styles.iconBtn, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
            hitSlop={8}>
            <FontAwesome name="refresh" size={18} color={t.brandOnHeader} />
          </Pressable>
        </View>
        <View
          style={[
            styles.searchWrap,
            { backgroundColor: scheme === 'dark' ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.22)' },
          ]}>
          <FontAwesome name="search" size={16} color="rgba(255,255,255,0.85)" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Konum veya M büyüklüğü ara…"
            placeholderTextColor="rgba(255,255,255,0.65)"
            style={[styles.searchInput, { color: t.brandOnHeader }]}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <FontAwesome name="times-circle" size={18} color="rgba(255,255,255,0.8)" />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.liveRow}>
          <FontAwesome name="heartbeat" size={14} color={t.brandOnHeader} />
          <Text style={[styles.liveText, { color: t.brandOnHeader }]}>Türkiye ve çevresi</Text>
          <View style={styles.liveDot} />
          <Text style={[styles.liveSub, { color: t.brandOnHeader }]}>Canlı özet</Text>
        </View>
      </SafeAreaView>

      <View style={[styles.summary, { backgroundColor: t.surface }]}>
        <View style={styles.summaryHead}>
          <Text style={[styles.summaryTitle, { color: t.text }]}>Son depremler</Text>
          <Text style={[styles.summarySub, { color: t.textSecondary }]}>Güncel özet</Text>
        </View>
        <View style={styles.buckets}>
          <View style={[styles.bucket, { backgroundColor: scheme === 'dark' ? '#7f1d1d' : '#fecaca' }]}>
            <Text style={[styles.bucketNum, { color: scheme === 'dark' ? '#fecaca' : '#991b1b' }]}>
              {buckets.high}
            </Text>
            <Text style={[styles.bucketLbl, { color: scheme === 'dark' ? '#fca5a5' : '#7f1d1d' }]}>M 4.0+</Text>
          </View>
          <View style={[styles.bucket, { backgroundColor: scheme === 'dark' ? '#9a3412' : '#fed7aa' }]}>
            <Text style={[styles.bucketNum, { color: scheme === 'dark' ? '#ffedd5' : '#9a3412' }]}>
              {buckets.mid}
            </Text>
            <Text style={[styles.bucketLbl, { color: scheme === 'dark' ? '#fdba74' : '#c2410c' }]}>
              M 2.0–3.9
            </Text>
          </View>
          <View style={[styles.bucket, { backgroundColor: scheme === 'dark' ? '#a16207' : '#fef9c3' }]}>
            <Text style={[styles.bucketNum, { color: scheme === 'dark' ? '#fef08a' : '#854d0e' }]}>
              {buckets.low}
            </Text>
            <Text style={[styles.bucketLbl, { color: scheme === 'dark' ? '#fde047' : '#a16207' }]}>M &lt; 2</Text>
          </View>
        </View>
        <Text style={[styles.updateFoot, { color: t.textMuted }]}>
          Son güncelleme: {updateLabel}
        </Text>
      </View>

      <View style={styles.toolbar}>
        <View style={[styles.segment, { backgroundColor: t.surfaceMuted }]}>
          <Pressable
            onPress={() => setView('list')}
            style={[styles.segBtn, view === 'list' && { backgroundColor: t.surface }]}>
            <FontAwesome
              name="list-ul"
              size={16}
              color={view === 'list' ? t.brandTab : t.textMuted}
            />
            <Text
              style={[
                styles.segLabel,
                { color: view === 'list' ? t.text : t.textMuted },
                view === 'list' && { fontWeight: '800' },
              ]}>
              Liste
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setView('map')}
            style={[styles.segBtn, view === 'map' && { backgroundColor: t.surface }]}>
            <FontAwesome name="map" size={16} color={view === 'map' ? t.brandTab : t.textMuted} />
            <Text
              style={[
                styles.segLabel,
                { color: view === 'map' ? t.text : t.textMuted },
                view === 'map' && { fontWeight: '800' },
              ]}>
              Harita
            </Text>
          </Pressable>
        </View>
        <View style={[styles.chips, { backgroundColor: t.surfaceMuted }]}>
          {(['all', '24h', '7d'] as const).map((k) => (
            <Pressable
              key={k}
              onPress={() => setTimeFilter(k)}
              style={[
                styles.chip,
                timeFilter === k && styles.chipOn,
                timeFilter === k && { backgroundColor: t.brandHeader },
              ]}>
              <Text
                style={[
                  styles.chipTxt,
                  { color: timeFilter === k ? t.brandOnHeader : t.textSecondary },
                ]}>
                {k === 'all' ? 'Hepsi' : k === '24h' ? '24 saat' : '7 gün'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {err ? (
        <View style={[styles.bannerErr, { borderColor: t.danger, backgroundColor: t.surface }]}>
          <Text style={[styles.errText, { color: t.danger }]}>{err}</Text>
        </View>
      ) : null}

      {view === 'map' ? (
        <View style={styles.mapShell}>
          <QuakeMap events={displayed} scheme={scheme} t={t} />
          <View
            style={[
              styles.mapBadge,
              { backgroundColor: t.glassOverlay },
            ]}>
            <Text style={{ color: t.text, fontWeight: '700' }}>{displayed.length} deprem</Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={(i) => i.event_key}
          removeClippedSubviews={Platform.OS === 'android'}
          windowSize={8}
          contentContainerStyle={styles.listPad}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={load}
              tintColor={t.brandTab}
              colors={[t.brandTab]}
            />
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator style={styles.pad} color={t.brandTab} />
            ) : (
              <Text style={[styles.empty, { color: t.textSecondary }]}>Kayıt bulunamadı.</Text>
            )
          }
          renderItem={({ item }) => {
            const ring = magBucketColor(item.mag, scheme);
            const distKm =
              userLoc != null
                ? haversineKm(userLoc.lat, userLoc.lon, item.lat, item.lon)
                : null;
            return (
              <View
                style={[
                  styles.qCard,
                  {
                    backgroundColor: t.listCard,
                    borderColor: t.border,
                  },
                ]}>
                <View style={[styles.magCircle, { borderColor: ring }]}>
                  <Text style={[styles.magVal, { color: ring }]}>{item.mag.toFixed(1)}</Text>
                  <Text style={[styles.magUnit, { color: t.textMuted }]}>Ml</Text>
                </View>
                <View style={styles.qBody}>
                  <Text style={[styles.qPlace, { color: t.text }]} numberOfLines={2}>
                    {formatCoordShort(item.lat, item.lon)}
                  </Text>
                  <View style={styles.qRow}>
                    <FontAwesome name="clock-o" size={13} color={t.textMuted} />
                    <Text style={[styles.qMeta, { color: t.textSecondary }]}>
                      {formatQuakeDateTime(item.timestamp)} · {relativeTimeTr(item.timestamp)}
                    </Text>
                  </View>
                  <View style={styles.qRow}>
                    <FontAwesome name="arrow-down" size={13} color={t.textMuted} />
                    <Text style={[styles.qMeta, { color: t.textSecondary }]}>
                      {item.depth.toFixed(1)} km derinlik
                    </Text>
                  </View>
                  {distKm != null ? (
                    <View style={styles.qRow}>
                      <FontAwesome name="location-arrow" size={13} color={t.textMuted} />
                      <Text style={[styles.qMeta, { color: t.textSecondary }]}>
                        Sizden ~{distKm.toFixed(0)} km
                      </Text>
                    </View>
                  ) : null}
                </View>
                <FontAwesome name="chevron-right" size={14} color={t.textMuted} />
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    headerBlock: { paddingHorizontal: 16, paddingBottom: 14 },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    headerTitle: { fontSize: 22, fontWeight: '800' },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
    },
    searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
    liveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 10,
      gap: 6,
    },
    liveText: { fontSize: 13, fontWeight: '600' },
    liveSub: { fontSize: 12, opacity: 0.95, marginLeft: 4 },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: '#4ade80',
      marginLeft: 4,
    },
    summary: {
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 18,
      padding: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
    },
    summaryHead: { marginBottom: 10 },
    summaryTitle: { fontSize: 17, fontWeight: '800' },
    summarySub: { fontSize: 13, marginTop: 2 },
    buckets: { flexDirection: 'row', gap: 8 },
    bucket: { flex: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 6 },
    bucketNum: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
    bucketLbl: { fontSize: 10, fontWeight: '700', textAlign: 'center', marginTop: 2 },
    updateFoot: { fontSize: 12, marginTop: 10, textAlign: 'center' },
    toolbar: { paddingHorizontal: 16, marginTop: 12, gap: 10 },
    segment: {
      flexDirection: 'row',
      borderRadius: 14,
      padding: 4,
    },
    segBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      borderRadius: 12,
    },
    segLabel: { fontSize: 14, fontWeight: '600' },
    chips: { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 6 },
    chip: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
    chipOn: {},
    chipTxt: { fontSize: 12, fontWeight: '700' },
    bannerErr: {
      marginHorizontal: 16,
      marginTop: 10,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
    },
    errText: { fontSize: 14 },
    mapShell: { flex: 1, marginHorizontal: 16, marginTop: 10, marginBottom: 8 },
    mapBadge: {
      position: 'absolute',
      bottom: 12,
      alignSelf: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 20,
    },
    listPad: { paddingBottom: 100, paddingTop: 8 },
    pad: { marginTop: 24 },
    empty: { textAlign: 'center', marginTop: 32, fontSize: 15 },
    qCard: {
      marginHorizontal: 16,
      marginBottom: 12,
      borderRadius: 20,
      borderWidth: 1,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    magCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      borderWidth: 3,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    magVal: { fontSize: 16, fontWeight: '800' },
    magUnit: { fontSize: 10, fontWeight: '600', marginTop: -2 },
    qBody: { flex: 1, minWidth: 0 },
    qPlace: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
    qRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    qMeta: { fontSize: 12, flex: 1 },
  });
}
