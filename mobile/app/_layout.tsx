import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';

import { useColorScheme } from '@/components/useColorScheme';
import { QuakeMonitorBoot } from '@/components/QuakeMonitorBoot';
import { AlertPreferencesProvider } from '@/context/AlertPreferencesContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';

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
  const [fontGateTimedOut, setFontGateTimedOut] = useState(false);

  installFetchGuard();

  useEffect(() => {
    const timeout = setTimeout(() => {
      setFontGateTimedOut(true);
    }, 3000);

    return () => clearTimeout(timeout);
  }, []);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) {
      console.error('[startup] Font loading failed, continuing without custom fonts.', error);
      setFontGateTimedOut(true);
    }
  }, [error]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void SplashScreen.hideAsync().catch((hideError) => {
        console.error('[startup] SplashScreen.hideAsync failed.', hideError);
      });
    }, 500);

    return () => clearTimeout(timeout);
  }, []);

  if (!loaded && !fontGateTimedOut) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <AlertPreferencesProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          <BackgroundServices />
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          </Stack>
        </ThemeProvider>
      </AlertPreferencesProvider>
    </AuthProvider>
  );
}

function BackgroundServices() {
  const { ready, token } = useAuth();

  if (!ready || !token) {
    return null;
  }

  return <QuakeMonitorBoot />;
}
