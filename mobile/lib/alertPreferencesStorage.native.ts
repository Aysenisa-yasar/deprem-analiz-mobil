import * as SecureStore from 'expo-secure-store';

const ALERT_PREFS_KEY = 'da_alert_preferences';

export async function getStoredAlertPreferences(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ALERT_PREFS_KEY);
  } catch {
    return null;
  }
}

export async function setStoredAlertPreferences(value: string): Promise<void> {
  await SecureStore.setItemAsync(ALERT_PREFS_KEY, value);
}
