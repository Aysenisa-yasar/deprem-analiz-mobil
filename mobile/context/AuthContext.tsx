import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as Linking from 'expo-linking';

import { DEFAULT_API_URL } from '@/lib/config';
import { exchangeSupabaseSession, fetchMe, loginRequest, registerRequest } from '@/lib/api';
import { bindSupabaseAppState, hydrateSupabaseSessionFromUrl, isSupabaseConfigured, supabase } from '@/lib/supabase';
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
  register: (u: string, p: string) => Promise<{ ok: boolean; message?: string }>;
  completeLoginWithToken: (token: string) => Promise<void>;
  completeLoginWithSupabaseAccessToken: (accessToken: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [apiBase, setApiBaseState] = useState(DEFAULT_API_URL);
  const [ready, setReady] = useState(false);

  const completeLoginWithSupabaseAccessToken = useCallback(
    async (accessToken: string) => {
      const result = await exchangeSupabaseSession(apiBase, accessToken);
      if (!result.ok || !result.token) {
        return { ok: false, message: result.message };
      }
      await setStoredToken(result.token);
      setToken(result.token);
      return { ok: true };
    },
    [apiBase]
  );

  useEffect(() => {
    (async () => {
      try {
        const stored = await getStoredApiBase();
        if (stored?.trim()) setApiBaseState(stored.trim().replace(/\/$/, ''));
        const t = await getStoredToken();
        setToken(t);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    bindSupabaseAppState();

    let active = true;
    const syncFromUrl = async (url: string | null) => {
      if (!url) return;
      const changed = await hydrateSupabaseSessionFromUrl(url);
      if (!changed || !active) return;
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) return;
      await completeLoginWithSupabaseAccessToken(accessToken);
    };

    void Linking.getInitialURL().then(syncFromUrl);

    const linkSub = Linking.addEventListener('url', (event) => {
      void syncFromUrl(event.url);
    });

    const authSub = supabase.auth.onAuthStateChange((_event, session) => {
      const accessToken = session?.access_token;
      if (!accessToken) return;
      void completeLoginWithSupabaseAccessToken(accessToken);
    });

    return () => {
      active = false;
      linkSub.remove();
      authSub.data.subscription.unsubscribe();
    };
  }, [completeLoginWithSupabaseAccessToken]);

  const refreshMe = useCallback(async () => {
    const t = await getStoredToken();
    const base = (await getStoredApiBase())?.trim() || DEFAULT_API_URL;
    if (!t) {
      setUser(null);
      return;
    }
    const { user: me, unauthorized } = await fetchMe(base.replace(/\/$/, ''), t);
    if (unauthorized) {
      await clearStoredToken();
      setToken(null);
      setUser(null);
      return;
    }
    if (me) setUser(me);
  }, []);

  useEffect(() => {
    if (!ready || !token) {
      setUser(null);
      return;
    }
    refreshMe();
  }, [ready, token, refreshMe]);

  const setApiBase = useCallback(async (url: string) => {
    const u = url.trim().replace(/\/$/, '');
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

  const register = useCallback(
    async (username: string, password: string) => {
      const res = await registerRequest(apiBase, username, password);
      if (!res.ok || !res.token)
        return { ok: false, message: res.message };
      await setStoredToken(res.token);
      setToken(res.token);
      return { ok: true };
    },
    [apiBase]
  );

  const logout = useCallback(async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    await clearStoredToken();
    setToken(null);
    setUser(null);
  }, []);

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
      register,
      completeLoginWithToken,
      completeLoginWithSupabaseAccessToken,
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
      register,
      completeLoginWithToken,
      completeLoginWithSupabaseAccessToken,
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
