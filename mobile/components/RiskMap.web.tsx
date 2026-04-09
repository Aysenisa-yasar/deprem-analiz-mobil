import { StyleSheet, Text, View } from 'react-native';

import type { ThemeTokens } from '@/constants/theme';
import type { ForecastGridPoint, ForecastPoint } from '@/lib/api';

type Props = {
  points: ForecastPoint[];
  heatPoints?: ForecastGridPoint[];
  t: ThemeTokens;
  userLocation?: { lat: number; lon: number } | null;
  focusPoint?: { lat: number; lon: number } | null;
};

export function RiskMap({ points, heatPoints, t, userLocation, focusPoint }: Props) {
  const top = points[0];

  return (
    <View style={[styles.webFall, { backgroundColor: 'rgba(255,255,255,0.92)', borderColor: t.border }]}>
      <Text style={[styles.webFallTitle, { color: '#111827' }]}>Risk haritasi ozeti</Text>
      <Text style={[styles.webFallBody, { color: '#374151' }]}>
        Web surumunde hizli ozet gosteriliyor. Telefon build'inde siyah etiketli canli risk
        haritasi ve isi katmani acilir.
      </Text>
      <Text style={[styles.webFallMeta, { color: '#4b5563' }]}>Toplam il: {points.length}</Text>
      {heatPoints?.length ? (
        <Text style={[styles.webFallMeta, { color: '#4b5563' }]}>
          Isi katmani hucreleri: {heatPoints.length}
        </Text>
      ) : null}
      {top ? (
        <Text style={[styles.webFallMeta, { color: '#4b5563' }]}>
          Odak il: {top.city} ({top.risk_score.toFixed(2)})
        </Text>
      ) : null}
      {focusPoint ? (
        <Text style={[styles.webFallMeta, { color: '#4b5563' }]}>
          Harita odagi: {focusPoint.lat.toFixed(3)}, {focusPoint.lon.toFixed(3)}
        </Text>
      ) : null}
      {userLocation ? (
        <Text style={[styles.webFallMeta, { color: '#4b5563' }]}>
          Konum aktif: {userLocation.lat.toFixed(3)}, {userLocation.lon.toFixed(3)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  webFall: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 260,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 24,
  },
  webFallTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  webFallBody: { textAlign: 'center', lineHeight: 20 },
  webFallMeta: { marginTop: 10, fontSize: 12, fontWeight: '700' },
});
