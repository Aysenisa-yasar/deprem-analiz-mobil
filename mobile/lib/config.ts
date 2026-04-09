import Constants from 'expo-constants';
import { Platform } from 'react-native';

const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;

function getDevApiUrl() {
  if (!__DEV__) return null;
  if (Platform.OS === 'android') return 'http://10.0.2.2:5000';
  return 'http://127.0.0.1:5000';
}

/** Yerel gelistirme: Android emulatoru ana makine icin 10.0.2.2; fiziksel cihazda PC IP'si gerekir. */
export const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  getDevApiUrl() ??
  extra?.apiUrl ??
  'http://127.0.0.1:5000';
