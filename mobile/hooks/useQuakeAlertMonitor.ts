import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import type { AlertPreferences } from '@/context/AlertPreferencesContext';
import { playAlertChime } from '@/lib/alertAudio';
import { fetchRecentQuakes, haversineKm, sendLocationAlert } from '@/lib/api';

const EMERGENCY_SHARE_MAG_MIN = 5;
const EMERGENCY_SHARE_DIST_MAX = 150;
const MAX_EVENT_AGE_SEC = 45 * 60;
const POLL_MS = 120_000;

export function useQuakeAlertMonitor(
  apiBase: string,
  token: string | null,
  emergencyContact: string | null | undefined,
  preferences: AlertPreferences
) {
  const running = useRef(false);
  const alertedEvents = useRef<Record<string, true>>({});

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!preferences.enabled) return;

    let timer: ReturnType<typeof setInterval> | undefined;

    const tick = async () => {
      if (AppState.currentState !== 'active') return;
      if (running.current) return;
      running.current = true;

      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') return;

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        });
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const now = Date.now() / 1000;

        const events = await fetchRecentQuakes(apiBase, 80);
        const base = apiBase.replace(/\/$/, '');

        for (const eq of events) {
          if (eq.mag < preferences.minMagnitude) continue;
          if (now - eq.timestamp > MAX_EVENT_AGE_SEC) continue;

          const distanceKm = haversineKm(lat, lon, eq.lat, eq.lon);
          if (distanceKm > preferences.maxDistanceKm) continue;

          if (!alertedEvents.current[eq.event_key]) {
            alertedEvents.current[eq.event_key] = true;
            await playAlertChime();
          }

          if (
            !token ||
            !emergencyContact?.trim() ||
            eq.mag < EMERGENCY_SHARE_MAG_MIN ||
            distanceKm > EMERGENCY_SHARE_DIST_MAX
          ) {
            continue;
          }

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
        /* network or location failure */
      } finally {
        running.current = false;
      }
    };

    void tick();
    timer = setInterval(() => {
      void tick();
    }, POLL_MS);

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [apiBase, emergencyContact, preferences, token]);
}
