export type ApiResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
};

export type ApiEnvelope<T> = {
  success?: boolean;
  status?: string;
  message?: string;
  data?: T;
} & T;

const NETWORK_ERROR_MESSAGE =
  'Sunucuya ulasilamadi. API adresini, backend durumunu ve internet baglantisini kontrol et.';

function base(baseUrl: string): string {
  return baseUrl.trim().replace(/\/$/, '');
}

function payloadMessage<T>(payload: ApiEnvelope<T> | null | undefined): string | null {
  if (!payload || typeof payload.message !== 'string') return null;
  return payload.message.trim() || null;
}

export async function requestJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs = 12000
): Promise<ApiResult<ApiEnvelope<T>>> {
  let response: Response;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId =
    controller != null ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

  try {
    response = await fetch(url, controller ? { ...init, signal: controller.signal } : init);
  } catch {
    if (timeoutId) clearTimeout(timeoutId);
    return { ok: false, status: 0, data: null };
  }
  if (timeoutId) clearTimeout(timeoutId);

  let data: ApiEnvelope<T> | null = null;
  try {
    const text = await response.text();
    if (text) data = JSON.parse(text) as ApiEnvelope<T>;
  } catch {
    data = null;
  }
  return { ok: response.ok, status: response.status, data };
}

export function responseData<T extends object>(payload: ApiEnvelope<T> | null | undefined): T | null {
  if (!payload) return null;
  const nested = payload.data;
  if (nested && typeof nested === 'object') {
    return { ...nested, ...payload } as T;
  }
  return payload as T;
}

export function resolveApiErrorMessage<T>(
  result: ApiResult<ApiEnvelope<T>>,
  fallbackMessage: string
): string {
  const message = payloadMessage(result.data);
  const normalized = message?.toLowerCase();

  if (
    result.status === 0 ||
    result.status === 599 ||
    normalized?.includes('network request failed') ||
    normalized?.includes('failed to fetch')
  ) {
    return NETWORK_ERROR_MESSAGE;
  }

  return message || fallbackMessage;
}

export async function probeApiHealth(baseUrl: string, timeoutMs = 3200): Promise<boolean> {
  const normalizedBase = base(baseUrl);
  if (!normalizedBase) return false;

  const result = await requestJson<{ status?: string }>(
    `${normalizedBase}/api/health`,
    undefined,
    timeoutMs
  );
  const payload = responseData(result.data);
  return result.ok && (payload?.status === 'ok' || payload?.status === 'degraded');
}
