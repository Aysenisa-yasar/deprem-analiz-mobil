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

const KANDILLI_LIVE_FEED = 'https://api.orhanaydogdu.com.tr/deprem/kandilli/live';
const USGS_TURKEY_DAY_FEED =
  'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&orderby=time&limit=200&minlatitude=35&maxlatitude=43&minlongitude=25&maxlongitude=46';

type ForecastMapEnvelope = {
  status?: string;
  points?: ForecastPoint[];
  model_health?: ModelHealth;
  warning_capability?: WarningCapability;
};

type ForecastLocationCache = {
  point: ForecastPoint | null;
  modelHealth: ModelHealth | null;
  warningCapability: WarningCapability | null;
};

type ModelStatusCache = {
  modelHealth: ModelHealth | null;
  warningCapability: WarningCapability | null;
};

type UsgsFeature = {
  geometry?: { coordinates?: number[] };
  properties?: { mag?: number | null; place?: string | null; time?: number | null };
  id?: string;
};

type KandilliEvent = {
  earthquake_id?: string;
  title?: string;
  mag?: number | null;
  depth?: number | null;
  created_at?: number | null;
  date_time?: string | null;
  geojson?: { coordinates?: number[] };
};

type KandilliResponse = {
  status?: boolean;
  result?: KandilliEvent[];
};

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

function buildModelStatusSnapshot(
  payload: Pick<ForecastMapEnvelope, 'model_health' | 'warning_capability'> | null | undefined
): ModelStatusCache | null {
  if (!payload?.model_health && !payload?.warning_capability) {
    return null;
  }
  return {
    modelHealth: payload.model_health ?? null,
    warningCapability: payload.warning_capability ?? null,
  };
}

async function fetchForecastMapEnvelope(baseUrl: string) {
  const result = await requestJson<ForecastMapEnvelope>(
    `${base(baseUrl)}/api/v2/forecast-map`,
    undefined,
    26000
  );
  return {
    ok: result.ok,
    payload: responseData(result.data),
  };
}

function nearestForecastPoint(points: ForecastPoint[], lat: number, lon: number): ForecastPoint | null {
  let winner: ForecastPoint | null = null;
  let winnerDistance = Number.POSITIVE_INFINITY;

  for (const point of points) {
    const distance = haversineKm(lat, lon, point.lat, point.lon);
    if (distance >= winnerDistance) continue;
    winner = point;
    winnerDistance = distance;
  }

  return winner;
}

function mapUsgsFeature(feature: UsgsFeature): QuakeEvent | null {
  const coordinates = feature.geometry?.coordinates;
  if (!coordinates || coordinates.length < 2) return null;

  const lon = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  const depth = coordinates.length > 2 ? Number(coordinates[2]) : 10;
  const mag = Number(feature.properties?.mag ?? 0);
  const rawTimestamp = Number(feature.properties?.time ?? 0);
  const timestamp = rawTimestamp > 1e12 ? rawTimestamp / 1000 : rawTimestamp;

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }

  return {
    lat,
    lon,
    mag: Number.isFinite(mag) ? mag : 0,
    depth: Number.isFinite(depth) ? depth : 10,
    timestamp,
    event_key: feature.id || `${lat.toFixed(4)}_${lon.toFixed(4)}_${Math.trunc(timestamp)}`,
    place: feature.properties?.place ?? undefined,
    source: 'usgs_direct',
  };
}

function parseKandilliTimestamp(event: KandilliEvent): number {
  const raw = Number(event.created_at ?? 0);
  if (Number.isFinite(raw) && raw > 0) {
    return raw > 1e12 ? raw / 1000 : raw;
  }

  const dateText = String(event.date_time ?? '').trim();
  if (!dateText) return 0;

  const parsed = Date.parse(dateText.replace(' ', 'T'));
  return Number.isFinite(parsed) ? parsed / 1000 : 0;
}

function mapKandilliEvent(event: KandilliEvent): QuakeEvent | null {
  const coordinates = event.geojson?.coordinates;
  if (!coordinates || coordinates.length < 2) return null;

  const lon = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  const mag = Number(event.mag ?? 0);
  const depth = Number(event.depth ?? 10);
  const timestamp = parseKandilliTimestamp(event);

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }

  return {
    lat,
    lon,
    mag: Number.isFinite(mag) ? mag : 0,
    depth: Number.isFinite(depth) ? depth : 10,
    timestamp,
    event_key:
      event.earthquake_id || `${lat.toFixed(4)}_${lon.toFixed(4)}_${Math.trunc(timestamp)}`,
    place: event.title ?? undefined,
    source: 'kandilli_live',
  };
}

async function fetchKandilliRecentQuakes(limit: number): Promise<QuakeEvent[]> {
  const result = await requestJson<KandilliResponse>(KANDILLI_LIVE_FEED, undefined, 18000);

  if (!result.ok || !Array.isArray(result.data?.result)) {
    return [];
  }

  return result.data.result
    .map(mapKandilliEvent)
    .filter((item): item is QuakeEvent => Boolean(item))
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, limit);
}

async function fetchUsgsTurkeyQuakes(limit: number): Promise<QuakeEvent[]> {
  const result = await requestJson<{ features?: UsgsFeature[] }>(
    USGS_TURKEY_DAY_FEED,
    undefined,
    18000
  );

  if (!result.ok || !Array.isArray(result.data?.features)) {
    return [];
  }

  return result.data.features
    .map(mapUsgsFeature)
    .filter((item): item is QuakeEvent => Boolean(item))
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, limit);
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
  const { ok, payload } = await fetchForecastMapEnvelope(baseUrl);
  if (payload && isSuccessfulStatus(payload.status) && Array.isArray(payload.points)) {
    await writeCache(CACHE_KEYS.forecastMap, payload.points);
    const snapshot = buildModelStatusSnapshot(payload);
    if (snapshot) {
      await writeCache(CACHE_KEYS.modelStatus, snapshot);
    }
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
  try {
    const points = await fetchForecastMap(baseUrl);
    const nearest = nearestForecastPoint(points, lat, lon);
    if (nearest) {
      const modelStatus = await readCache<ModelStatusCache>(CACHE_KEYS.modelStatus);
      const resolved: ForecastLocationCache = {
        point: {
          ...nearest,
          city: `En yakin tahmin: ${nearest.city}`,
        },
        modelHealth: modelStatus?.modelHealth ?? null,
        warningCapability: modelStatus?.warningCapability ?? null,
      };
      await writeCache(cacheKey, resolved);
      return resolved;
    }
  } catch {
    /* fall through to cache */
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
  try {
    const { ok: mapOk, payload: mapPayload } = await fetchForecastMapEnvelope(baseUrl);
    const snapshot = buildModelStatusSnapshot(mapPayload);
    if (mapOk && snapshot) {
      await writeCache(CACHE_KEYS.modelStatus, snapshot);
      return snapshot;
    }
  } catch {
    /* fall through to cache */
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
  const kandilliFallback = await fetchKandilliRecentQuakes(limit);
  if (kandilliFallback.length) {
    await writeCache(CACHE_KEYS.recentQuakes, kandilliFallback);
    return kandilliFallback;
  }
  const officialFallback = await fetchUsgsTurkeyQuakes(limit);
  if (officialFallback.length) {
    await writeCache(CACHE_KEYS.recentQuakes, officialFallback);
    return officialFallback;
  }
  const cached = await readCache<QuakeEvent[]>(CACHE_KEYS.recentQuakes);
  if (cached?.length) return cached;
  if (!ok) throw new Error('network');
  return [];
}
