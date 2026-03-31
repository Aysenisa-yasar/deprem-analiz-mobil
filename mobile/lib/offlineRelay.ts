import AsyncStorage from '@react-native-async-storage/async-storage';

import { sendLocationAlert, sendMessage } from './api';

const OFFLINE_RELAY_KEY = 'da_offline_relay_queue_v1';

export type OfflineRelayPacket = {
  id: string;
  toUsername: string;
  body: string;
  kind: 'chat' | 'emergency' | 'location_alert';
  createdAt: number;
  locationAlertPayload?: {
    lat: number;
    lon: number;
    magnitude: number;
    epicenter_lat: number;
    epicenter_lon: number;
    event_key: string;
  };
};

function createPacketId(): string {
  return `relay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function saveQueue(list: OfflineRelayPacket[]): Promise<void> {
  await AsyncStorage.setItem(OFFLINE_RELAY_KEY, JSON.stringify(list));
}

export async function getOfflineRelayQueue(): Promise<OfflineRelayPacket[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_RELAY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is OfflineRelayPacket =>
        item &&
        typeof item.id === 'string' &&
        typeof item.toUsername === 'string' &&
        typeof item.body === 'string' &&
        (item.kind === 'chat' || item.kind === 'emergency' || item.kind === 'location_alert') &&
        typeof item.createdAt === 'number'
    );
  } catch {
    return [];
  }
}

export async function queueOfflineRelayPacket(
  input: Omit<OfflineRelayPacket, 'id' | 'createdAt'>
): Promise<OfflineRelayPacket> {
  const current = await getOfflineRelayQueue();
  const packet: OfflineRelayPacket = {
    id: createPacketId(),
    createdAt: Date.now(),
    ...input,
  };
  const next = [packet, ...current].slice(0, 100);
  await saveQueue(next);
  return packet;
}

export async function flushOfflineRelayQueue(
  baseUrl: string,
  token: string
): Promise<{ sent: number; remaining: number }> {
  const current = await getOfflineRelayQueue();
  if (!current.length) {
    return { sent: 0, remaining: 0 };
  }

  const remaining: OfflineRelayPacket[] = [];
  let sent = 0;

  for (const packet of current.reverse()) {
    if (packet.kind === 'location_alert' && packet.locationAlertPayload) {
      const result = await sendLocationAlert(baseUrl, token, packet.locationAlertPayload);
      if (result.ok && result.sent !== false) {
        sent += 1;
        continue;
      }
      if (result.ok && result.reason === 'already_sent') {
        continue;
      }
      if (result.retryable) {
        remaining.unshift(packet);
      }
      continue;
    }

    const result = await sendMessage(baseUrl, token, packet.toUsername, packet.body);
    if (result.ok) {
      sent += 1;
      continue;
    }
    remaining.unshift(packet);
  }

  await saveQueue(remaining);
  return { sent, remaining: remaining.length };
}
