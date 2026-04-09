import { requestJson, responseData } from '@/services/apiClient';
import type { ChatbotReply } from '@/services/types';

function base(baseUrl: string) {
  return baseUrl.replace(/\/$/, '');
}

export async function askChatbot(baseUrl: string, message: string, sessionId: string) {
  const { ok, data } = await requestJson<ChatbotReply>(`${base(baseUrl)}/api/chatbot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId }),
  });
  const payload = responseData(data);
  if (!ok || !payload?.response) {
    return { ok: false, message: 'Asistan yaniti alinamadi' };
  }
  return { ok: true, reply: payload.response };
}
