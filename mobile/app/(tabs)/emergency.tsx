import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CosmicBackdrop, CosmicLabel, GlassCard, GlowButton, alpha } from '@/components/cosmic';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/context/AuthContext';
import { theme, type ThemeTokens } from '@/constants/theme';
import { startSirenLoop, stopSirenLoop } from '@/lib/alertAudio';
import { getSafeDeviceLocation } from '@/lib/location';
import {
  flushOfflineRelayQueue,
  getOfflineRelayQueue,
  queueOfflineRelayPacket,
} from '@/lib/offlineRelay';
import { ACTIVE_TRANSPORT } from '@/lib/transport';
import { sendMessage } from '@/services/messageService';

export default function EmergencyScreen() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const t = theme[scheme];
  const styles = useMemo(() => makeStyles(t), [t]);

  const { apiBase, token, user } = useAuth();
  const [sirenOn, setSirenOn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [queueBusy, setQueueBusy] = useState(false);

  const emergencyContact = user?.emergency_contact?.trim() || null;

  useEffect(() => {
    return () => {
      void stopSirenLoop();
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && sirenOn) {
        void stopSirenLoop();
        setSirenOn(false);
      }
    });
    return () => sub.remove();
  }, [sirenOn]);

  useEffect(() => {
    let mounted = true;
    const loadQueue = async () => {
      const queue = await getOfflineRelayQueue();
      if (mounted) setQueuedCount(queue.length);
    };
    void loadQueue();
    return () => {
      mounted = false;
    };
  }, []);

  const toggleSiren = async () => {
    if (sirenOn) {
      await stopSirenLoop();
      setSirenOn(false);
      return;
    }
    await startSirenLoop();
    setSirenOn(true);
  };

  const sendStatus = async (item: (typeof STATUS_ITEMS)[number]) => {
    if (!token || !user || !emergencyContact) {
      setMessage('Bu ozellik icin giris yapip kayitli bir acil kisi tanimlaman gerekiyor.');
      router.push('/settings');
      return;
    }

    setBusyKey(item.key);
    setMessage(null);

    let locationLine = 'Konum paylasilamadi.';
    const location = await getSafeDeviceLocation({ requestPermission: true, allowLastKnown: true });
    if (location.ok) {
      locationLine = `Konum: ${location.lat.toFixed(5)}, ${location.lon.toFixed(5)}`;
      if (location.source === 'last_known') {
        locationLine += ' (son bilinen)';
      }
    }

    const body = [
      `[ACIL DURUM] ${item.label}`,
      `Gonderen: @${user.username}`,
      locationLine,
      item.detail,
    ].join('\n');

    const result = await sendMessage(apiBase, token, emergencyContact, body);
    setBusyKey(null);

    if (!result.ok) {
      if (result.retryable) {
        await queueOfflineRelayPacket({
          toUsername: emergencyContact,
          body,
          kind: 'emergency',
        });
        const queue = await getOfflineRelayQueue();
        setQueuedCount(queue.length);
        setMessage('Ag yok gibi gorunuyor. Acil durum mesaji cihazda kuyruga alindi.');
        return;
      }
      setMessage(result.message || 'Durum mesaji gonderilemedi.');
      return;
    }

    setMessage(`Durum mesaji @${emergencyContact} kullanicisina gonderildi.`);
  };

  const flushQueue = async () => {
    if (!token) return;
    setQueueBusy(true);
    setMessage(null);
    try {
      const result = await flushOfflineRelayQueue(apiBase, token);
      setQueuedCount(result.remaining);
      if (result.remaining > 0) {
        setMessage(`Kuyruktaki ${result.remaining} mesaj hala gonderilemedi.`);
        return;
      }
      setMessage(result.sent > 0 ? 'Kuyruktaki acil mesajlar gonderildi.' : 'Kuyruk bos.');
    } finally {
      setQueueBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <CosmicBackdrop t={t} />
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scrollPad} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.push('/(tabs)')} style={styles.headerIcon}>
              <FontAwesome name="arrow-left" size={16} color={t.brandTab} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: t.text }]}>Acil Durum Senkronu</Text>
            <View style={styles.headerLightRow}>
              <View style={[styles.headerLight, { backgroundColor: alpha(t.glowBlue, 0.42) }]} />
              <View style={[styles.headerLight, { backgroundColor: alpha(t.glowBlue, 0.14) }]} />
            </View>
          </View>

          <GlassCard t={t} tone="cool" style={styles.statusDeck}>
            <View style={styles.statusHead}>
              <CosmicLabel t={t}>acil mod</CosmicLabel>
              <Pressable
                onPress={() => void toggleSiren()}
                style={[
                  styles.sirenToggle,
                  {
                    backgroundColor: sirenOn ? alpha(t.danger, 0.22) : alpha(t.glowBlue, 0.14),
                    borderColor: sirenOn ? alpha(t.danger, 0.34) : alpha(t.glowBlue, 0.22),
                  },
                ]}>
                <FontAwesome
                  name={sirenOn ? 'stop' : 'volume-up'}
                  size={16}
                  color={sirenOn ? t.danger : t.brandTab}
                />
              </Pressable>
            </View>

            <View style={[styles.infoRow, { borderColor: alpha(t.border, 0.6) }]}>
              <Text style={[styles.infoTitle, { color: t.text }]}>Ileti Kati</Text>
              <View
                style={[
                  styles.switchPill,
                  {
                    backgroundColor: alpha(t.success, 0.16),
                    borderColor: alpha(t.success, 0.28),
                  },
                ]}>
                <View style={[styles.switchDot, { backgroundColor: t.success }]} />
              </View>
            </View>

            <View style={[styles.infoRow, { borderColor: alpha(t.border, 0.6) }]}>
              <Text style={[styles.infoTitle, { color: t.text }]}>Tasiyici</Text>
              <Text style={[styles.infoValue, { color: t.textSecondary }]}>
                {ACTIVE_TRANSPORT.title}
              </Text>
            </View>

            <View style={[styles.infoRow, { borderColor: alpha(t.border, 0.6) }]}>
              <Text style={[styles.infoTitle, { color: t.text }]}>Durum</Text>
              <Text style={[styles.infoValue, { color: t.success }]}>Aktif</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={[styles.infoTitle, { color: t.text }]}>Peer-to-peer</Text>
              <Text style={[styles.infoValue, { color: t.textSecondary }]}>
                {ACTIVE_TRANSPORT.peerToPeerLabel}
              </Text>
            </View>

            <GlowButton
              t={t}
              label="Acil Mesaj Gonder"
              onPress={() => router.push('/messages')}
              style={styles.fullButton}
            />
            <GlowButton
              t={t}
              tone="orange"
              label="Gercek P2P Kanal"
              onPress={() => router.push('/p2p')}
              style={styles.fullButton}
            />

            <View
              style={[
                styles.offlineCard,
                {
                  backgroundColor: alpha(t.danger, 0.1),
                  borderColor: alpha(t.danger, 0.18),
                },
              ]}>
              <View style={styles.offlineHead}>
                <FontAwesome name="power-off" size={18} color={t.danger} />
                <Text style={[styles.offlineTitle, { color: t.text }]}>Cevrimdisi Mod</Text>
                <View
                  style={[
                    styles.offlineSwitch,
                    {
                      backgroundColor: alpha(t.glowBlue, 0.16),
                      borderColor: alpha(t.glowBlue, 0.22),
                    },
                  ]}>
                  <View style={[styles.switchDot, { backgroundColor: t.glowBlue }]} />
                </View>
              </View>
              <Text style={[styles.offlineCopy, { color: t.textSecondary }]}>
                Kuyruktaki mesajlar: {queuedCount}. Internet geri geldiginde yeniden gonderilebilir.
              </Text>
              <Text style={[styles.offlineCopy, { color: t.textSecondary }]}>
                {ACTIVE_TRANSPORT.meshDisclaimer} Acil durum mesajlari once sunucuya gonderilir,
                baglanti yoksa cihazda kalici olarak kuyruklanir.
              </Text>
            </View>
          </GlassCard>

          <View style={styles.quickGrid}>
            {STATUS_ITEMS.map((item) => {
              const active = busyKey === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => void sendStatus(item)}
                  disabled={active}
                  style={[
                    styles.quickCard,
                    {
                      backgroundColor: active ? alpha(t.glowOrange, 0.18) : t.panel,
                      borderColor: active ? alpha(t.glowOrange, 0.26) : t.border,
                    },
                  ]}>
                  <FontAwesome name={item.icon} size={22} color={active ? t.warn : t.brandTab} />
                  <Text style={[styles.quickTitle, { color: t.text }]}>{item.label}</Text>
                  <Text style={[styles.quickText, { color: t.textSecondary }]}>
                    {active ? 'Gonderiliyor...' : item.short}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actionRow}>
            <GlowButton
              t={t}
              tone="orange"
              label="Kuyrugu Yeniden Dene"
              onPress={() => void flushQueue()}
              disabled={queueBusy || queuedCount === 0}
              style={styles.flexButton}
            />
            <GlowButton
              t={t}
              tone="danger"
              label="112 Ara"
              onPress={() => void Linking.openURL('tel:112')}
              style={styles.flexButton}
            />
          </View>

          {message ? (
            <GlassCard t={t} style={styles.messageCard}>
              <Text style={[styles.messageText, { color: t.textSecondary }]}>{message}</Text>
            </GlassCard>
          ) : null}

          <Pressable onPress={() => router.push('/settings')} style={styles.footerLink}>
            <Text style={[styles.footerLinkText, { color: t.brandTab }]}>
              Acil kisi ve konum ayarlarini ac
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const STATUS_ITEMS: {
  key: string;
  label: string;
  short: string;
  detail: string;
  icon: ComponentProps<typeof FontAwesome>['name'];
}[] = [
  {
    key: 'safe',
    label: 'Guvendeyim',
    short: 'Durumum stabil',
    detail: 'Ben guvendeyim. Ulasabilirsen bana yaz veya ara.',
    icon: 'check-circle',
  },
  {
    key: 'injured',
    label: 'Yardim Lazim',
    short: 'Tibbi destek gerekli',
    detail: 'Yaraliyim ve yardima ihtiyacim var.',
    icon: 'medkit',
  },
  {
    key: 'trapped_ok',
    label: 'Enkaz Altindayim',
    short: 'Bilincim acik',
    detail: 'Enkaz altindayim. Bilincim acik, yardim bekliyorum.',
    icon: 'exclamation-circle',
  },
  {
    key: 'family_check',
    label: 'Yakinimi Kontrol Et',
    short: 'Durum kontrol mesaji',
    detail: 'Mumkunse aile bireylerini ve yakinlarimizi kontrol edin.',
    icon: 'users',
  },
];

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    safe: { flex: 1 },
    scrollPad: { padding: 18, paddingBottom: 118, gap: 16 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(t.glowBlue, 0.1),
      borderWidth: 1,
      borderColor: alpha(t.glowBlue, 0.18),
    },
    headerTitle: { fontSize: 30, fontWeight: '800', letterSpacing: -0.9, fontFamily: t.displayFont },
    headerLightRow: { flexDirection: 'row', gap: 6 },
    headerLight: { width: 7, height: 7, borderRadius: 999 },
    statusDeck: { gap: 14 },
    statusHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sirenToggle: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    infoTitle: { fontSize: 18, fontWeight: '700' },
    infoValue: { fontSize: 15, fontWeight: '600' },
    switchPill: {
      width: 52,
      height: 30,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 5,
      justifyContent: 'center',
      alignItems: 'flex-end',
    },
    switchDot: { width: 18, height: 18, borderRadius: 999 },
    fullButton: { marginTop: 4 },
    offlineCard: {
      borderWidth: 1,
      borderRadius: 20,
      padding: 14,
      gap: 8,
    },
    offlineHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    offlineTitle: { fontSize: 17, fontWeight: '800', flex: 1 },
    offlineSwitch: {
      width: 48,
      height: 28,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 5,
      justifyContent: 'center',
      alignItems: 'flex-end',
    },
    offlineCopy: { fontSize: 13, lineHeight: 19 },
    quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    quickCard: {
      width: '47%',
      borderWidth: 1,
      borderRadius: 22,
      padding: 16,
      gap: 8,
    },
    quickTitle: { fontSize: 15, fontWeight: '800' },
    quickText: { fontSize: 12, lineHeight: 17 },
    actionRow: { flexDirection: 'row', gap: 10 },
    flexButton: { flex: 1 },
    messageCard: { padding: 16 },
    messageText: { fontSize: 13, lineHeight: 19 },
    footerLink: { alignItems: 'center', paddingTop: 4 },
    footerLinkText: { fontSize: 14, fontWeight: '700' },
  });
}
