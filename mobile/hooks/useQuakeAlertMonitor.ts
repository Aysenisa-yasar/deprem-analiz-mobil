import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import {
  fetchRecentQuakes,
  haversineKm,
  sendLocationAlert,
} from '@/lib/api';

const MAG_MIN = 5;
const DIST_KM_MAX = 150;
/** Eski kayıtların ilk kurulumda bildirim tetiklemesini azaltmak için (saniye). */
const MAX_EVENT_AGE_SEC = 45 * 60;
const POLL_MS = 45_000;

export function useQuakeAlertMonitor(
  apiBase: string,
  token: string | null,
  emergencyContact: string | null | undefined
) {
  const running = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!token || !emergencyContact?.trim()) return;

    let timer: ReturnType<typeof setInterval> | undefined;

    const tick = async () => {
      if (running.current) return;
      running.current = true;
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') return;

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const now = Date.now() / 1000;

        const events = await fetchRecentQuakes(apiBase, 100);
        const base = apiBase.replace(/\/$/, '');

        for (const eq of events) {
          if (eq.mag < MAG_MIN) continue;
          if (now - eq.timestamp > MAX_EVENT_AGE_SEC) continue;
          const d = haversineKm(lat, lon, eq.lat, eq.lon);
          if (d > DIST_KM_MAX) continue;
          await sendLocationAlert(base, token, {
            lat,
            lon,
            magnitude: eq.mag,
            epicenter_lat: eq.lat,
            epicenter_lon: eq.lon,
            event_key: eq.event_key,
          });
        }
      } catch {
        /* ağ / konum; sessiz */
      } finally {
        running.current = false;
      }
    };

    tick();
    timer = setInterval(tick, POLL_MS);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [apiBase, token, emergencyContact]);
}
