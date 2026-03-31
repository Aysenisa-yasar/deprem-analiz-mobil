import Constants, { ExecutionEnvironment } from 'expo-constants';
import { PermissionsAndroid, Platform, type Permission } from 'react-native';

export type MeshPeer = {
  peerId: string;
  name: string;
};

export type MeshTextEvent = {
  peerId: string;
  text: string;
};

export type MeshAvailability = {
  supported: boolean;
  reason?: string;
  playServicesAvailable?: boolean;
  runtime?: 'dev-client' | 'expo-go' | 'native';
};

type NearbyModule = typeof import('expo-nearby-connections');

type MeshHandlers = {
  onPeerFound?: (peer: MeshPeer) => void;
  onPeerLost?: (peerId: string) => void;
  onInvitation?: (peer: MeshPeer) => void;
  onConnected?: (peer: MeshPeer) => void;
  onDisconnected?: (peerId: string) => void;
  onText?: (event: MeshTextEvent) => void;
};

function currentRuntime(): MeshAvailability['runtime'] {
  if (
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    Constants.appOwnership === 'expo' ||
    Constants.expoGoConfig
  ) {
    return 'expo-go';
  }
  if (Constants.executionEnvironment === ExecutionEnvironment.Standalone || Constants.appOwnership === 'standalone') {
    return 'native';
  }
  return 'dev-client';
}

async function loadNearbyModule(): Promise<NearbyModule | null> {
  if (currentRuntime() === 'expo-go') {
    return null;
  }

  try {
    const moduleRef = await import('expo-nearby-connections');
    if (
      typeof moduleRef.startAdvertise !== 'function' ||
      typeof moduleRef.startDiscovery !== 'function' ||
      typeof moduleRef.stopAdvertise !== 'function' ||
      typeof moduleRef.stopDiscovery !== 'function' ||
      typeof moduleRef.requestConnection !== 'function' ||
      typeof moduleRef.acceptConnection !== 'function' ||
      typeof moduleRef.rejectConnection !== 'function' ||
      typeof moduleRef.disconnect !== 'function' ||
      typeof moduleRef.sendText !== 'function' ||
      typeof moduleRef.onPeerFound !== 'function' ||
      typeof moduleRef.onPeerLost !== 'function' ||
      typeof moduleRef.onInvitationReceived !== 'function' ||
      typeof moduleRef.onConnected !== 'function' ||
      typeof moduleRef.onDisconnected !== 'function' ||
      typeof moduleRef.onTextReceived !== 'function'
    ) {
      return null;
    }
    return moduleRef;
  } catch {
    return null;
  }
}

function mapError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return 'Beklenmeyen bir yakin cihaz hatasi olustu';
}

async function requestAndroidMeshPermissions(): Promise<{ ok: boolean; message?: string }> {
  if (Platform.OS !== 'android') return { ok: true };

  const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
  const permissions: Permission[] = [];

  if (apiLevel >= 31) {
    permissions.push(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
    );
  } else {
    permissions.push(
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
  }

  if (apiLevel >= 33 && PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES) {
    permissions.push(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES);
  }

  const result = await PermissionsAndroid.requestMultiple([...new Set(permissions)] as Permission[]);
  const denied = Object.values(result).filter((status) => status !== PermissionsAndroid.RESULTS.GRANTED);

  if (denied.length) {
    return { ok: false, message: 'Yakin cihaz izinleri reddedildi. Bluetooth ve nearby izinlerini ver.' };
  }

  return { ok: true };
}

export async function getMeshAvailability(): Promise<MeshAvailability> {
  const runtime = currentRuntime();
  const moduleRef = await loadNearbyModule();

  if (!moduleRef) {
    return {
      supported: false,
      runtime,
      reason: runtime === 'expo-go'
        ? 'Bu ozellik Expo Go icinde calismaz. Android development build gerekli.'
        : 'Native yakin cihaz modulu yuklenemedi.',
    };
  }

  if (Platform.OS === 'android') {
    try {
      const playServicesAvailable = await moduleRef.isPlayServicesAvailable();
      if (!playServicesAvailable) {
        return {
          supported: false,
          runtime,
          playServicesAvailable: false,
          reason: 'Google Play Services uygun gorunmuyor.',
        };
      }
      return { supported: true, runtime, playServicesAvailable: true };
    } catch {
      return {
        supported: false,
        runtime,
        reason: 'Google Play Services durumu okunamadi.',
      };
    }
  }

  return { supported: true, runtime };
}

export async function ensureMeshReady(): Promise<{ ok: boolean; message?: string }> {
  const availability = await getMeshAvailability();
  if (!availability.supported) {
    return { ok: false, message: availability.reason || 'Yakin cihaz ozelligi kullanilamiyor' };
  }

  return requestAndroidMeshPermissions();
}

export async function startMeshNode(displayName: string): Promise<{ ok: boolean; peerId?: string; message?: string }> {
  const ready = await ensureMeshReady();
  if (!ready.ok) return ready;

  const moduleRef = await loadNearbyModule();
  if (!moduleRef) return { ok: false, message: 'Yakin cihaz modulu yuklenemedi' };

  try {
    const advertisedPeerId = await moduleRef.startAdvertise(displayName, moduleRef.Strategy.P2P_CLUSTER);
    const discoveredPeerId = await moduleRef.startDiscovery(displayName, moduleRef.Strategy.P2P_CLUSTER);
    return { ok: true, peerId: advertisedPeerId || discoveredPeerId };
  } catch (error) {
    return { ok: false, message: mapError(error) };
  }
}

export async function stopMeshNode(): Promise<void> {
  const moduleRef = await loadNearbyModule();
  if (!moduleRef) return;
  try {
    await Promise.allSettled([moduleRef.stopAdvertise(), moduleRef.stopDiscovery()]);
  } catch {
    /* ignore */
  }
}

export async function requestMeshConnection(peerId: string): Promise<{ ok: boolean; message?: string }> {
  const moduleRef = await loadNearbyModule();
  if (!moduleRef) return { ok: false, message: 'Yakin cihaz modulu yuklenemedi' };
  try {
    await moduleRef.requestConnection(peerId);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: mapError(error) };
  }
}

export async function acceptMeshConnection(peerId: string): Promise<{ ok: boolean; message?: string }> {
  const moduleRef = await loadNearbyModule();
  if (!moduleRef) return { ok: false, message: 'Yakin cihaz modulu yuklenemedi' };
  try {
    await moduleRef.acceptConnection(peerId);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: mapError(error) };
  }
}

export async function rejectMeshConnection(peerId: string): Promise<{ ok: boolean; message?: string }> {
  const moduleRef = await loadNearbyModule();
  if (!moduleRef) return { ok: false, message: 'Yakin cihaz modulu yuklenemedi' };
  try {
    await moduleRef.rejectConnection(peerId);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: mapError(error) };
  }
}

export async function disconnectMeshPeer(peerId?: string): Promise<void> {
  const moduleRef = await loadNearbyModule();
  if (!moduleRef) return;
  try {
    await moduleRef.disconnect(peerId);
  } catch {
    /* ignore */
  }
}

export async function sendMeshText(peerId: string, text: string): Promise<{ ok: boolean; message?: string }> {
  const moduleRef = await loadNearbyModule();
  if (!moduleRef) return { ok: false, message: 'Yakin cihaz modulu yuklenemedi' };
  try {
    await moduleRef.sendText(peerId, text);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: mapError(error) };
  }
}

export async function subscribeMeshEvents(handlers: MeshHandlers): Promise<() => void> {
  const moduleRef = await loadNearbyModule();
  if (!moduleRef) return () => {};

  try {
    const unsubscribers = [
      moduleRef.onPeerFound((peer) => handlers.onPeerFound?.(peer)),
      moduleRef.onPeerLost((peer) => handlers.onPeerLost?.(peer.peerId)),
      moduleRef.onInvitationReceived((peer) => handlers.onInvitation?.(peer)),
      moduleRef.onConnected((peer) => handlers.onConnected?.(peer)),
      moduleRef.onDisconnected((peer) => handlers.onDisconnected?.(peer.peerId)),
      moduleRef.onTextReceived((event) => handlers.onText?.(event)),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch {
          /* ignore */
        }
      });
    };
  } catch {
    return () => {};
  }
}
