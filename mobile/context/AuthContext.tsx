import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { DEFAULT_API_URL } from '@/lib/config';
import { probeApiHealth } from '@/services/apiClient';
import { fetchMe, loginRequest, logoutRequest } from '@/services/authService';
import {
  clearStoredToken,
  getStoredApiBase,
  getStoredToken,
  setStoredApiBase,
  setStoredToken,
} from '@/lib/tokenStorage';

type User = {
  username: string;
  emergency_contact: string | null;
  phone?: string | null;
  email?: string | null;
  auth_channel?: string | null;
};

type AuthContextValue = {
  token: string | null;
  user: User | null;
  apiBase: string;
  ready: boolean;
  setApiBase: (url: string) => Promise<void>;
  login: (u: string, p: string) => Promise<{ ok: boolean; message?: string }>;
  completeLoginWithToken: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeBaseUrl(url?: string | null): string | null {
  const value = url?.trim().replace(/\/$/, '');
  return value ? value : null;
}

function isPrivateHost(host: string): boolean {
  if (host === 'localhost' || host === '127.0.0.1') return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
  const match = host.match(/^172\.(\d+)\.\d+\.\d+$/);
  if (!match) return false;
  const second = Number(match[1]);
  return second >= 16 && second <= 31;
}

function shouldPreferDefaultApiBase(storedUrl?: string | null, defaultUrl?: string | null): boolean {
  const stored = normalizeBaseUrl(storedUrl);
  const fallback = normalizeBaseUrl(defaultUrl);
  if (!stored || !fallback || stored === fallback) return false;

  if (__DEV__) {
    try {
      const fallbackHost = new URL(fallback).hostname;
      if (isPrivateHost(fallbackHost)) return true;
    } catch {
      return false;
    }
  }

  try {
    const storedHost = new URL(stored).hostname;
    return isPrivateHost(storedHost);
  } catch {
    return false;
  }
}

async function resolveStartupApiBase(storedUrl?: string | null, defaultUrl?: string | null) {
  const stored = normalizeBaseUrl(storedUrl);
  const fallback = normalizeBaseUrl(defaultUrl);

  if (!stored) return fallback ?? DEFAULT_API_URL;
  if (!fallback || stored === fallback) return stored;

  const preferFallback = shouldPreferDefaultApiBase(stored, fallback);
  const first = preferFallback ? fallback : stored;
  const second = preferFallback ? stored : fallback;

  if (await probeApiHealth(first, __DEV__ ? 2200 : 3200)) {
    return first;
  }

  if (await probeApiHealth(second, __DEV__ ? 2600 : 3600)) {
    return second;
  }

  return preferFallback ? fallback : stored;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [apiBase, setApiBaseState] = useState(DEFAULT_API_URL);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = normalizeBaseUrl(await getStoredApiBase());
        const fallback = normalizeBaseUrl(DEFAULT_API_URL);
        const nextBase = await resolveStartupApiBase(stored, fallback);
        if (nextBase) {
          setApiBaseState(nextBase);
          if (nextBase !== stored) await setStoredApiBase(nextBase);
        }
        const t = await getStoredToken();
        setToken(t);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const refreshMe = useCallback(async () => {
    const t = await getStoredToken();
    const base = apiBase;
    if (!t) {
      setUser(null);
      return;
    }
    const { user: me, unauthorized } = await fetchMe(base, t);
    if (unauthorized) {
      await clearStoredToken();
      setToken(null);
      setUser(null);
      return;
    }
    if (me) setUser(me);
  }, [apiBase]);

  useEffect(() => {
    if (!ready || !token) {
      setUser(null);
      return;
    }
    refreshMe();
  }, [ready, token, refreshMe]);

  const setApiBase = useCallback(async (url: string) => {
    const u = normalizeBaseUrl(url) || DEFAULT_API_URL;
    setApiBaseState(u);
    await setStoredApiBase(u);
    await refreshMe();
  }, [refreshMe]);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await loginRequest(apiBase, username, password);
      if (!res.ok || !res.token)
        return { ok: false, message: res.message };
      await setStoredToken(res.token);
      setToken(res.token);
      return { ok: true };
    },
    [apiBase]
  );

  const logout = useCallback(async () => {
    const currentToken = await getStoredToken();
    if (currentToken) {
      try {
        await logoutRequest(apiBase, currentToken);
      } catch {
        /* local logout should still complete offline */
      }
    }
    await clearStoredToken();
    setToken(null);
    setUser(null);
  }, [apiBase]);

  const completeLoginWithToken = useCallback(async (value: string) => {
    await setStoredToken(value);
    setToken(value);
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      apiBase,
      ready,
      setApiBase,
      login,
      completeLoginWithToken,
      logout,
      refreshMe,
    }),
    [
      token,
      user,
      apiBase,
      ready,
      setApiBase,
      login,
      completeLoginWithToken,
      logout,
      refreshMe,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth inside AuthProvider');
  return ctx;
}
