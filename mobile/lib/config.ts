import Constants from 'expo-constants';
import { Platform } from 'react-native';

const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;
const KNOWN_PRODUCTION_API_URLS = [
  'https://depremanaliz.onrender.com',
  'https://deprem-analiz-mobil.onrender.com',
];

function getDevApiUrl() {
  if (!__DEV__) return null;
  if (Platform.OS === 'android') return 'http://10.0.2.2:5000';
  return 'http://127.0.0.1:5000';
}

function uniqueUrls(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of values) {
    const value = raw?.trim().replace(/\/$/, '');
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }

  return out;
}

export const STARTUP_API_CANDIDATES = uniqueUrls([
  process.env.EXPO_PUBLIC_API_URL,
  getDevApiUrl(),
  extra?.apiUrl,
  ...KNOWN_PRODUCTION_API_URLS,
]);

/** Yerel gelistirme: Android emulatoru ana makine icin 10.0.2.2; fiziksel cihazda PC IP'si gerekir. */
export const DEFAULT_API_URL =
  STARTUP_API_CANDIDATES[0] ?? 'http://127.0.0.1:5000';
