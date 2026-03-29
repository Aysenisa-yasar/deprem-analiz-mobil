export type ModelHealth = {
  available: boolean;
  quality_level: string;
  quality_label: string;
  quality_score: number;
  trained_at?: string | null;
  model_type?: string;
  summary?: string;
  signal_event_count?: number;
  metrics?: {
    roc_auc_mean?: number | null;
    pr_auc_mean?: number | null;
    brier_mean?: number | null;
    samples?: number;
    positive_rate?: number | null;
    folds?: number;
  };
  backtest?: {
    hit_rate?: number | null;
    positive_rate?: number | null;
    samples?: number;
    threshold?: number | null;
    mean_prob?: number | null;
  };
};

export type ForecastPoint = {
  city: string;
  lat: number;
  lon: number;
  risk_score: number;
  probability: number;
  risk_level: string;
  m5_72h_probability?: number;
  max_mag_7d_prediction?: number;
  signal_event_count?: number;
  fault_distance?: number;
  model_health?: ModelHealth;
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
  delivered_at?: number | null;
  read_at?: number | null;
};

export type MobileUser = {
  username: string;
  emergency_contact: string | null;
  phone?: string | null;
  email?: string | null;
  auth_channel?: string | null;
};

export type OtpStartResult = {
  ok: boolean;
  message?: string;
  channel?: string;
  target?: string;
  expiresInSec?: number;
  debugCode?: string;
};

export type ChatbotReply = {
  response: string;
  session_id?: string;
};

export type SupabaseExchangeResult = {
  ok: boolean;
  token?: string;
  username?: string;
  message?: string;
};

async function fetchJson<T>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: T | null }> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    return { ok: false, status: 0, data: null };
  }

  let data: T | null = null;
  try {
    const text = await response.text();
    if (text) data = JSON.parse(text) as T;
  } catch {
    data = null;
  }
  return { ok: response.ok, status: response.status, data };
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

export async function fetchForecastLocation(
  baseUrl: string,
  lat: number,
  lon: number
): Promise<{ point: ForecastPoint | null; modelHealth: ModelHealth | null }> {
  const base = baseUrl.replace(/\/$/, '');
  const { ok, data } = await fetchJson<{
    status?: string;
    point?: ForecastPoint;
    model_health?: ModelHealth;
  }>(`${base}/api/v2/forecast-location?lat=${lat}&lon=${lon}`);
  if (!ok || !data || data.status !== 'success') {
    if (!ok) throw new Error('network');
    return { point: null, modelHealth: null };
  }
  return {
    point: data.point ?? null,
    modelHealth: data.model_health ?? null,
  };
}

export async function fetchForecastModelStatus(
  baseUrl: string
): Promise<ModelHealth | null> {
  const base = baseUrl.replace(/\/$/, '');
  const { ok, data } = await fetchJson<{
    status?: string;
    model_health?: ModelHealth;
  }>(`${base}/api/v2/forecast-model-status`);
  if (!ok || !data || data.status !== 'success') {
    if (!ok) throw new Error('network');
    return null;
  }
  return data.model_health ?? null;
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
  if (!ok) {
    return { ok: false, message: data?.message || 'Ag veya sunucu hatasi' };
  }
  if (!data?.token) {
    return { ok: false, message: data?.message || 'Giris basarisiz' };
  }
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
  if (!ok) {
    return { ok: false, message: data?.message || 'Ag veya sunucu hatasi' };
  }
  if (!data?.token) {
    return { ok: false, message: data?.message || 'Kayit basarisiz' };
  }
  return { ok: true, token: data.token };
}

export async function requestLoginCode(
  baseUrl: string,
  target: string
): Promise<OtpStartResult> {
  const base = baseUrl.replace(/\/$/, '');
  const { ok, data } = await fetchJson<{
    status?: string;
    message?: string;
    channel?: string;
    target?: string;
    expires_in_sec?: number;
    debug_code?: string;
  }>(`${base}/api/mobile/auth/request-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target }),
  });
  if (!ok || !data) {
    return { ok: false, message: data?.message || 'Kod gonderilemedi' };
  }
  return {
    ok: data.status === 'ok',
    message: data.message,
    channel: data.channel,
    target: data.target,
    expiresInSec: data.expires_in_sec,
    debugCode: data.debug_code,
  };
}

export async function verifyLoginCode(
  baseUrl: string,
  target: string,
  code: string
): Promise<{ ok: boolean; token?: string; username?: string; message?: string }> {
  const base = baseUrl.replace(/\/$/, '');
  const { ok, data } = await fetchJson<{
    status?: string;
    token?: string;
    username?: string;
    message?: string;
  }>(`${base}/api/mobile/auth/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, code }),
  });
  if (!ok || !data || data.status !== 'ok' || !data.token) {
    return { ok: false, message: data?.message || 'Kod dogrulanamadi' };
  }
  return { ok: true, token: data.token, username: data.username };
}

export async function exchangeSupabaseSession(
  baseUrl: string,
  accessToken: string
): Promise<SupabaseExchangeResult> {
  const base = baseUrl.replace(/\/$/, '');
  const { ok, data } = await fetchJson<{
    status?: string;
    token?: string;
    username?: string;
    message?: string;
  }>(`${base}/api/mobile/auth/supabase-exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken }),
  });

  if (!ok || !data || data.status !== 'ok' || !data.token) {
    return { ok: false, message: data?.message || 'Supabase oturumu senkronize edilemedi' };
  }

  return { ok: true, token: data.token, username: data.username };
}

export type MeResult = {
  user: MobileUser | null;
  unauthorized: boolean;
};

export async function fetchMe(baseUrl: string, token: string): Promise<MeResult> {
  const base = baseUrl.replace(/\/$/, '');
  const { ok, status, data } = await fetchJson<{
    status?: string;
    username?: string;
    emergency_contact?: string | null;
    phone?: string | null;
    email?: string | null;
    auth_channel?: string | null;
  }>(`${base}/api/mobile/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (status === 401) {
    return { user: null, unauthorized: true };
  }
  if (!ok || !data || data.status !== 'ok' || !data.username) {
    return { user: null, unauthorized: false };
  }
  return {
    user: {
      username: data.username,
      emergency_contact: data.emergency_contact ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      auth_channel: data.auth_channel ?? 'password',
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
  if (!ok || !data || data.status !== 'ok') {
    return { ok: false, message: data?.message || 'Kaydedilemedi' };
  }
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
): Promise<{ ok: boolean; message?: string; retryable?: boolean }> {
  const base = baseUrl.replace(/\/$/, '');
  const { ok, status, data } = await fetchJson<{ message?: string; status?: string }>(
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
  if (!ok || !data || data.status !== 'ok') {
    return {
      ok: false,
      message: data?.message || 'Gonderilemedi',
      retryable: status === 0 || status >= 500,
    };
  }
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
    body: JSON.stringify(payload),
  });
  if (!ok || !data) return { ok: false };
  return { ok: true, sent: data.sent, reason: data.reason };
}

export async function askChatbot(
  baseUrl: string,
  message: string,
  sessionId: string
): Promise<{ ok: boolean; reply?: string; message?: string }> {
  const base = baseUrl.replace(/\/$/, '');
  const { ok, data } = await fetchJson<ChatbotReply>(`${base}/api/chatbot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId }),
  });
  if (!ok || !data?.response) {
    return { ok: false, message: 'Asistan yaniti alinamadi' };
  }
  return { ok: true, reply: data.response };
}
