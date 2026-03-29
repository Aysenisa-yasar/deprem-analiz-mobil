import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'da_auth_token';
const API_BASE_KEY = 'da_api_base';

/** iOS/Android: AsyncStorage Expo Go’da modül hatası verebiliyor; hepsi SecureStore. */
export async function getStoredApiBase(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(API_BASE_KEY);
  } catch {
    return null;
  }
}

export async function setStoredApiBase(url: string): Promise<void> {
  await SecureStore.setItemAsync(API_BASE_KEY, url);
}

export async function getStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setStoredToken(value: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, value);
}

export async function clearStoredToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* yok say */
  }
}
