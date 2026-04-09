import { requestJson, responseData } from '@/services/apiClient';

function base(baseUrl: string) {
  return baseUrl.replace(/\/$/, '');
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
) {
  const { ok, status, data } = await requestJson<{
    sent?: boolean;
    reason?: string;
    message?: string;
    status?: string;
  }>(`${base(baseUrl)}/api/mobile/location-alert`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const body = responseData(data);
  if (!ok || !body) {
    return {
      ok: false,
      retryable: status === 0 || status >= 500,
      message: body?.message || 'Konum uyarisi gonderilemedi',
    };
  }
  return { ok: true, sent: body.sent, reason: body.reason, message: body.message };
}
