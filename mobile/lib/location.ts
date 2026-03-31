import * as Location from 'expo-location';
import { Platform } from 'react-native';

export type SafeLocationResult =
  | {
      ok: true;
      lat: number;
      lon: number;
      source: 'current' | 'last_known';
      message?: string;
    }
  | {
      ok: false;
      message: string;
      servicesEnabled?: boolean;
      permissionStatus?: string;
      canAskAgain?: boolean;
      needsSettings?: boolean;
    };

function mapLocationError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    const lowered = error.message.toLowerCase();
    if (lowered.includes('location services')) {
      return 'Konum servisleri kapali gorunuyor.';
    }
    if (lowered.includes('denied') || lowered.includes('permission')) {
      return 'Konum izni verilmedi.';
    }
    return error.message.trim();
  }
  return 'Konum bilgisi alinamadi.';
}

export async function getSafeDeviceLocation(options?: {
  requestPermission?: boolean;
  accuracy?: number;
  allowLastKnown?: boolean;
}): Promise<SafeLocationResult> {
  const requestPermission = options?.requestPermission ?? false;
  const accuracy = options?.accuracy ?? Location.Accuracy.Balanced;
  const allowLastKnown = options?.allowLastKnown ?? true;

  try {
    let servicesEnabled = await Location.hasServicesEnabledAsync();
    if (
      !servicesEnabled &&
      requestPermission &&
      Platform.OS === 'android' &&
      typeof Location.enableNetworkProviderAsync === 'function'
    ) {
      try {
        await Location.enableNetworkProviderAsync();
        servicesEnabled = await Location.hasServicesEnabledAsync();
      } catch {
        /* user may decline android dialog */
      }
    }

    if (!servicesEnabled) {
      return {
        ok: false,
        servicesEnabled: false,
        needsSettings: true,
        message: 'Konum servisleri kapali. Ayarlardan konumu acman gerekiyor.',
      };
    }

    const permission = requestPermission
      ? await Location.requestForegroundPermissionsAsync()
      : await Location.getForegroundPermissionsAsync();

    if (permission.status !== 'granted') {
      return {
        ok: false,
        servicesEnabled: true,
        permissionStatus: permission.status,
        canAskAgain: permission.canAskAgain,
        needsSettings: permission.status === 'denied' && permission.canAskAgain === false,
        message:
          requestPermission && permission.canAskAgain === false
            ? 'Konum izni kapatildi. Ayarlardan tekrar acman gerekiyor.'
            : requestPermission
              ? 'Konum izni verilmedi.'
              : 'Konum izni henuz verilmemis.',
      };
    }

    try {
      const position = await Location.getCurrentPositionAsync({ accuracy });
      return {
        ok: true,
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        source: 'current',
      };
    } catch (error) {
      if (allowLastKnown) {
        try {
          const lastKnown = await Location.getLastKnownPositionAsync();
          if (lastKnown) {
            return {
              ok: true,
              lat: lastKnown.coords.latitude,
              lon: lastKnown.coords.longitude,
              source: 'last_known',
              message: 'Son bilinen konum kullanildi.',
            };
          }
        } catch {
          /* ignore fallback failure */
        }
      }

      return {
        ok: false,
        servicesEnabled: true,
        permissionStatus: permission.status,
        canAskAgain: permission.canAskAgain,
        message: mapLocationError(error),
      };
    }
  } catch (error) {
    return { ok: false, message: mapLocationError(error) };
  }
}
