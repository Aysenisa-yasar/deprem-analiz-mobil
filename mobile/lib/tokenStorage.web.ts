import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'da_auth_token';
const API_BASE_KEY = 'da_api_base';

export async function getStoredApiBase(): Promise<string | null> {
  return AsyncStorage.getItem(API_BASE_KEY);
}

export async function setStoredApiBase(url: string): Promise<void> {
  await AsyncStorage.setItem(API_BASE_KEY, url);
}

/** Web: SecureStore modülü boş stub; yalnızca AsyncStorage. */
export async function getStoredToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setStoredToken(value: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, value);
}

export async function clearStoredToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}
