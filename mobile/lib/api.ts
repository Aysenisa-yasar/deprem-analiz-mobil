export type ForecastPoint = {
  city: string;
  lat: number;
  lon: number;
  risk_score: number;
  probability: number;
  risk_level: string;
  m5_72h_probability?: number;
  max_mag_7d_prediction?: number;
};

export type QuakeEvent = {
  lat: number;
  lon: number;
  mag: number;
  depth: number;
  timestamp: number;
  event_key: string;
};

export type ChatMessage = {
  id: number;
  from_user: string;
  to_user: string;
  body: string;
  kind: string;
  created_at: number;
};

async function fetchJson<T>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T | null }> {
  let r: Response;
  try {
    r = await fetch(url, init);
  } catch {
    return { ok: false, status: 0, data: null };
  }
  let data: T | null = null;
  try {
    const text = await r.text();
    if (text) data = JSON.parse(text) as T;
  } catch {
    data = null;
  }
  return { ok: r.ok, status: r.status, data };
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export async function fetchForecastMap(baseUrl: string): Promise<ForecastPoint[]> {
  const base = baseUrl.replace(/\/$/, '');
  const { ok, data } = await fetchJson<{
    status?: string;
    points?: ForecastPoint[];
  }>(`${base}/api/v2/forecast-map`);
  if (!ok || !data || data.status !== 'success' || !Array.isArray(data.points)) {
    if (!ok) throw new Error('network');
    return [];
  }
  return data.points;
}

export async function fetchRecentQuakes(
  baseUrl: string,
  limit = 80
): Promise<QuakeEvent[]> {
  const base = baseUrl.replace(/\/$/, '');
  const { ok, data } = await fetchJson<{
    status?: string;
    events?: QuakeEvent[];
  }>(`${base}/api/v2/recent-earthquakes?limit=${limit}`);
  if (!ok || !data?.events || !Array.isArray(data.events)) return [];
  if (data.status !== 'success') return [];
  return data.events;
}

export async function loginRequest(
  baseUrl: string,
  username: string,
  password: string
): Promise<{ ok: boolean; token?: string; message?: string }> {
  const base = baseUrl.replace(/\/$/, '');
  const { ok, data } = await fetchJson<{ token?: string; message?: string }>(
    `${base}/api/mobile/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }
  );
  if (!ok)
    return {
      ok: false,
      message: data?.message || 'Ağ veya sunucu hatası',
    };
  if (!data?.token)
    return { ok: false, message: data?.message || 'Giriş başarısız' };
  return { ok: true, token: data.token };
}

export async function registerRequest(
  baseUrl: string,
  username: string,
  password: string
): Promise<{ ok: boolean; token?: string; message?: string }> {
  const base = baseUrl.replace(/\/$/, '');
  const { ok, data } = await fetchJson<{ token?: string; message?: string }>(
    `${base}/api/mobile/register`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }
  );
  if (!ok)
    return {
      ok: false,
      message: data?.message || 'Ağ veya sunucu hatası',
    };
  if (!data?.token)
    return { ok: false, message: data?.message || 'Kayıt başarısız' };
  return { ok: true, token: data.token };
}

export type MeResult = {
  user: { username: string; emergency_contact: string | null } | null;
  /** Sunucu jetonu reddetti — oturumu kapat */
  unauthorized: boolean;
};

export async function fetchMe(baseUrl: string, token: string): Promise<MeResult> {
  const base = baseUrl.replace(/\/$/, '');
  const { ok, status, data } = await fetchJson<{
    status?: string;
    username?: string;
    emergency_contact?: string | null;
  }>(`${base}/api/mobile/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (status === 401)
    return { user: null, unauthorized: true };
  if (!ok || !data || data.status !== 'ok' || !data.username)
    return { user: null, unauthorized: false };
  return {
    user: {
      username: data.username,
      emergency_contact: data.emergency_contact ?? null,
    },
    unauthorized: false,
  };
}

export async function setEmergencyContact(
  baseUrl: string,
  token: string,
  contactUsername: string
): Promise<{ ok: boolean; message?: string }> {
  const base = baseUrl.replace(/\/$/, '');
  const { ok, data } = await fetchJson<{ message?: string; status?: string }>(
    `${base}/api/mobile/emergency-contact`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ contact_username: contactUsername }),
    }
  );
  if (!ok || !data || data.status !== 'ok')
    return { ok: false, message: data?.message || 'Kaydedilemedi' };
  return { ok: true };
}

export async function fetchMessages(
  baseUrl: string,
  token: string,
  sinceId = 0
): Promise<ChatMessage[]> {
  const base = baseUrl.replace(/\/$/, '');
  const { ok, data } = await fetchJson<{
    status?: string;
    messages?: ChatMessage[];
  }>(`${base}/api/mobile/messages?since_id=${sinceId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!ok || !data?.messages || !Array.isArray(data.messages)) return [];
  if (data.status !== 'ok') return [];
  return data.messages;
}

export async function sendMessage(
  baseUrl: string,
  token: string,
  toUsername: string,
  body: string
): Promise<{ ok: boolean; message?: string }> {
  const base = baseUrl.replace(/\/$/, '');
  const { ok, data } = await fetchJson<{ message?: string; status?: string }>(
    `${base}/api/mobile/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to_username: toUsername, body }),
    }
  );
  if (!ok || !data || data.status !== 'ok')
    return { ok: false, message: data?.message || 'Gönderilemedi' };
  return { ok: true };
}

export async function sendLocationAlert(
  baseUrl: string,
  token: string,
  payload: {
    lat: number;
    lon: number;
    magnitude: number;
    epicenter_lat: number;
    epicenter_lon: number;
    event_key: string;
  }
): Promise<{ ok: boolean; sent?: boolean; reason?: string }> {
  const base = baseUrl.replace(/\/$/, '');
  const { ok, data } = await fetchJson<{
    sent?: boolean;
    reason?: string;
    status?: string;
  }>(`${base}/api/mobile/location-alert`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      lat: payload.lat,
      lon: payload.lon,
      magnitude: payload.magnitude,
      epicenter_lat: payload.epicenter_lat,
      epicenter_lon: payload.epicenter_lon,
      event_key: payload.event_key,
    }),
  });
  if (!ok || !data) return { ok: false };
  return { ok: true, sent: data.sent, reason: data.reason };
}
