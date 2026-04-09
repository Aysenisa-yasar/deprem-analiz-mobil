import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { CosmicBackdrop, CosmicLabel, GlassCard, GlowButton, alpha } from '@/components/cosmic';
import { useColorScheme } from '@/components/useColorScheme';
import { theme, type ThemeTokens } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import {
  connectToP2PPeer,
  disconnectFromP2PPeer,
  ensureP2PPermissions,
  getP2PState,
  isP2PAvailable,
  sendP2PText,
  startP2PAdvertising,
  startP2PDiscovery,
  stopP2PTransport,
  subscribeToP2PEvents,
  type P2PMessage,
  type P2PPeer,
  type P2PState,
} from '@/lib/p2p';

type LocalMessage = P2PMessage & {
  direction: 'in' | 'out';
};

function peerPriority(status: P2PPeer['status']) {
  switch (status) {
    case 'connected':
      return 0;
    case 'connecting':
      return 1;
    case 'found':
      return 2;
    default:
      return 3;
  }
}

export default function P2PScreen() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const t = theme[scheme];
  const styles = useMemo(() => makeStyles(t), [t]);
  const { user } = useAuth();

  const [displayName, setDisplayName] = useState(user?.username || 'DepremAnaliz');
  const [mode, setMode] = useState<P2PState['mode']>('idle');
  const [peers, setPeers] = useState<Record<string, P2PPeer>>({});
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    if (user?.username && displayName === 'DepremAnaliz') {
      setDisplayName(user.username);
    }
  }, [displayName, user?.username]);

  useEffect(() => {
    let mounted = true;

    if (!isP2PAvailable()) {
      setBanner('Bu build Android native P2P modulu icermiyor.');
      return () => undefined;
    }

    void getP2PState().then((state) => {
      if (!mounted) return;
      setMode(state.mode);
      setPeers(Object.fromEntries(state.peers.map((peer) => [peer.endpointId, peer])));
    });

    const unsubscribe = subscribeToP2PEvents({
      onStateChanged: (state) => {
        setMode(state.mode);
        setPeers(Object.fromEntries(state.peers.map((peer) => [peer.endpointId, peer])));
      },
      onPeerUpdated: (peer) => {
        setPeers((current) => {
          const next = { ...current };
          if (peer.status === 'lost') {
            delete next[peer.endpointId];
            return next;
          }
          next[peer.endpointId] = peer;
          return next;
        });
      },
      onConnectionInitiated: (peer) => {
        setBanner(
          `${peer.endpointName} baglanti baslatti. Kimlik tokeni: ${peer.authenticationToken ?? 'yok'}`
        );
      },
      onConnectionChanged: (peer) => {
        setPeers((current) => {
          const next = { ...current };
          if (
            peer.status === 'disconnected' ||
            peer.status === 'rejected' ||
            peer.status === 'error'
          ) {
            delete next[peer.endpointId];
            return next;
          }
          next[peer.endpointId] = peer;
          return next;
        });

        if (peer.status === 'connected') {
          setSelectedPeerId(peer.endpointId);
          setBanner(`${peer.endpointName} ile P2P baglantisi kuruldu.`);
        } else if (peer.status === 'disconnected') {
          setBanner(`${peer.endpointName} baglantisi kapandi.`);
        }
      },
      onMessage: (message) => {
        setMessages((current) =>
          [{ ...message, direction: 'in' as const }, ...current].slice(0, 20)
        );
        setBanner(`${message.fromName ?? message.endpointName} cihazindan mesaj geldi.`);
      },
      onError: (error) => {
        setBusyAction(null);
        setBanner(error.message);
      },
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const peerList = useMemo(
    () =>
      Object.values(peers).sort(
        (left, right) =>
          peerPriority(left.status) - peerPriority(right.status) ||
          left.endpointName.localeCompare(right.endpointName, 'tr')
      ),
    [peers]
  );

  const selectedPeer =
    (selectedPeerId ? peers[selectedPeerId] : null) ??
    peerList.find((peer) => peer.status === 'connected') ??
    null;

  async function runTransportAction(
    key: 'advertise' | 'discover',
    action: () => Promise<unknown>
  ) {
    const permissionResult = await ensureP2PPermissions();
    if (!permissionResult.granted) {
      setBanner(
        `Yakindaki cihaz izinleri olmadan P2P calismaz: ${permissionResult.missing.join(', ')}`
      );
      return;
    }

    setBusyAction(key);
    setBanner(null);
    try {
      await action();
      setBanner(
        key === 'advertise'
          ? 'Yayin basladi. Diger telefonda P2P ekranindan Tarama Baslat diyebilirsin.'
          : 'Tarama basladi. Gorunen cihaza Baglan diyerek direkt kanal kurabilirsin.'
      );
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'P2P islemi basarisiz oldu.');
    } finally {
      setBusyAction(null);
    }
  }

  async function onSend() {
    if (!selectedPeer || !draft.trim()) {
      setBanner('Mesaj gondermek icin bagli bir cihaz ve metin gerekli.');
      return;
    }

    setBusyAction('send');
    setBanner(null);
    try {
      await sendP2PText(
        selectedPeer.endpointId,
        draft.trim(),
        displayName.trim() || 'DepremAnaliz'
      );
      setMessages((current) => [
        {
          endpointId: selectedPeer.endpointId,
          endpointName: selectedPeer.endpointName,
          fromName: displayName.trim() || 'DepremAnaliz',
          body: draft.trim(),
          sentAt: Date.now(),
          direction: 'out' as const,
        },
        ...current,
      ]);
      setDraft('');
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'P2P mesaj gonderilemedi.');
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <View style={styles.root}>
      <CosmicBackdrop t={t} />
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scrollPad} showsVerticalScrollIndicator={false}>
          <GlassCard t={t} tone="cool" style={styles.heroCard}>
            <CosmicLabel t={t}>real p2p</CosmicLabel>
            <Text style={[styles.title, { color: t.text }]}>Gercek Cihazlar Arasi Kanal</Text>
            <Text style={[styles.body, { color: t.textSecondary }]}>
              Bu ekran Nearby Connections ile internet olmadan dogrudan telefonlar arasi baglanti
              kurar. Bu yol backend relay degil, tek atlamali Android P2P tasiyicisidir.
            </Text>

            <View style={styles.infoGrid}>
              <View
                style={[styles.infoCard, { backgroundColor: t.panelSoft, borderColor: t.border }]}>
                <Text style={[styles.infoLabel, { color: t.textMuted }]}>Mod</Text>
                <Text style={[styles.infoValue, { color: t.text }]}>{mode}</Text>
              </View>
              <View
                style={[styles.infoCard, { backgroundColor: t.panelSoft, borderColor: t.border }]}>
                <Text style={[styles.infoLabel, { color: t.textMuted }]}>Bagli cihaz</Text>
                <Text style={[styles.infoValue, { color: t.text }]}>
                  {peerList.filter((item) => item.status === 'connected').length}
                </Text>
              </View>
            </View>

            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Bu telefondaki gorunen ad"
              placeholderTextColor={t.textMuted}
              style={[
                styles.input,
                { color: t.text, borderColor: t.border, backgroundColor: t.inputBg },
              ]}
            />

            <View style={styles.buttonRow}>
              <GlowButton
                t={t}
                label={busyAction === 'advertise' ? 'Baslatiliyor' : 'Yayin Baslat'}
                onPress={() =>
                  void runTransportAction('advertise', () => startP2PAdvertising(displayName))
                }
                disabled={busyAction !== null}
                style={styles.flexButton}
              />
              <GlowButton
                t={t}
                tone="orange"
                label={busyAction === 'discover' ? 'Taraniyor' : 'Tarama Baslat'}
                onPress={() =>
                  void runTransportAction('discover', () => startP2PDiscovery(displayName))
                }
                disabled={busyAction !== null}
                style={styles.flexButton}
              />
            </View>

            <GlowButton
              t={t}
              tone="danger"
              label="Durdur"
              onPress={() =>
                void stopP2PTransport().then(() => setBanner('P2P yayin ve tarama durduruldu.'))
              }
            />

            {banner ? (
              <Text
                style={[
                  styles.banner,
                  { color: t.textSecondary, backgroundColor: t.panelSoft },
                ]}>
                {banner}
              </Text>
            ) : null}
          </GlassCard>

          <GlassCard t={t} style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Yakindaki Cihazlar</Text>
            <Text style={[styles.body, { color: t.textSecondary }]}>
              Bir telefonda Yayin Baslat, diger telefonda Tarama Baslat. Cihaz listede gorunurse
              Baglan ile direkt kanal ac.
            </Text>

            {peerList.length ? (
              peerList.map((peer) => {
                const connected = peer.status === 'connected';
                const selected = selectedPeer?.endpointId === peer.endpointId;

                return (
                  <View
                    key={peer.endpointId}
                    style={[
                      styles.peerCard,
                      {
                        backgroundColor: selected ? alpha(t.glowBlue, 0.14) : t.panelSoft,
                        borderColor: selected ? alpha(t.glowBlue, 0.26) : t.border,
                      },
                    ]}>
                    <View style={styles.peerHeader}>
                      <View>
                        <Text style={[styles.peerName, { color: t.text }]}>{peer.endpointName}</Text>
                        <Text
                          style={[styles.peerMeta, { color: connected ? t.success : t.textMuted }]}>
                          {peer.status}
                        </Text>
                      </View>
                      <FontAwesome
                        name={connected ? 'link' : 'wifi'}
                        size={18}
                        color={connected ? t.success : t.brandTab}
                      />
                    </View>

                    <View style={styles.peerActions}>
                      {!connected ? (
                        <GlowButton
                          t={t}
                          label="Baglan"
                          onPress={() =>
                            void connectToP2PPeer(peer.endpointId)
                              .then(() =>
                                setBanner(`${peer.endpointName} icin baglanti istegi gitti.`)
                              )
                              .catch((error) =>
                                setBanner(
                                  error instanceof Error
                                    ? error.message
                                    : 'Baglanti istegi basarisiz.'
                                )
                              )
                          }
                          style={styles.peerButton}
                        />
                      ) : (
                        <>
                          <GlowButton
                            t={t}
                            label={selected ? 'Secildi' : 'Sec'}
                            onPress={() => setSelectedPeerId(peer.endpointId)}
                            style={styles.peerButton}
                          />
                          <GlowButton
                            t={t}
                            tone="danger"
                            label="Ayril"
                            onPress={() =>
                              void disconnectFromP2PPeer(peer.endpointId).then(() =>
                                setBanner(`${peer.endpointName} baglantisi kapatildi.`)
                              )
                            }
                            style={styles.peerButton}
                          />
                        </>
                      )}
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={[styles.emptyText, { color: t.textSecondary }]}>
                Henuz P2P cihaz bulunmadi.
              </Text>
            )}
          </GlassCard>

          <GlassCard t={t} style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Direkt Mesaj</Text>
            <Text style={[styles.body, { color: t.textSecondary }]}>
              Bagli cihaza acil metin gonderebilirsin. Bu mesaj backend yerine dogrudan diger
              telefona gider.
            </Text>

            <Text style={[styles.selectedLabel, { color: t.textMuted }]}>
              Hedef: {selectedPeer ? selectedPeer.endpointName : 'secilmedi'}
            </Text>

            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="P2P acil mesaji"
              placeholderTextColor={t.textMuted}
              multiline
              style={[
                styles.input,
                styles.messageInput,
                { color: t.text, borderColor: t.border, backgroundColor: t.inputBg },
              ]}
            />

            <GlowButton
              t={t}
              tone="orange"
              label={busyAction === 'send' ? 'Gonderiliyor' : 'Direkt Gonder'}
              onPress={() => void onSend()}
              disabled={busyAction === 'send'}
            />

            <View style={styles.logWrap}>
              {messages.length ? (
                messages.map((message, index) => (
                  <View
                    key={`${message.endpointId}_${message.sentAt}_${index}`}
                    style={[
                      styles.messageCard,
                      {
                        backgroundColor:
                          message.direction === 'out'
                            ? alpha(t.glowBlue, 0.16)
                            : alpha(t.glowOrange, 0.12),
                        borderColor:
                          message.direction === 'out'
                            ? alpha(t.glowBlue, 0.24)
                            : alpha(t.glowOrange, 0.2),
                      },
                    ]}>
                    <Text style={[styles.messageMeta, { color: t.textMuted }]}>
                      {message.direction === 'out' ? 'Giden' : 'Gelen'} -{' '}
                      {message.fromName ?? message.endpointName}
                    </Text>
                    <Text style={[styles.messageBody, { color: t.text }]}>{message.body}</Text>
                  </View>
                ))
              ) : (
                <Text style={[styles.emptyText, { color: t.textSecondary }]}>
                  Henuz P2P mesaj yok.
                </Text>
              )}
            </View>
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    safe: { flex: 1 },
    scrollPad: { padding: 18, paddingBottom: 40, gap: 16 },
    heroCard: { gap: 14 },
    sectionCard: { gap: 14 },
    title: { fontSize: 28, fontWeight: '800', fontFamily: t.displayFont },
    sectionTitle: { fontSize: 20, fontWeight: '800', fontFamily: t.displayFont },
    body: { fontSize: 14, lineHeight: 21 },
    infoGrid: { flexDirection: 'row', gap: 10 },
    infoCard: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 18,
      padding: 14,
      gap: 4,
    },
    infoLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
    infoValue: { fontSize: 18, fontWeight: '800' },
    input: {
      minHeight: 52,
      borderWidth: 1,
      borderRadius: 18,
      paddingHorizontal: 16,
      fontSize: 15,
    },
    messageInput: {
      minHeight: 110,
      textAlignVertical: 'top',
      paddingTop: 14,
      paddingBottom: 14,
    },
    buttonRow: { flexDirection: 'row', gap: 10 },
    flexButton: { flex: 1 },
    banner: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 16,
      fontSize: 13,
      lineHeight: 19,
    },
    peerCard: {
      borderWidth: 1,
      borderRadius: 20,
      padding: 14,
      gap: 12,
    },
    peerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    peerName: { fontSize: 16, fontWeight: '800' },
    peerMeta: { fontSize: 12, fontWeight: '700' },
    peerActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    peerButton: { minWidth: 120 },
    emptyText: { fontSize: 14, lineHeight: 20 },
    selectedLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
    logWrap: { gap: 10 },
    messageCard: {
      borderWidth: 1,
      borderRadius: 18,
      padding: 12,
      gap: 6,
    },
    messageMeta: { fontSize: 12, fontWeight: '700' },
    messageBody: { fontSize: 14, lineHeight: 20 },
  });
}
