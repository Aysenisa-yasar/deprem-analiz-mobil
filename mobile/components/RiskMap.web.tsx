import { StyleSheet, Text, View } from 'react-native';

import type { ThemeTokens } from '@/constants/theme';
import type { ForecastGridPoint, ForecastPoint } from '@/lib/api';

type Props = {
  points: ForecastPoint[];
  heatPoints?: ForecastGridPoint[];
  t: ThemeTokens;
  userLocation?: { lat: number; lon: number } | null;
};

export function RiskMap({ points, heatPoints, t, userLocation }: Props) {
  const top = points[0];

  return (
    <View style={[styles.webFall, { backgroundColor: t.surfaceMuted }]}>
      <Text style={[styles.webFallTitle, { color: t.text }]}>Risk haritasi ozeti</Text>
      <Text style={[styles.webFallBody, { color: t.textSecondary }]}>
        Web surumunde native harita yerine hizli ozet gosteriliyor. Telefonda canli risk haritasi
        markerlariyla birlikte acilir.
      </Text>
      <Text style={[styles.webFallMeta, { color: t.textMuted }]}>
        Toplam nokta: {points.length}
      </Text>
      {heatPoints?.length ? (
        <Text style={[styles.webFallMeta, { color: t.textMuted }]}>
          Isi katmani hucreleri: {heatPoints.length}
        </Text>
      ) : null}
      {top ? (
        <Text style={[styles.webFallMeta, { color: t.textMuted }]}>
          En yuksek: {top.city} ({top.risk_score.toFixed(2)})
        </Text>
      ) : null}
      {userLocation ? (
        <Text style={[styles.webFallMeta, { color: t.textMuted }]}>
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
    paddingHorizontal: 24,
  },
  webFallTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  webFallBody: { textAlign: 'center', lineHeight: 20 },
  webFallMeta: { marginTop: 10, fontSize: 12, fontWeight: '700' },
});
