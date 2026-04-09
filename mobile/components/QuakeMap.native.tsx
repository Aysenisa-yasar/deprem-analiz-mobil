import { Fragment, useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';

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

const MODERN_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f4f6fb' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#111827' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f4f6fb' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#d4dce9' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#e5e7eb' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#d7dce5' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dbeafe' }] },
];

function magnitudeRadius(mag: number) {
  return 5000 + Math.max(0, mag) * 5200;
}

function magnitudeFillOpacity(mag: number) {
  return Math.max(0.16, Math.min(0.42, 0.12 + mag * 0.05));
}

function hexToRgba(color: string, alpha: number) {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return color;
  const value = Number.parseInt(hex, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

export function QuakeMap({ events, scheme, t }: Props) {
  const markers = useMemo(() => events.slice(0, 60), [events]);

  return (
    <View style={styles.wrap}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={TR_REGION}
        rotateEnabled={false}
        pitchEnabled={false}
        liteMode={Platform.OS === 'android'}
        loadingEnabled
        customMapStyle={MODERN_MAP_STYLE}
        showsTraffic={false}
        showsIndoors={false}
        showsBuildings={false}
        toolbarEnabled={false}>
        {markers.map((event) => {
          const color = magLabelColor(event.mag, scheme);
          return (
            <Fragment key={`quake-layer-${event.event_key}`}>
              <Circle
                center={{ latitude: event.lat, longitude: event.lon }}
                radius={magnitudeRadius(event.mag)}
                strokeWidth={1}
                strokeColor={hexToRgba(color, 0.42)}
                fillColor={hexToRgba(color, magnitudeFillOpacity(event.mag))}
              />
              <Marker
                coordinate={{ latitude: event.lat, longitude: event.lon }}
                tracksViewChanges={false}>
                <View style={[styles.markerBox, { borderColor: hexToRgba(color, 0.42) }]}>
                  <Text style={[styles.markerTxt, { color: '#111827' }]}>M{event.mag.toFixed(1)}</Text>
                </View>
              </Marker>
            </Fragment>
          );
        })}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, borderRadius: 18, overflow: 'hidden' },
  markerBox: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
  },
  markerTxt: { fontSize: 12, fontWeight: '800' },
});
