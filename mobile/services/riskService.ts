import AsyncStorage from '@react-native-async-storage/async-storage';

import { requestJson, responseData } from '@/services/apiClient';
import type {
  ForecastGridPoint,
  ForecastPoint,
  ModelHealth,
  QuakeEvent,
  WarningCapability,
} from '@/services/types';

function base(baseUrl: string) {
  return baseUrl.replace(/\/$/, '');
}

const CACHE_KEYS = {
  forecastMap: 'da_risk_forecast_map_v1',
  forecastGrid: 'da_risk_forecast_grid_v1',
  modelStatus: 'da_risk_model_status_v1',
  recentQuakes: 'da_risk_recent_quakes_v1',
} as const;

function isSuccessfulStatus(status?: string | null) {
  return status === 'success' || status === 'degraded';
}

async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeCache<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* cache best-effort */
  }
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const radius = 6371;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(a)));
}

export async function fetchForecastMap(baseUrl: string): Promise<ForecastPoint[]> {
  const { ok, data } = await requestJson<{ status?: string; points?: ForecastPoint[] }>(
    `${base(baseUrl)}/api/v2/forecast-map`,
    undefined,
    26000
  );
  const payload = responseData(data);
  if (payload && isSuccessfulStatus(payload.status) && Array.isArray(payload.points)) {
    await writeCache(CACHE_KEYS.forecastMap, payload.points);
    return payload.points;
  }
  const cached = await readCache<ForecastPoint[]>(CACHE_KEYS.forecastMap);
  if (cached?.length) return cached;
  if (!ok) throw new Error('network');
  return [];
}

export async function fetchForecastGrid(baseUrl: string, hours = 24): Promise<ForecastGridPoint[]> {
  const { ok, data } = await requestJson<{ status?: string; points?: ForecastGridPoint[] }>(
    `${base(baseUrl)}/api/v2/forecast-grid?hours=${hours}`,
    undefined,
    26000
  );
  const payload = responseData(data);
  if (payload && isSuccessfulStatus(payload.status) && Array.isArray(payload.points)) {
    await writeCache(CACHE_KEYS.forecastGrid, payload.points);
    return payload.points;
  }
  const cached = await readCache<ForecastGridPoint[]>(CACHE_KEYS.forecastGrid);
  if (cached?.length) return cached;
  if (!ok) throw new Error('network');
  return [];
}

export async function fetchForecastLocation(baseUrl: string, lat: number, lon: number) {
  const cacheKey = `da_risk_forecast_location_v1:${lat.toFixed(3)}:${lon.toFixed(3)}`;
  const { ok, data } = await requestJson<{
    status?: string;
    point?: ForecastPoint;
    model_health?: ModelHealth;
    warning_capability?: WarningCapability;
  }>(`${base(baseUrl)}/api/v2/forecast-location?lat=${lat}&lon=${lon}`, undefined, 22000);
  const payload = responseData(data);
  if (payload && isSuccessfulStatus(payload.status)) {
    const resolved = {
      point: payload.point ?? null,
      modelHealth: payload.model_health ?? null,
      warningCapability: payload.warning_capability ?? null,
    };
    await writeCache(cacheKey, resolved);
    return resolved;
  }
  const cached = await readCache<{
    point: ForecastPoint | null;
    modelHealth: ModelHealth | null;
    warningCapability: WarningCapability | null;
  }>(cacheKey);
  if (cached) return cached;
  if (!ok) throw new Error('network');
  return { point: null, modelHealth: null, warningCapability: null };
}

export async function fetchForecastModelStatus(baseUrl: string) {
  const { ok, data } = await requestJson<{
    status?: string;
    model_health?: ModelHealth;
    warning_capability?: WarningCapability;
  }>(`${base(baseUrl)}/api/v2/forecast-model-status`, undefined, 18000);
  const payload = responseData(data);
  if (payload && isSuccessfulStatus(payload.status)) {
    const resolved = {
      modelHealth: payload.model_health ?? null,
      warningCapability: payload.warning_capability ?? null,
    };
    await writeCache(CACHE_KEYS.modelStatus, resolved);
    return resolved;
  }
  const cached = await readCache<{
    modelHealth: ModelHealth | null;
    warningCapability: WarningCapability | null;
  }>(CACHE_KEYS.modelStatus);
  if (cached) return cached;
  if (!ok) throw new Error('network');
  return { modelHealth: null, warningCapability: null };
}

export async function fetchRecentQuakes(baseUrl: string, limit = 80): Promise<QuakeEvent[]> {
  const { ok, data } = await requestJson<{ status?: string; events?: QuakeEvent[] }>(
    `${base(baseUrl)}/api/v2/recent-earthquakes?limit=${limit}`,
    undefined,
    26000
  );
  const payload = responseData(data);
  if (payload?.events && Array.isArray(payload.events) && isSuccessfulStatus(payload.status)) {
    await writeCache(CACHE_KEYS.recentQuakes, payload.events);
    return payload.events;
  }
  const cached = await readCache<QuakeEvent[]>(CACHE_KEYS.recentQuakes);
  if (cached?.length) return cached;
  if (!ok) throw new Error('network');
  return [];
}
