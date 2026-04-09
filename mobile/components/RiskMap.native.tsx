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
  focusPoint?: { lat: number; lon: number } | null;
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

function normalizedRisk(value?: number | null) {
  if (value == null) return 0;
  return value <= 1 ? value : value / 10;
}

export function RiskMap({ points, heatPoints, scheme, t, userLocation, focusPoint }: Props) {
  const markers = useMemo(() => points.slice(0, 18), [points]);
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
      .slice(0, 140);
  }, [heatPoints, points]);

  const region = useMemo(() => {
    if (!focusPoint) return TR_REGION;
    return {
      latitude: focusPoint.lat,
      longitude: focusPoint.lon,
      latitudeDelta: 4.4,
      longitudeDelta: 4.4,
    };
  }, [focusPoint]);

  return (
    <View style={styles.wrap}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={TR_REGION}
        region={region}
        rotateEnabled={false}
        pitchEnabled={false}
        liteMode={Platform.OS === 'android'}
        loadingEnabled
        customMapStyle={MODERN_MAP_STYLE}
        showsUserLocation={Boolean(userLocation)}
        showsTraffic={false}
        showsIndoors={false}
        showsBuildings={false}
        toolbarEnabled={false}>
        {heatLayer.map((point) => {
          const color = riskAccent(scheme, undefined, point.risk_score);
          const intensity = Math.max(0.12, normalizedRisk(point.risk_score));
          const radius = 16000 + intensity * 68000;
          return (
            <Circle
              key={`heat-${point.id}`}
              center={{ latitude: point.lat, longitude: point.lon }}
              radius={radius}
              strokeWidth={1}
              strokeColor={hexToRgba(color, 0.42)}
              fillColor={hexToRgba(color, 0.08 + intensity * 0.18)}
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
              description={`Risk ${normalizedRisk(point.risk_score).toFixed(2)} | ${point.risk_level}`}>
              <View style={[styles.markerBox, { borderColor: hexToRgba(color, 0.42) }]}>
                <View style={[styles.markerDot, { backgroundColor: color }]} />
                <Text style={[styles.markerTxt, { color: '#111827' }]}>{point.city}</Text>
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
  wrap: { flex: 1, minHeight: 300, borderRadius: 18, overflow: 'hidden' },
  markerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
  },
  markerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  markerTxt: { fontSize: 11, fontWeight: '800' },
  userMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  userMarkerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
});
