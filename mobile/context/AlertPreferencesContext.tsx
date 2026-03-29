import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import {
  getStoredAlertPreferences,
  setStoredAlertPreferences,
} from '@/lib/alertPreferencesStorage';

export type AlertPreferences = {
  enabled: boolean;
  minMagnitude: number;
  maxDistanceKm: number;
};

const DEFAULT_PREFERENCES: AlertPreferences = {
  enabled: true,
  minMagnitude: 4.5,
  maxDistanceKm: 180,
};

type AlertPreferencesContextValue = {
  ready: boolean;
  preferences: AlertPreferences;
  updatePreferences: (next: Partial<AlertPreferences>) => Promise<void>;
};

const AlertPreferencesContext = createContext<AlertPreferencesContextValue | null>(null);

function sanitizePreferences(value: Partial<AlertPreferences> | null | undefined): AlertPreferences {
  const minMagnitude = Number(value?.minMagnitude);
  const maxDistanceKm = Number(value?.maxDistanceKm);
  return {
    enabled: value?.enabled ?? DEFAULT_PREFERENCES.enabled,
    minMagnitude: Number.isFinite(minMagnitude)
      ? Math.min(7, Math.max(2.5, minMagnitude))
      : DEFAULT_PREFERENCES.minMagnitude,
    maxDistanceKm: Number.isFinite(maxDistanceKm)
      ? Math.min(500, Math.max(25, maxDistanceKm))
      : DEFAULT_PREFERENCES.maxDistanceKm,
  };
}

export function AlertPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [preferences, setPreferences] = useState<AlertPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    (async () => {
      try {
        const raw = await getStoredAlertPreferences();
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<AlertPreferences>;
          setPreferences(sanitizePreferences(parsed));
        }
      } catch {
        setPreferences(DEFAULT_PREFERENCES);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const updatePreferences = async (next: Partial<AlertPreferences>) => {
    let mergedValue = DEFAULT_PREFERENCES;
    setPreferences((current) => {
      mergedValue = sanitizePreferences({ ...current, ...next });
      return mergedValue;
    });
    await setStoredAlertPreferences(JSON.stringify(mergedValue));
  };

  const value = useMemo(
    () => ({
      ready,
      preferences,
      updatePreferences,
    }),
    [ready, preferences]
  );

  return (
    <AlertPreferencesContext.Provider value={value}>
      {children}
    </AlertPreferencesContext.Provider>
  );
}

export function useAlertPreferences() {
  const ctx = useContext(AlertPreferencesContext);
  if (!ctx) throw new Error('useAlertPreferences must be used inside AlertPreferencesProvider');
  return ctx;
}
