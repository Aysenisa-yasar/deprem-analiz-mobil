import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import type { ComponentProps } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/context/AuthContext';
import { theme, type ThemeTokens } from '@/constants/theme';
import { startSirenLoop, stopSirenLoop } from '@/lib/alertAudio';
import { sendMessage } from '@/lib/api';
import {
  flushOfflineRelayQueue,
  getOfflineRelayQueue,
  queueOfflineRelayPacket,
} from '@/lib/offlineRelay';

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

  const headerTint = t.brandOnHeader;
  const bodyBg = scheme === 'dark' ? '#1c1917' : '#fff7ed';
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
      setMessage('Bu ozellik icin giris yapip acil kisi tanimlaman gerekiyor.');
      router.push('/settings');
      return;
    }

    setBusyKey(item.key);
    setMessage(null);

    let locationLine = 'Konum paylasilamadi.';
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        locationLine = `Konum: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      }
    } catch {
      /* location optional */
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
        setMessage(`Kuyruktaki ${result.remaining} mesaj henuz gonderilemedi.`);
        return;
      }
      setMessage(result.sent > 0 ? 'Kuyruktaki acil mesajlar gonderildi.' : 'Kuyruk bos.');
    } finally {
      setQueueBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: bodyBg }]}>
      <SafeAreaView edges={['top']} style={[styles.hero, { backgroundColor: t.brandHeader }]}>
        <FontAwesome name="life-ring" size={28} color={headerTint} />
        <Text style={[styles.heroTitle, { color: headerTint }]}>Acil yardim</Text>
        <Text style={[styles.heroSub, { color: headerTint }]}>
          Siren, hizli durum mesaji ve 112 aramasi ayni ekranda. Acil kisi ayari Ayarlar
          sekmesinde yonetilir.
        </Text>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={styles.scrollPad}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.cardTitle, { color: t.text }]}>Deprem aninda</Text>
          <Text style={[styles.cardBody, { color: t.textSecondary }]}>
            Sireni sadece guvenli ortamda kullan. Tekrar dokununca veya uygulama arka plana
            gidince durur.
          </Text>
          <Pressable
            onPress={() => void toggleSiren()}
            style={({ pressed }) => [styles.sirenOuter, { opacity: pressed ? 0.92 : 1 }]}>
            <View
              style={[
                styles.sirenInner,
                { backgroundColor: sirenOn ? '#991b1b' : t.danger },
              ]}>
              <FontAwesome name={sirenOn ? 'stop' : 'volume-up'} size={36} color="#fff" />
            </View>
          </Pressable>
          <Text style={[styles.sirenCap, { color: t.text }]}>
            {sirenOn ? 'Durdurmak icin dokun' : 'Acil siren baslat'}
          </Text>
        </View>

        <View style={[styles.contactBanner, { backgroundColor: t.surface, borderColor: t.border }]}>
          <FontAwesome name="user-circle" size={18} color={t.brandTab} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.contactTitle, { color: t.text }]}>Acil kisi</Text>
            <Text style={[styles.contactBody, { color: t.textSecondary }]}>
              {emergencyContact
                ? `Hizli durum mesajlari @${emergencyContact} kullanicisina gider.`
                : 'Durum mesajlari icin once bir acil kisi tanimla.'}
            </Text>
          </View>
          <Pressable onPress={() => router.push('/settings')}>
            <Text style={[styles.contactLink, { color: t.brandTab }]}>Ayarla</Text>
          </Pressable>
        </View>

        <View style={[styles.queueCard, { backgroundColor: t.surface, borderColor: t.border }]}>
          <FontAwesome name="exchange" size={18} color={t.brandTab} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.contactTitle, { color: t.text }]}>Offline acil kuyruk</Text>
            <Text style={[styles.contactBody, { color: t.textSecondary }]}>
              Ag yokken SOS mesajlari cihazda saklanir. Gercek internetsiz cihazlar arasi iletisim
              icin native mesh altyapisi gerekiyor.
            </Text>
            <Text style={[styles.queueMeta, { color: t.textMuted }]}>Kuyruktaki mesaj: {queuedCount}</Text>
          </View>
          <Pressable
            onPress={() => router.push('/mesh' as never)}
            style={({ pressed }) => [
              styles.queueBtn,
              { backgroundColor: pressed ? t.accentRipple : t.accent },
            ]}>
            <Text style={[styles.queueBtnText, { color: '#fff' }]}>Mesh</Text>
          </Pressable>
          <Pressable
            onPress={() => void flushQueue()}
            disabled={queueBusy || queuedCount === 0}
            style={({ pressed }) => [
              styles.queueBtn,
              {
                backgroundColor:
                  queueBusy || queuedCount === 0
                    ? t.surfaceMuted
                    : pressed
                      ? t.accentRipple
                      : t.accent,
              },
            ]}>
            <Text style={[styles.queueBtnText, { color: queueBusy || queuedCount === 0 ? t.textMuted : '#fff' }]}>
              {queueBusy ? 'Dene' : 'Yolla'}
            </Text>
          </Pressable>
        </View>

        <Text style={[styles.sectionLbl, { color: t.textMuted }]}>Durumunu hemen ilet</Text>
        <View style={styles.grid}>
          {STATUS_ITEMS.map((item) => {
            const active = busyKey === item.key;
            return (
              <Pressable
                key={item.key}
                style={({ pressed }) => [
                  styles.gridBtn,
                  { backgroundColor: t.listCard, borderColor: t.border, opacity: pressed || active ? 0.9 : 1 },
                ]}
                disabled={active}
                onPress={() => void sendStatus(item)}>
                <FontAwesome name={item.icon} size={20} color={t.brandTab} />
                <Text style={[styles.gridTxt, { color: t.text }]}>{item.label}</Text>
                <Text style={[styles.gridSub, { color: t.textSecondary }]}>
                  {active ? 'Gonderiliyor...' : item.short}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {message ? (
          <Text style={[styles.infoBox, { color: t.textSecondary, backgroundColor: t.surface }]}>
            {message}
          </Text>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.call112,
            { backgroundColor: t.danger, opacity: pressed ? 0.9 : 1 },
          ]}
          onPress={() => Linking.openURL('tel:112')}>
          <FontAwesome name="phone" size={20} color="#fff" />
          <Text style={styles.call112Txt}>112 Ara</Text>
        </Pressable>

        <Pressable style={styles.linkOut} onPress={() => router.push('/messages')}>
          <Text style={[styles.linkOutTxt, { color: t.accent }]}>Mesajlara git</Text>
        </Pressable>
      </ScrollView>
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
    icon: 'thumbs-up',
  },
  {
    key: 'injured',
    label: 'Yaraliyim',
    short: 'Tibbi destek gerekli',
    detail: 'Yaraliyim ve yardima ihtiyacim var.',
    icon: 'medkit',
  },
  {
    key: 'trapped_ok',
    label: 'Enkaz altindayim',
    short: 'Bilincim acik',
    detail: 'Enkaz altindayim. Bilincim acik, yardim bekliyorum.',
    icon: 'check',
  },
  {
    key: 'trapped_injured',
    label: 'Enkaz altindayim ve yaraliyim',
    short: 'Acil destek gerekli',
    detail: 'Enkaz altindayim ve yaraliyim. Lufen acil destek iste.',
    icon: 'exclamation-triangle',
  },
  {
    key: 'lost',
    label: 'Kayboldum',
    short: 'Yer tespiti gerekiyor',
    detail: 'Bulundugum yerde yonlendirmeye ihtiyacim var.',
    icon: 'street-view',
  },
  {
    key: 'family_check',
    label: 'Yakininizi kontrol edin',
    short: 'Durum kontrol mesaji',
    detail: 'Mumkunse aile bireylerini ve yakinlarimizi kontrol edin.',
    icon: 'users',
  },
];

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1 },
    hero: {
      paddingHorizontal: 20,
      paddingBottom: 20,
      alignItems: 'center',
    },
    heroTitle: { fontSize: 24, fontWeight: '800', marginTop: 10 },
    heroSub: {
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 20,
      marginTop: 8,
      opacity: 0.95,
      maxWidth: 320,
    },
    scrollPad: { padding: 16, paddingBottom: 120 },
    card: {
      borderRadius: 20,
      borderWidth: 1,
      padding: 18,
      marginBottom: 20,
      alignItems: 'center',
    },
    cardTitle: { fontSize: 18, fontWeight: '800', alignSelf: 'flex-start' },
    cardBody: { fontSize: 13, lineHeight: 18, marginTop: 8, alignSelf: 'stretch' },
    sirenOuter: { marginTop: 20, marginBottom: 8 },
    sirenInner: {
      width: 88,
      height: 88,
      borderRadius: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sirenCap: { fontSize: 13, fontWeight: '600' },
    contactBanner: {
      borderRadius: 18,
      borderWidth: 1,
      padding: 14,
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
      marginBottom: 18,
    },
    contactTitle: { fontSize: 15, fontWeight: '800' },
    contactBody: { fontSize: 12, lineHeight: 18, marginTop: 2 },
    contactLink: { fontSize: 14, fontWeight: '800' },
    queueCard: {
      borderRadius: 18,
      borderWidth: 1,
      padding: 14,
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
      marginBottom: 18,
    },
    queueMeta: { fontSize: 12, fontWeight: '700', marginTop: 6 },
    queueBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    queueBtnText: { fontSize: 13, fontWeight: '800' },
    sectionLbl: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginBottom: 10,
      marginLeft: 4,
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    gridBtn: {
      width: '47%',
      borderRadius: 16,
      borderWidth: 1,
      paddingVertical: 14,
      paddingHorizontal: 10,
      gap: 8,
    },
    gridTxt: { fontSize: 12, fontWeight: '700', lineHeight: 16 },
    gridSub: { fontSize: 11, lineHeight: 15 },
    infoBox: {
      marginTop: 16,
      borderRadius: 14,
      padding: 14,
      fontSize: 13,
      lineHeight: 18,
      overflow: 'hidden',
    },
    call112: {
      marginTop: 22,
      borderRadius: 16,
      paddingVertical: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    call112Txt: { color: '#fff', fontSize: 17, fontWeight: '800' },
    linkOut: { marginTop: 18, alignItems: 'center' },
    linkOutTxt: { fontSize: 15, fontWeight: '600' },
  });
}
