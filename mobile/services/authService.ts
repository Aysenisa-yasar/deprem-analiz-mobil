import { requestJson, resolveApiErrorMessage, responseData } from '@/services/apiClient';
import type { MobileUser, OtpStartResult, SupabaseExchangeResult } from '@/services/types';

function base(baseUrl: string) {
  return baseUrl.replace(/\/$/, '');
}

export type MeResult = {
  user: MobileUser | null;
  unauthorized: boolean;
};

export async function loginRequest(baseUrl: string, username: string, password: string) {
  const result = await requestJson<{ token?: string; message?: string }>(
    `${base(baseUrl)}/api/mobile/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }
  );
  const payload = responseData(result.data);
  if (!result.ok) {
    return { ok: false, message: resolveApiErrorMessage(result, 'Ag veya sunucu hatasi') };
  }
  if (!payload?.token) return { ok: false, message: payload?.message || 'Giris basarisiz' };
  return { ok: true, token: payload.token };
}

export async function registerRequest(baseUrl: string, username: string, password: string) {
  return { ok: false, message: 'Kayit icin e-posta dogrulama akisi kullanilmali.' };
}

export async function requestRegisterCode(
  baseUrl: string,
  username: string,
  email: string,
  password: string
) {
  const result = await requestJson<{
    status?: string;
    message?: string;
    channel?: string;
    target?: string;
    expires_in_sec?: number;
    debug_code?: string;
  }>(`${base(baseUrl)}/api/mobile/register/request-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
  const payload = responseData(result.data);
  if (!result.ok || !payload) {
    return {
      ok: false,
      message: resolveApiErrorMessage(result, 'Kayit kodu gonderilemedi'),
    };
  }
  return {
    ok: payload.status === 'ok',
    message: payload.message,
    channel: payload.channel,
    target: payload.target,
    expiresInSec: payload.expires_in_sec,
    debugCode: payload.debug_code,
  };
}

export async function confirmRegister(baseUrl: string, email: string, code: string) {
  const result = await requestJson<{ token?: string; username?: string; message?: string }>(
    `${base(baseUrl)}/api/mobile/register`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    }
  );
  const payload = responseData(result.data);
  if (!result.ok) {
    return { ok: false, message: resolveApiErrorMessage(result, 'Ag veya sunucu hatasi') };
  }
  if (!payload?.token) return { ok: false, message: payload?.message || 'Kayit basarisiz' };
  return { ok: true, token: payload.token, username: payload.username };
}

export async function requestLoginCode(baseUrl: string, target: string): Promise<OtpStartResult> {
  const result = await requestJson<{
    status?: string;
    message?: string;
    channel?: string;
    target?: string;
    expires_in_sec?: number;
    debug_code?: string;
  }>(`${base(baseUrl)}/api/mobile/auth/request-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target }),
  });
  const payload = responseData(result.data);
  if (!result.ok || !payload) {
    return { ok: false, message: resolveApiErrorMessage(result, 'Kod gonderilemedi') };
  }
  return {
    ok: payload.status === 'ok',
    message: payload.message,
    channel: payload.channel,
    target: payload.target,
    expiresInSec: payload.expires_in_sec,
    debugCode: payload.debug_code,
  };
}

export async function requestPasswordReset(baseUrl: string, target: string): Promise<OtpStartResult> {
  const result = await requestJson<{
    status?: string;
    message?: string;
    channel?: string;
    target?: string;
    expires_in_sec?: number;
    debug_code?: string;
  }>(`${base(baseUrl)}/api/mobile/auth/reset-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target }),
  });
  const payload = responseData(result.data);
  if (!result.ok || !payload) {
    return { ok: false, message: resolveApiErrorMessage(result, 'Kod gonderilemedi') };
  }
  return {
    ok: payload.status === 'ok',
    message: payload.message,
    channel: payload.channel,
    target: payload.target,
    expiresInSec: payload.expires_in_sec,
    debugCode: payload.debug_code,
  };
}

export async function verifyLoginCode(baseUrl: string, target: string, code: string) {
  const result = await requestJson<{
    status?: string;
    token?: string;
    username?: string;
    message?: string;
  }>(`${base(baseUrl)}/api/mobile/auth/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, code }),
  });
  const payload = responseData(result.data);
  if (!result.ok || !payload || payload.status !== 'ok' || !payload.token) {
    return { ok: false, message: resolveApiErrorMessage(result, 'Kod dogrulanamadi') };
  }
  return { ok: true, token: payload.token, username: payload.username };
}

export async function confirmPasswordReset(
  baseUrl: string,
  target: string,
  code: string,
  newPassword: string
) {
  const result = await requestJson<{
    status?: string;
    token?: string;
    username?: string;
    message?: string;
  }>(`${base(baseUrl)}/api/mobile/auth/reset-confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, code, new_password: newPassword }),
  });
  const payload = responseData(result.data);
  if (!result.ok || !payload || payload.status !== 'ok' || !payload.token) {
    return { ok: false, message: resolveApiErrorMessage(result, 'Sifre sifirlanamadi') };
  }
  return { ok: true, token: payload.token, username: payload.username };
}

export async function exchangeSupabaseSession(
  baseUrl: string,
  accessToken: string
): Promise<SupabaseExchangeResult> {
  const result = await requestJson<{
    status?: string;
    token?: string;
    username?: string;
    message?: string;
  }>(`${base(baseUrl)}/api/mobile/auth/supabase-exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken }),
  });
  const payload = responseData(result.data);
  if (!result.ok || !payload || payload.status !== 'ok' || !payload.token) {
    return {
      ok: false,
      message: resolveApiErrorMessage(result, 'Supabase oturumu senkronize edilemedi'),
    };
  }
  return { ok: true, token: payload.token, username: payload.username };
}

export async function fetchMe(baseUrl: string, token: string): Promise<MeResult> {
  const { ok, status, data } = await requestJson<{
    status?: string;
    username?: string;
    emergency_contact?: string | null;
    phone?: string | null;
    email?: string | null;
    auth_channel?: string | null;
    settings?: Record<string, unknown>;
  }>(`${base(baseUrl)}/api/mobile/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = responseData(data);
  if (status === 401) return { user: null, unauthorized: true };
  if (!ok || !payload || payload.status !== 'ok' || !payload.username) {
    return { user: null, unauthorized: false };
  }
  return {
    user: {
      username: payload.username,
      emergency_contact: payload.emergency_contact ?? null,
      phone: payload.phone ?? null,
      email: payload.email ?? null,
      auth_channel: payload.auth_channel ?? 'password',
      settings: payload.settings ?? null,
    },
    unauthorized: false,
  };
}

export async function logoutRequest(baseUrl: string, token: string) {
  const { ok, data } = await requestJson<{ status?: string; message?: string }>(
    `${base(baseUrl)}/api/mobile/logout`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const payload = responseData(data);
  return { ok: ok && payload?.status === 'ok', message: payload?.message };
}

export async function setEmergencyContact(baseUrl: string, token: string, contactUsername: string) {
  const { ok, data } = await requestJson<{ message?: string; status?: string }>(
    `${base(baseUrl)}/api/mobile/emergency-contact`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ contact_username: contactUsername }),
    }
  );
  const payload = responseData(data);
  if (!ok || !payload || payload.status !== 'ok') {
    return { ok: false, message: payload?.message || 'Kaydedilemedi' };
  }
  return { ok: true };
}

export async function fetchUserSettings(baseUrl: string, token: string) {
  const { ok, data } = await requestJson<{ status?: string; settings?: Record<string, unknown> }>(
    `${base(baseUrl)}/api/mobile/settings`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const payload = responseData(data);
  return ok && payload?.status === 'ok' ? payload.settings ?? {} : {};
}

export async function updateUserSettings(
  baseUrl: string,
  token: string,
  payload: Record<string, unknown>
) {
  const { ok, data } = await requestJson<{ status?: string; settings?: Record<string, unknown>; message?: string }>(
    `${base(baseUrl)}/api/mobile/settings`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    }
  );
  const body = responseData(data);
  return { ok: ok && body?.status === 'ok', settings: body?.settings ?? {}, message: body?.message };
}

export async function registerDevice(
  baseUrl: string,
  token: string,
  payload: { device_id: string; platform?: string; push_token?: string; app_version?: string }
) {
  const { ok, data } = await requestJson<{ status?: string; device?: Record<string, unknown>; message?: string }>(
    `${base(baseUrl)}/api/mobile/devices`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    }
  );
  const body = responseData(data);
  return { ok: ok && body?.status === 'ok', device: body?.device ?? null, message: body?.message };
}
