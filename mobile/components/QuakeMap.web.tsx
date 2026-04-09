import { StyleSheet, Text, View } from 'react-native';

import type { ThemeTokens } from '@/constants/theme';
import type { QuakeEvent } from '@/lib/api';

type Props = {
  events: QuakeEvent[];
  scheme: 'light' | 'dark';
  t: ThemeTokens;
};

export function QuakeMap({ events }: Props) {
  const latest = events[0];

  return (
    <View style={styles.webFall}>
      <Text style={styles.webFallTitle}>Son deprem haritasi ozeti</Text>
      <Text style={styles.webFallBody}>
        Web surumunde hizli ozet gosteriliyor. Telefon build'inde canli deprem haritasi,
        buyukluk halkalari ve son olay etiketleri acilir.
      </Text>
      <Text style={styles.webFallMeta}>Gosterilen olay: {events.length}</Text>
      {latest ? (
        <Text style={styles.webFallMeta}>
          Son olay: M{latest.mag.toFixed(1)} - {latest.depth.toFixed(0)} km
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
    minHeight: 220,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 24,
  },
  webFallTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8, color: '#111827' },
  webFallBody: { textAlign: 'center', lineHeight: 20, color: '#374151' },
  webFallMeta: { marginTop: 10, fontSize: 12, fontWeight: '700', color: '#4b5563' },
});
