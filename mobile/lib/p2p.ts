import {
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
  type EmitterSubscription,
  type Permission,
} from 'react-native';

export type P2PMode = 'idle' | 'advertising' | 'discovering';
export type P2PPeerStatus =
  | 'found'
  | 'lost'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'rejected'
  | 'error';

export type P2PPeer = {
  endpointId: string;
  endpointName: string;
  status: P2PPeerStatus;
  authenticationToken?: string | null;
  statusCode?: number | null;
};

export type P2PMessage = {
  endpointId: string;
  endpointName: string;
  fromName?: string | null;
  body: string;
  sentAt: number;
};

export type P2PState = {
  mode: P2PMode;
  localName: string;
  serviceId: string;
  peers: P2PPeer[];
};

export type P2PError = {
  code: string;
  message: string;
};

type NearbyP2PNativeModule = {
  getState(): Promise<P2PState>;
  startAdvertising(displayName: string): Promise<P2PState>;
  startDiscovery(displayName: string): Promise<P2PState>;
  requestConnection(endpointId: string): Promise<P2PPeer>;
  disconnect(endpointId: string): Promise<void>;
  stop(): Promise<P2PState>;
  sendText(endpointId: string, body: string, fromName: string): Promise<void>;
};

type SubscriptionHandlers = {
  onStateChanged?: (state: P2PState) => void;
  onPeerUpdated?: (peer: P2PPeer) => void;
  onConnectionInitiated?: (peer: P2PPeer) => void;
  onConnectionChanged?: (peer: P2PPeer) => void;
  onMessage?: (message: P2PMessage) => void;
  onError?: (error: P2PError) => void;
};

const nativeModule = NativeModules.NearbyP2PModule as NearbyP2PNativeModule | undefined;
const emitter = nativeModule ? new NativeEventEmitter(NativeModules.NearbyP2PModule) : null;
const permissions = PermissionsAndroid.PERMISSIONS as Record<string, string>;

function requireNearbyModule(): NearbyP2PNativeModule {
  if (!nativeModule) {
    throw new Error('NearbyP2PModule hazir degil. Bu surum Android native P2P icermiyor.');
  }
  return nativeModule;
}

export function isP2PAvailable() {
  return Platform.OS === 'android' && Boolean(nativeModule);
}

export async function getP2PState() {
  return requireNearbyModule().getState();
}

export async function startP2PAdvertising(displayName: string) {
  return requireNearbyModule().startAdvertising(displayName);
}

export async function startP2PDiscovery(displayName: string) {
  return requireNearbyModule().startDiscovery(displayName);
}

export async function connectToP2PPeer(endpointId: string) {
  return requireNearbyModule().requestConnection(endpointId);
}

export async function disconnectFromP2PPeer(endpointId: string) {
  return requireNearbyModule().disconnect(endpointId);
}

export async function stopP2PTransport() {
  return requireNearbyModule().stop();
}

export async function sendP2PText(endpointId: string, body: string, fromName: string) {
  return requireNearbyModule().sendText(endpointId, body, fromName);
}

export async function ensureP2PPermissions() {
  if (Platform.OS !== 'android') {
    return { granted: false, missing: ['android_only'] };
  }

  const androidVersion =
    typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);

  const required: Permission[] =
    androidVersion >= 33
      ? [
          (permissions.BLUETOOTH_SCAN ?? 'android.permission.BLUETOOTH_SCAN') as Permission,
          (permissions.BLUETOOTH_ADVERTISE ?? 'android.permission.BLUETOOTH_ADVERTISE') as Permission,
          (permissions.BLUETOOTH_CONNECT ?? 'android.permission.BLUETOOTH_CONNECT') as Permission,
          (permissions.NEARBY_WIFI_DEVICES ?? 'android.permission.NEARBY_WIFI_DEVICES') as Permission,
        ]
      : androidVersion >= 31
        ? [
            (permissions.BLUETOOTH_SCAN ?? 'android.permission.BLUETOOTH_SCAN') as Permission,
            (permissions.BLUETOOTH_ADVERTISE ?? 'android.permission.BLUETOOTH_ADVERTISE') as Permission,
            (permissions.BLUETOOTH_CONNECT ?? 'android.permission.BLUETOOTH_CONNECT') as Permission,
          ]
        : [(permissions.ACCESS_FINE_LOCATION ?? 'android.permission.ACCESS_FINE_LOCATION') as Permission];

  const result = await PermissionsAndroid.requestMultiple(required);
  const missing = required.filter(
    (item) => result[item] !== PermissionsAndroid.RESULTS.GRANTED
  );

  return { granted: missing.length === 0, missing };
}

export function subscribeToP2PEvents(handlers: SubscriptionHandlers) {
  if (!emitter) {
    return () => undefined;
  }

  const subscriptions: EmitterSubscription[] = [];

  if (handlers.onStateChanged) {
    subscriptions.push(emitter.addListener('p2pStateChanged', handlers.onStateChanged));
  }
  if (handlers.onPeerUpdated) {
    subscriptions.push(emitter.addListener('p2pPeerUpdated', handlers.onPeerUpdated));
  }
  if (handlers.onConnectionInitiated) {
    subscriptions.push(
      emitter.addListener('p2pConnectionInitiated', handlers.onConnectionInitiated)
    );
  }
  if (handlers.onConnectionChanged) {
    subscriptions.push(
      emitter.addListener('p2pConnectionChanged', handlers.onConnectionChanged)
    );
  }
  if (handlers.onMessage) {
    subscriptions.push(emitter.addListener('p2pMessage', handlers.onMessage));
  }
  if (handlers.onError) {
    subscriptions.push(emitter.addListener('p2pError', handlers.onError));
  }

  return () => {
    subscriptions.forEach((subscription) => subscription.remove());
  };
}
