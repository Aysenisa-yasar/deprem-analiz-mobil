import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import type { AlertPreferences } from '@/context/AlertPreferencesContext';
import { playAlertChime } from '@/lib/alertAudio';
import { fetchRecentQuakes, haversineKm, sendLocationAlert } from '@/lib/api';
import { getSafeDeviceLocation } from '@/lib/location';
import { flushOfflineRelayQueue, queueOfflineRelayPacket } from '@/lib/offlineRelay';

const EMERGENCY_SHARE_MAG_MIN = 5;
const EMERGENCY_SHARE_DIST_MAX = 150;
const MAX_EVENT_AGE_SEC = 45 * 60;
const POLL_MS = 45_000;
const LOCATION_CACHE_MS = 90_000;

export function useQuakeAlertMonitor(
  apiBase: string,
  token: string | null,
  emergencyContact: string | null | undefined,
  preferences: AlertPreferences,
  relayEmergencyText?: (text: string, preferredUsername?: string | null) => Promise<{
    ok: boolean;
    sentCount: number;
    route: 'direct' | 'broadcast' | 'none';
    message?: string;
  }>
) {
  const running = useRef(false);
  const alertedEvents = useRef<Record<string, true>>({});
  const sharedEvents = useRef<Record<string, true>>({});

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!preferences.enabled) return;

    let timer: ReturnType<typeof setInterval> | undefined;
    let appStateSub: { remove: () => void } | null = null;
    let cancelled = false;

    const buildRelayText = (
      lat: number,
      lon: number,
      eq: { mag: number; lat: number; lon: number; timestamp: number; event_key: string },
      distanceKm: number
    ) =>
      [
        `[AUTO KONUM UYARISI] ${eq.mag.toFixed(1)} buyuklugunde deprem yakinda algilandi.`,
        `Konumum: ${lat.toFixed(5)}, ${lon.toFixed(5)}`,
        `Episantr: ${eq.lat.toFixed(5)}, ${eq.lon.toFixed(5)} (~${distanceKm.toFixed(0)} km)`,
        `Olay: ${eq.event_key}`,
        'Bu mesaj DepremAnaliz tarafindan otomatik olusturuldu.',
      ].join('\n');

    let cachedLocation: { lat: number; lon: number; fetchedAt: number } | null = null;

    const getCurrentPosition = async () => {
      const nowMs = Date.now();
      if (cachedLocation && nowMs - cachedLocation.fetchedAt <= LOCATION_CACHE_MS) {
        return cachedLocation;
      }

      const result = await getSafeDeviceLocation({ requestPermission: false, allowLastKnown: true });
      if (!result.ok) return null;

      cachedLocation = {
        lat: result.lat,
        lon: result.lon,
        fetchedAt: nowMs,
      };
      return cachedLocation;
    };

    const tick = async () => {
      if (AppState.currentState !== 'active') return;
      if (running.current) return;
      running.current = true;

      try {
        if (token) {
          await flushOfflineRelayQueue(apiBase, token);
        }

        const position = await getCurrentPosition();
        if (!position) return;
        const lat = position.lat;
        const lon = position.lon;
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

          if (sharedEvents.current[eq.event_key]) {
            continue;
          }

          const alertPayload = {
            lat,
            lon,
            magnitude: eq.mag,
            epicenter_lat: eq.lat,
            epicenter_lon: eq.lon,
            event_key: eq.event_key,
          };
          const sendResult = await sendLocationAlert(base, token, alertPayload);

          if (sendResult.ok && (sendResult.sent === true || sendResult.reason === 'already_sent')) {
            sharedEvents.current[eq.event_key] = true;
            continue;
          }

          const relayText = buildRelayText(lat, lon, eq, distanceKm);
          if (relayEmergencyText) {
            await relayEmergencyText(relayText, emergencyContact);
          }

          if (sendResult.retryable) {
            await queueOfflineRelayPacket({
              toUsername: emergencyContact,
              body: relayText,
              kind: 'location_alert',
              locationAlertPayload: alertPayload,
            });
            sharedEvents.current[eq.event_key] = true;
          }
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
    appStateSub = AppState.addEventListener('change', (state) => {
      if (cancelled) return;
      if (state === 'active') {
        void tick();
      }
    });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      appStateSub?.remove();
    };
  }, [apiBase, emergencyContact, preferences, relayEmergencyText, token]);
}
