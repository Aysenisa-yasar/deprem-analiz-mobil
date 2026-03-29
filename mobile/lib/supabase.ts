import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { AppState, type AppStateStatus } from 'react-native';
import { createClient } from '@supabase/supabase-js';

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, isSupabaseConfigured } from './supabaseConfig';

export { isSupabaseConfigured };

export type AuthTargetKind = 'email' | 'phone' | 'unknown';

export function detectAuthTargetKind(value: string): AuthTargetKind {
  const trimmed = value.trim();
  if (!trimmed) return 'unknown';
  if (trimmed.includes('@')) return 'email';

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length >= 10) return 'phone';
  return 'unknown';
}

export const supabase = createClient(SUPABASE_URL || 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_placeholder', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

let appStateBound = false;

export function bindSupabaseAppState(): void {
  if (appStateBound || !isSupabaseConfigured) return;
  appStateBound = true;

  const sync = (state: AppStateStatus) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
      return;
    }
    void supabase.auth.stopAutoRefresh();
  };

  sync(AppState.currentState);
  AppState.addEventListener('change', sync);
}

export function getSupabaseRedirectUrl(): string {
  return Linking.createURL('/auth/callback');
}

function readSearchParamsFromUrl(url: string): URLSearchParams {
  const hashIndex = url.indexOf('#');
  if (hashIndex >= 0 && hashIndex < url.length - 1) {
    return new URLSearchParams(url.slice(hashIndex + 1));
  }

  const queryIndex = url.indexOf('?');
  if (queryIndex >= 0 && queryIndex < url.length - 1) {
    return new URLSearchParams(url.slice(queryIndex + 1));
  }

  return new URLSearchParams();
}

export async function hydrateSupabaseSessionFromUrl(url: string): Promise<boolean> {
  if (!isSupabaseConfigured || !url) return false;

  const params = readSearchParamsFromUrl(url);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (!accessToken || !refreshToken) {
    return false;
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return !error;
}

export async function requestSupabaseOtp(target: string): Promise<{ ok: boolean; message?: string }> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: 'Supabase ayarlari eksik' };
  }

  const kind = detectAuthTargetKind(target);
  if (kind === 'email') {
    const { error } = await supabase.auth.signInWithOtp({
      email: target.trim(),
      options: { emailRedirectTo: getSupabaseRedirectUrl(), shouldCreateUser: true },
    });
    if (error) return { ok: false, message: error.message };
    return {
      ok: true,
      message: 'E-posta linki veya kodu gonderildi. Baglantiya dokunursan uygulama otomatik giris yapar.',
    };
  }

  if (kind === 'phone') {
    const { error } = await supabase.auth.signInWithOtp({
      phone: target.trim(),
      options: { shouldCreateUser: true },
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: 'SMS dogrulama kodu gonderildi.' };
  }

  return { ok: false, message: 'Telefon numarasi veya e-posta gir.' };
}

export async function verifySupabaseOtp(
  target: string,
  code: string
): Promise<{ ok: boolean; accessToken?: string; message?: string }> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: 'Supabase ayarlari eksik' };
  }

  const kind = detectAuthTargetKind(target);
  if (kind === 'unknown') {
    return { ok: false, message: 'Telefon numarasi veya e-posta gir.' };
  }

  const payload =
    kind === 'email'
      ? { email: target.trim(), token: code.trim(), type: 'email' as const }
      : { phone: target.trim(), token: code.trim(), type: 'sms' as const };

  const { data, error } = await supabase.auth.verifyOtp(payload);
  if (error) return { ok: false, message: error.message };

  const accessToken = data.session?.access_token;
  if (!accessToken) {
    return {
      ok: false,
      message: 'Oturum olusmadi. E-posta magic link kullaniyorsan gelen baglantiya dokun.',
    };
  }

  return { ok: true, accessToken };
}

export async function signInSupabaseWithPassword(
  target: string,
  password: string
): Promise<{ ok: boolean; accessToken?: string; message?: string }> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: 'Supabase ayarlari eksik' };
  }

  const kind = detectAuthTargetKind(target);
  if (kind === 'unknown') {
    return { ok: false, message: 'Telefon numarasi veya e-posta gir.' };
  }

  const { data, error } =
    kind === 'email'
      ? await supabase.auth.signInWithPassword({ email: target.trim(), password })
      : await supabase.auth.signInWithPassword({ phone: target.trim(), password });

  if (error) return { ok: false, message: error.message };
  if (!data.session?.access_token) return { ok: false, message: 'Oturum olusturulamadi' };
  return { ok: true, accessToken: data.session.access_token };
}

export async function signUpSupabaseWithPassword(
  target: string,
  password: string
): Promise<{ ok: boolean; accessToken?: string; message?: string }> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: 'Supabase ayarlari eksik' };
  }

  const kind = detectAuthTargetKind(target);
  if (kind === 'unknown') {
    return { ok: false, message: 'Telefon numarasi veya e-posta gir.' };
  }

  const { data, error } =
    kind === 'email'
      ? await supabase.auth.signUp({
          email: target.trim(),
          password,
          options: { emailRedirectTo: getSupabaseRedirectUrl() },
        })
      : await supabase.auth.signUp({ phone: target.trim(), password });

  if (error) return { ok: false, message: error.message };
  if (!data.session?.access_token) {
    return {
      ok: false,
      message: kind === 'email'
        ? 'Kayit basladi. Gelen e-posta baglantisina dokunduktan sonra uygulama otomatik giris yapacak.'
        : 'Kayit basladi. Gelen SMS kodu veya dogrulama adimi tamamlanmali.',
    };
  }

  return { ok: true, accessToken: data.session.access_token };
}
