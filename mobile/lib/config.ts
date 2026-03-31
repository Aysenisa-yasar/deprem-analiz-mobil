import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;

/** Yerel geliştirme: Android emülatörü ana makine için 10.0.2.2; fiziksel cihazda PC IP’si gerekir. */
export const DEFAULT_API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  extra?.apiUrl ??
  'http://127.0.0.1:5000';
