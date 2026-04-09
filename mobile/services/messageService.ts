import { requestJson, responseData } from '@/services/apiClient';
import type { ChatMessage } from '@/services/types';

function base(baseUrl: string) {
  return baseUrl.replace(/\/$/, '');
}

export async function fetchMessages(baseUrl: string, token: string, sinceId = 0): Promise<ChatMessage[]> {
  const { ok, data } = await requestJson<{ status?: string; messages?: ChatMessage[] }>(
    `${base(baseUrl)}/api/mobile/messages?since_id=${sinceId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const payload = responseData(data);
  if (!ok || !payload?.messages || !Array.isArray(payload.messages)) return [];
  if (payload.status !== 'ok') return [];
  return payload.messages;
}

export async function sendMessage(baseUrl: string, token: string, toUsername: string, body: string) {
  const { ok, status, data } = await requestJson<{ message?: string; status?: string }>(
    `${base(baseUrl)}/api/mobile/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to_username: toUsername, body }),
    }
  );
  const payload = responseData(data);
  if (!ok || !payload || payload.status !== 'ok') {
    return {
      ok: false,
      message: payload?.message || 'Gonderilemedi',
      retryable: status === 0 || status >= 500,
    };
  }
  return { ok: true };
}
