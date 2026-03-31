import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { AlertPreferencesProvider } from '@/context/AlertPreferencesContext';
import { AuthProvider } from '@/context/AuthContext';
import { MeshProvider } from '@/context/MeshContext';
import { QuakeMonitorBoot } from '@/components/QuakeMonitorBoot';

declare global {
  var __DA_FETCH_GUARD_INSTALLED__: boolean | undefined;
}

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'index',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function installFetchGuard() {
  if (globalThis.__DA_FETCH_GUARD_INSTALLED__ || typeof globalThis.fetch !== 'function') {
    return;
  }

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      return await originalFetch(input, init);
    } catch (error) {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : 'url-bilinmiyor';

      console.warn('[fetch-guard] Network request failed:', url);

      if (typeof Response === 'function') {
        return new Response(
          JSON.stringify({
            status: 'error',
            message: 'Network request failed',
            url,
          }),
          {
            status: 599,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      throw error;
    }
  }) as typeof globalThis.fetch;

  globalThis.__DA_FETCH_GUARD_INSTALLED__ = true;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  installFetchGuard();

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <AlertPreferencesProvider>
        <MeshProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
            <QuakeMonitorBoot />
            <Stack>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
            </Stack>
          </ThemeProvider>
        </MeshProvider>
      </AlertPreferencesProvider>
    </AuthProvider>
  );
}
