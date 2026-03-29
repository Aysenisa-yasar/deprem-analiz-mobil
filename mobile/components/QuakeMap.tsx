import { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import type { ThemeTokens } from '@/constants/theme';
import type { QuakeEvent } from '@/lib/api';
import { magLabelColor } from '@/lib/quakeFormat';

type Props = {
  events: QuakeEvent[];
  scheme: 'light' | 'dark';
  t: ThemeTokens;
};

const TR_REGION = {
  latitude: 39.1,
  longitude: 35.2,
  latitudeDelta: 12,
  longitudeDelta: 12,
};

export function QuakeMap({ events, scheme, t }: Props) {
  const markers = useMemo(() => events.slice(0, 80), [events]);

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.webFall, { backgroundColor: t.surfaceMuted }]}>
        <Text style={[styles.webFallTitle, { color: t.text }]}>Harita</Text>
        <Text style={{ color: t.textSecondary, textAlign: 'center', paddingHorizontal: 24 }}>
          Harita görünümü iOS ve Android’de kullanılabilir. Web’de liste kullanın.
        </Text>
      </View>
    );
  }

  const Maps = require('react-native-maps') as typeof import('react-native-maps');
  const MapView = Maps.default;
  const Marker = Maps.Marker;

  return (
    <View style={styles.wrap}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={TR_REGION}
        rotateEnabled={false}
        pitchEnabled={false}
        liteMode={Platform.OS === 'android'}
        loadingEnabled
        showsTraffic={false}
        showsIndoors={false}
        toolbarEnabled={false}>
        {markers.map((e) => {
          const color = magLabelColor(e.mag, scheme);
          return (
            <Marker
              key={e.event_key}
              coordinate={{ latitude: e.lat, longitude: e.lon }}
              tracksViewChanges={false}>
              <View style={[styles.markerBox, { backgroundColor: t.mapMarkerBg }]}>
                <Text style={[styles.markerTxt, { color }]}>M{e.mag.toFixed(1)}</Text>
              </View>
            </Marker>
          );
        })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, borderRadius: 16, overflow: 'hidden' },
  markerBox: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  markerTxt: { fontSize: 12, fontWeight: '800' },
  webFall: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 220 },
  webFallTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
});
