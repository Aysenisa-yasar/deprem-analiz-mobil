import { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';

import type { ThemeTokens } from '@/constants/theme';
import { riskAccent } from '@/constants/theme';
import type { ForecastGridPoint, ForecastPoint } from '@/lib/api';

type Props = {
  points: ForecastPoint[];
  heatPoints?: ForecastGridPoint[];
  scheme: 'light' | 'dark';
  t: ThemeTokens;
  userLocation?: { lat: number; lon: number } | null;
};

const TR_REGION = {
  latitude: 39.1,
  longitude: 35.2,
  latitudeDelta: 12,
  longitudeDelta: 12,
};

function hexToRgba(color: string, alpha: number) {
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  const hex = color.replace('#', '');
  if (hex.length !== 6) return color;
  const value = Number.parseInt(hex, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}

export function RiskMap({ points, heatPoints, scheme, t, userLocation }: Props) {
  const markers = useMemo(() => points.slice(0, 10), [points]);
  const heatLayer = useMemo(() => {
    const base =
      heatPoints && heatPoints.length
        ? heatPoints
        : points.map((point, index) => ({
            id: `${point.city}-${index}`,
            lat: point.lat,
            lon: point.lon,
            risk_score: point.risk_score,
            probability: point.probability,
          }));
    return [...base]
      .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))
      .slice(0, 120);
  }, [heatPoints, points]);

  return (
    <View style={styles.wrap}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={TR_REGION}
        rotateEnabled={false}
        pitchEnabled={false}
        liteMode={Platform.OS === 'android'}
        loadingEnabled
        showsUserLocation={Boolean(userLocation)}
        showsTraffic={false}
        showsIndoors={false}
        toolbarEnabled={false}>
        {heatLayer.map((point) => {
          const color = riskAccent(scheme, undefined, point.risk_score);
          const intensity = Math.max(0.08, Math.min(1, (point.risk_score ?? 0) / 10));
          const radius = 12000 + intensity * 52000;
          return (
            <Circle
              key={`heat-${point.id}`}
              center={{ latitude: point.lat, longitude: point.lon }}
              radius={radius}
              strokeWidth={1}
              strokeColor={hexToRgba(color, 0.22)}
              fillColor={hexToRgba(color, 0.12 + intensity * 0.2)}
            />
          );
        })}

        {markers.map((point) => {
          const color = riskAccent(scheme, point.risk_level, point.risk_score);
          return (
            <Marker
              key={point.city}
              coordinate={{ latitude: point.lat, longitude: point.lon }}
              tracksViewChanges={false}
              title={point.city}
              description={`Risk ${point.risk_score.toFixed(2)} | ${point.risk_level}`}>
              <View style={[styles.markerBox, { backgroundColor: t.mapMarkerBg, borderColor: color + '66' }]}>
                <Text style={[styles.markerTxt, { color }]}>{point.city}</Text>
              </View>
            </Marker>
          );
        })}

        {userLocation ? (
          <Marker
            coordinate={{ latitude: userLocation.lat, longitude: userLocation.lon }}
            title="Konumun"
            description="Bulundugun nokta">
            <View style={[styles.userMarker, { backgroundColor: t.accent }]}>
              <View style={styles.userMarkerDot} />
            </View>
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 260, borderRadius: 16, overflow: 'hidden' },
  markerBox: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  markerTxt: { fontSize: 11, fontWeight: '800' },
  userMarker: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  userMarkerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
});
