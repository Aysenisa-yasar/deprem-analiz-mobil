import AsyncStorage from '@react-native-async-storage/async-storage';

const ALERT_PREFS_KEY = 'da_alert_preferences';

export async function getStoredAlertPreferences(): Promise<string | null> {
  return AsyncStorage.getItem(ALERT_PREFS_KEY);
}

export async function setStoredAlertPreferences(value: string): Promise<void> {
  await AsyncStorage.setItem(ALERT_PREFS_KEY, value);
}
