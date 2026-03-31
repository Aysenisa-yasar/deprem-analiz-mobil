import { StyleSheet, Text, View } from 'react-native';

import type { ThemeTokens } from '@/constants/theme';
import type { QuakeEvent } from '@/lib/api';

type Props = {
  events: QuakeEvent[];
  scheme: 'light' | 'dark';
  t: ThemeTokens;
};

export function QuakeMap({ events, t }: Props) {
  return (
    <View style={[styles.webFall, { backgroundColor: t.surfaceMuted }]}>
      <Text style={[styles.webFallTitle, { color: t.text }]}>Harita ozeti</Text>
      <Text style={[styles.webFallBody, { color: t.textSecondary }]}>
        Web surumunde native harita yerine hizli ozet gosteriliyor. Telefon build'inde canli
        deprem haritasi acilir.
      </Text>
      <Text style={[styles.webFallMeta, { color: t.textMuted }]}>
        Gosterilen olay: {events.length}
      </Text>
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
    paddingHorizontal: 24,
  },
  webFallTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  webFallBody: { textAlign: 'center', lineHeight: 20 },
  webFallMeta: { marginTop: 10, fontSize: 12, fontWeight: '700' },
});
