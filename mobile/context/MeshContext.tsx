import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import {
  acceptMeshConnection,
  disconnectMeshPeer,
  getMeshAvailability,
  type MeshAvailability,
  type MeshPeer,
  rejectMeshConnection,
  requestMeshConnection,
  sendMeshText,
  startMeshNode,
  stopMeshNode,
  subscribeMeshEvents,
} from '@/lib/mesh';

export type TranscriptMessage = {
  id: string;
  peerId?: string;
  peerName?: string;
  text: string;
  direction: 'incoming' | 'outgoing' | 'system';
  createdAt: number;
};

type MeshRelayResult = {
  ok: boolean;
  sentCount: number;
  route: 'direct' | 'broadcast' | 'none';
  message?: string;
};

type MeshContextValue = {
  availability: MeshAvailability | null;
  busy: boolean;
  running: boolean;
  myPeerId: string | null;
  deviceName: string;
  discoveredPeers: MeshPeer[];
  connectedPeers: MeshPeer[];
  invitations: MeshPeer[];
  selectedPeerId: string | null;
  statusMessage: string | null;
  transcript: TranscriptMessage[];
  setDeviceName: (value: string) => void;
  setSelectedPeerId: (value: string | null) => void;
  setStatusMessage: (value: string | null) => void;
  startNode: () => Promise<{ ok: boolean; message?: string }>;
  stopNode: () => Promise<void>;
  askConnect: (peer: MeshPeer) => Promise<{ ok: boolean; message?: string }>;
  acceptInvite: (peer: MeshPeer) => Promise<{ ok: boolean; message?: string }>;
  rejectInvite: (peer: MeshPeer) => Promise<{ ok: boolean; message?: string }>;
  sendTextToPeer: (peerId: string, text: string) => Promise<{ ok: boolean; message?: string }>;
  sendTextToSelected: (text: string) => Promise<{ ok: boolean; message?: string }>;
  sendSos: () => Promise<MeshRelayResult>;
  relayEmergencyText: (text: string, preferredUsername?: string | null) => Promise<MeshRelayResult>;
  disconnectPeer: (peer: MeshPeer) => Promise<void>;
};

const MeshContext = createContext<MeshContextValue | null>(null);

function uniqueByPeer(peers: MeshPeer[]): MeshPeer[] {
  const map = new Map<string, MeshPeer>();
  for (const peer of peers) map.set(peer.peerId, peer);
  return [...map.values()];
}

function makeId(prefix: string, peerId?: string) {
  return `${prefix}_${peerId || 'system'}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeMeshLabel(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}

function defaultDeviceName(username?: string | null) {
  if (username?.trim()) return `DepremAnaliz-${username.trim()}`;
  return `DepremAnaliz-${Math.random().toString(36).slice(2, 6)}`;
}

export function MeshProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const [availability, setAvailability] = useState<MeshAvailability | null>(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [myPeerId, setMyPeerId] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState(() => defaultDeviceName(user?.username));
  const [discoveredPeers, setDiscoveredPeers] = useState<MeshPeer[]>([]);
  const [connectedPeers, setConnectedPeers] = useState<MeshPeer[]>([]);
  const [invitations, setInvitations] = useState<MeshPeer[]>([]);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const connectedPeersRef = useRef<MeshPeer[]>([]);

  useEffect(() => {
    let mounted = true;
    void getMeshAvailability()
      .then((result) => {
        if (mounted) setAvailability(result);
      })
      .catch(() => {
        if (mounted) {
          setAvailability({
            supported: false,
            reason: 'Yakin cihaz durumu okunamadi.',
          });
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!user?.username) return;
    setDeviceName((current) => {
      if (!current.trim() || current.startsWith('DepremAnaliz-')) {
        return defaultDeviceName(user.username);
      }
      return current;
    });
  }, [user?.username]);

  useEffect(() => {
    connectedPeersRef.current = connectedPeers;
  }, [connectedPeers]);

  useEffect(() => {
    let mounted = true;
    let unsubscribe = () => {};

    void subscribeMeshEvents({
      onPeerFound: (peer) => {
        if (!mounted) return;
        setDiscoveredPeers((current) => uniqueByPeer([...current, peer]));
      },
      onPeerLost: (peerId) => {
        if (!mounted) return;
        setDiscoveredPeers((current) => current.filter((peer) => peer.peerId !== peerId));
      },
      onInvitation: (peer) => {
        if (!mounted) return;
        setInvitations((current) => uniqueByPeer([...current, peer]));
        setTranscript((current) => [
          ...current,
          {
            id: makeId('sys_invite', peer.peerId),
            direction: 'system',
            text: `${peer.name} senden baglanti izni istedi.`,
            peerId: peer.peerId,
            peerName: peer.name,
            createdAt: Date.now(),
          },
        ]);
      },
      onConnected: (peer) => {
        if (!mounted) return;
        setConnectedPeers((current) => uniqueByPeer([...current, peer]));
        setInvitations((current) => current.filter((item) => item.peerId !== peer.peerId));
        setSelectedPeerId((current) => current ?? peer.peerId);
        setTranscript((current) => [
          ...current,
          {
            id: makeId('sys_conn', peer.peerId),
            direction: 'system',
            text: `${peer.name} ile yakin baglanti kuruldu.`,
            peerId: peer.peerId,
            peerName: peer.name,
            createdAt: Date.now(),
          },
        ]);
      },
      onDisconnected: (peerId) => {
        if (!mounted) return;
        setConnectedPeers((current) => current.filter((peer) => peer.peerId !== peerId));
        setSelectedPeerId((current) => (current === peerId ? null : current));
        setTranscript((current) => [
          ...current,
          {
            id: makeId('sys_disc', peerId),
            direction: 'system',
            text: `${peerId.slice(0, 6)} baglantisi sonlandi.`,
            peerId,
            createdAt: Date.now(),
          },
        ]);
      },
      onText: (event) => {
        if (!mounted) return;
        const peerName = connectedPeersRef.current.find((peer) => peer.peerId === event.peerId)?.name;
        setTranscript((current) => [
          ...current,
          {
            id: makeId('msg_in', event.peerId),
            direction: 'incoming',
            text: event.text,
            peerId: event.peerId,
            peerName,
            createdAt: Date.now(),
          },
        ]);
      },
    })
      .then((cleanup) => {
        unsubscribe = cleanup;
      })
      .catch(() => {
        unsubscribe = () => {};
      });

    return () => {
      mounted = false;
      unsubscribe();
      void stopMeshNode();
    };
  }, []);

  const startNodeAction = async () => {
    setBusy(true);
    setStatusMessage(null);
    const result = await startMeshNode(deviceName.trim() || 'DepremAnaliz');
    setBusy(false);

    if (!result.ok) {
      setStatusMessage(result.message || 'Yakin ag baslatilamadi.');
      return { ok: false, message: result.message || 'Yakin ag baslatilamadi.' };
    }

    setRunning(true);
    setMyPeerId(result.peerId ?? null);
    setStatusMessage('Yakin ag aktif. Cevredeki cihazlar taraniyor.');
    return { ok: true };
  };

  const stopNodeAction = async () => {
    setBusy(true);
    try {
      await stopMeshNode();
    } catch {
      /* ignore */
    }
    setBusy(false);
    setRunning(false);
    setMyPeerId(null);
    setDiscoveredPeers([]);
    setConnectedPeers([]);
    setInvitations([]);
    setSelectedPeerId(null);
    setStatusMessage('Yakin ag durduruldu.');
  };

  const askConnect = async (peer: MeshPeer) => {
    const result = await requestMeshConnection(peer.peerId);
    setStatusMessage(
      result.ok ? `${peer.name} icin baglanti istegi gonderildi.` : result.message || 'Baglanti istegi gonderilemedi.'
    );
    return result;
  };

  const acceptInvite = async (peer: MeshPeer) => {
    const result = await acceptMeshConnection(peer.peerId);
    setStatusMessage(result.ok ? `${peer.name} baglantisi kabul edildi.` : result.message || 'Baglanti kabul edilemedi.');
    return result;
  };

  const rejectInvite = async (peer: MeshPeer) => {
    const result = await rejectMeshConnection(peer.peerId);
    setInvitations((current) => current.filter((item) => item.peerId !== peer.peerId));
    setStatusMessage(result.ok ? `${peer.name} istegi reddedildi.` : result.message || 'Istek reddedilemedi.');
    return result;
  };

  const sendTextToPeer = async (peerId: string, text: string) => {
    const cleaned = text.trim();
    if (!peerId || !cleaned) {
      setStatusMessage('Mesaj ve hedef cihaz secilmeli.');
      return { ok: false, message: 'Mesaj ve hedef cihaz secilmeli.' };
    }

    const result = await sendMeshText(peerId, cleaned);
    if (!result.ok) {
      setStatusMessage(result.message || 'Yakin mesaji gonderilemedi.');
      return { ok: false, message: result.message || 'Yakin mesaji gonderilemedi.' };
    }

    const peerName = connectedPeersRef.current.find((peer) => peer.peerId === peerId)?.name;
    setTranscript((current) => [
      ...current,
      {
        id: makeId('msg_out', peerId),
        direction: 'outgoing',
        text: cleaned,
        peerId,
        peerName,
        createdAt: Date.now(),
      },
    ]);
    setStatusMessage('Yakin cihaz mesaji gonderildi.');
    return { ok: true };
  };

  const sendTextToSelected = async (text: string) => {
    if (!selectedPeerId) {
      setStatusMessage('Bagli hedef cihaz secilmeli.');
      return { ok: false, message: 'Bagli hedef cihaz secilmeli.' };
    }
    return sendTextToPeer(selectedPeerId, text);
  };

  const relayEmergencyText = async (
    text: string,
    preferredUsername?: string | null
  ): Promise<MeshRelayResult> => {
    const peers = connectedPeersRef.current;
    if (!peers.length) {
      return { ok: false, sentCount: 0, route: 'none', message: 'Bagli mesh cihazi yok.' };
    }

    const preferred = normalizeMeshLabel(preferredUsername);
    const matchedPeer = preferred
      ? peers.find((peer) => normalizeMeshLabel(peer.name).includes(preferred))
      : null;
    const targets = matchedPeer ? [matchedPeer] : peers;

    let sentCount = 0;
    for (const peer of targets) {
      const result = await sendTextToPeer(peer.peerId, text);
      if (result.ok) sentCount += 1;
    }

    if (!sentCount) {
      return { ok: false, sentCount: 0, route: matchedPeer ? 'direct' : 'broadcast', message: 'Mesh gonderimi basarisiz.' };
    }

    const route = matchedPeer ? 'direct' : 'broadcast';
    setTranscript((current) => [
      ...current,
      {
        id: makeId('relay', matchedPeer?.peerId),
        direction: 'system',
        text:
          route === 'direct'
            ? `Acil relay mesaji ${matchedPeer?.name} cihazina gonderildi.`
            : `Acil relay mesaji ${sentCount} yakin cihaza yayinlandi.`,
        createdAt: Date.now(),
      },
    ]);
    return { ok: true, sentCount, route };
  };

  const sendSos = async (): Promise<MeshRelayResult> => {
    const username = user?.username?.trim();
    const sosText = username
      ? `[SOS] ${username} yardim istiyor. Bu mesaj internetsiz yakin ag uzerinden gonderildi.`
      : '[SOS] Yardim istiyorum. Bu mesaj internetsiz yakin ag uzerinden gonderildi.';
    const result = await relayEmergencyText(sosText, null);
    setStatusMessage(result.ok ? `SOS ${result.sentCount} cihaza gitti.` : result.message || 'SOS gonderilemedi.');
    return result;
  };

  const disconnectPeerAction = async (peer: MeshPeer) => {
    try {
      await disconnectMeshPeer(peer.peerId);
      setStatusMessage(`${peer.name} baglantisi sonlandirildi.`);
    } catch {
      setStatusMessage('Baglanti sonlandirilamadi.');
    }
  };

  const value = useMemo(
    () => ({
      availability,
      busy,
      running,
      myPeerId,
      deviceName,
      discoveredPeers,
      connectedPeers,
      invitations,
      selectedPeerId,
      statusMessage,
      transcript,
      setDeviceName,
      setSelectedPeerId,
      setStatusMessage,
      startNode: startNodeAction,
      stopNode: stopNodeAction,
      askConnect,
      acceptInvite,
      rejectInvite,
      sendTextToPeer,
      sendTextToSelected,
      sendSos,
      relayEmergencyText,
      disconnectPeer: disconnectPeerAction,
    }),
    [
      availability,
      busy,
      running,
      user?.username,
      myPeerId,
      deviceName,
      discoveredPeers,
      connectedPeers,
      invitations,
      selectedPeerId,
      statusMessage,
      transcript,
    ]
  );

  return <MeshContext.Provider value={value}>{children}</MeshContext.Provider>;
}

export function useMesh() {
  const ctx = useContext(MeshContext);
  if (!ctx) throw new Error('useMesh must be used inside MeshProvider');
  return ctx;
}
