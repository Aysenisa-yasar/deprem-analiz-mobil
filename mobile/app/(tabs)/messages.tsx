import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/context/AuthContext';
import { theme, type ThemeTokens } from '@/constants/theme';
import { fetchMessages, sendMessage, type ChatMessage } from '@/lib/api';
import {
  flushOfflineRelayQueue,
  getOfflineRelayQueue,
  queueOfflineRelayPacket,
} from '@/lib/offlineRelay';

const POLL_MS = 50_000;
const TAB_BAR_CLEARANCE = 58;

function formatMessageTime(createdAt: number): string {
  return new Date(createdAt * 1000).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MessagesScreen() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const t = theme[scheme];
  const styles = useMemo(() => makeStyles(t), [t]);
  const insets = useSafeAreaInsets();
  const composePadBottom = 14 + Math.max(insets.bottom, 8) + TAB_BAR_CLEARANCE;

  const { token, user, apiBase, ready } = useAuth();
  const [list, setList] = useState<ChatMessage[]>([]);
  const [toUser, setToUser] = useState('');
  const [body, setBody] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [queueBusy, setQueueBusy] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const listRef = useRef<ChatMessage[]>([]);
  listRef.current = list;

  useEffect(() => {
    if (user?.emergency_contact && !toUser.trim()) {
      setToUser(user.emergency_contact);
    }
  }, [toUser, user?.emergency_contact]);

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
  }, [token]);

  const mergeMessages = useCallback((prev: ChatMessage[], incoming: ChatMessage[]) => {
    const ids = new Set(prev.map((item) => item.id));
    const add = incoming.filter((item) => !ids.has(item.id));
    if (!add.length) return prev;
    return [...prev, ...add].sort((a, b) => a.id - b.id);
  }, []);

  useEffect(() => {
    if (!token) {
      setList([]);
      return;
    }
    if (!ready) return;

    setList([]);

    const poll = async () => {
      if (AppState.currentState !== 'active') return;
      const prev = listRef.current;
      const since = prev.length ? Math.max(...prev.map((item) => item.id)) : 0;
      try {
        const messages = await fetchMessages(apiBase, token, since);
        if (messages.length) setList((current) => mergeMessages(current, messages));
      } catch {
        /* offline */
      }
    };

    (async () => {
      setRefreshing(true);
      try {
        const initial = await fetchMessages(apiBase, token, 0);
        setList(initial);
      } finally {
        setRefreshing(false);
      }
    })();

    const intervalId = setInterval(() => {
      void poll();
    }, POLL_MS);

    return () => clearInterval(intervalId);
  }, [apiBase, mergeMessages, ready, token]);

  const onSend = async () => {
    if (!token || !user) return;
    setSendErr(null);

    const recipient = toUser.trim();
    const content = body.trim();
    if (!recipient || !content) {
      setSendErr('Kullanici adi ve mesaj gerekli.');
      return;
    }

    const result = await sendMessage(apiBase, token, recipient, content);
    if (!result.ok) {
      if (result.retryable) {
        await queueOfflineRelayPacket({
          toUsername: recipient,
          body: content,
          kind: 'chat',
        });
        const queue = await getOfflineRelayQueue();
        setQueuedCount(queue.length);
        setSendErr('Ag baglantisi yok gibi gorunuyor. Mesaj cihazda kuyruga alindi.');
        return;
      }
      setSendErr(result.message || 'Mesaj gonderilemedi.');
      return;
    }

    setBody('');
    const fresh = await fetchMessages(apiBase, token, 0);
    setList(fresh);
  };

  const onFlushQueue = async () => {
    if (!token) return;
    setQueueBusy(true);
    setSendErr(null);
    try {
      const result = await flushOfflineRelayQueue(apiBase, token);
      setQueuedCount(result.remaining);
      if (result.sent > 0) {
        const fresh = await fetchMessages(apiBase, token, 0);
        setList(fresh);
      }
      if (result.remaining > 0) {
        setSendErr(`Kuyrukta ${result.remaining} mesaj kaldi. Hala ag veya alici sorunu olabilir.`);
        return;
      }
      setSendErr(result.sent > 0 ? 'Kuyruktaki mesajlar gonderildi.' : 'Kuyruk zaten bos.');
    } finally {
      setQueueBusy(false);
    }
  };

  const onRefresh = async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      const fresh = await fetchMessages(apiBase, token, 0);
      setList(fresh);
    } finally {
      setRefreshing(false);
    }
  };

  if (!ready) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator size="large" color={t.accent} />
      </View>
    );
  }

  if (!token) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <View style={[styles.lockCircle, { backgroundColor: t.surfaceMuted }]}>
          <FontAwesome name="comments" size={32} color={t.accent} />
        </View>
        <Text style={[styles.hintTitle, { color: t.text }]}>Mesajlar</Text>
        <Text style={[styles.hint, { color: t.textSecondary }]}>
          Hesapla giris yaptiginda kullanici adiyla birebir mesajlasabilir ve acil durum
          bildirimlerini gorebilirsin.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: t.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}>
      <View style={styles.topPad}>
        <Text style={[styles.head, { color: t.text }]}>Sohbet</Text>
        <Text style={[styles.headSub, { color: t.textMuted }]}>
          Arka plan yenileme aktif degil. Ekran acikken yaklasik {Math.round(POLL_MS / 1000)} sn
          arayla kontrol edilir.
        </Text>
        <Pressable
          onPress={() => router.push('/mesh' as never)}
          style={[styles.meshLink, { backgroundColor: t.surfaceMuted }]}>
          <FontAwesome name="wifi" size={14} color={t.brandTab} />
          <Text style={[styles.meshLinkText, { color: t.text }]}>Yakin ag ekranini ac</Text>
        </Pressable>
        <View style={[styles.offlineBanner, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={styles.offlineBannerTextWrap}>
            <Text style={[styles.offlineTitle, { color: t.text }]}>Offline kuyruk modu</Text>
            <Text style={[styles.offlineBody, { color: t.textSecondary }]}>
              Internet yoksa mesajlar cihazda saklanir. Gercek operatorsuz/ internetsiz cihazlar
              arasi aktarim icin native mesh altyapisi gerekiyor.
            </Text>
            <Text style={[styles.offlineMeta, { color: t.textMuted }]}>
              Kuyruktaki mesaj: {queuedCount}
            </Text>
          </View>
          <Pressable
            onPress={() => void onFlushQueue()}
            disabled={queueBusy || queuedCount === 0}
            style={({ pressed }) => [
              styles.flushBtn,
              {
                backgroundColor:
                  queueBusy || queuedCount === 0
                    ? t.surfaceMuted
                    : pressed
                      ? t.accentRipple
                      : t.accent,
              },
            ]}>
            <Text style={[styles.flushBtnText, { color: queueBusy || queuedCount === 0 ? t.textMuted : '#fff' }]}>
              {queueBusy ? 'Deneniyor' : 'Tekrar gonder'}
            </Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={list}
        keyExtractor={(item) => String(item.id)}
        removeClippedSubviews={Platform.OS === 'android'}
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: 24 + composePadBottom }]}
        refreshing={refreshing}
        onRefresh={onRefresh}
        renderItem={({ item }) => {
          const mine = item.from_user.toLowerCase() === user?.username.toLowerCase();
          const alert = item.kind === 'location_alert';
          return (
            <View
              style={[
                styles.bubble,
                mine ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' },
                mine
                  ? { backgroundColor: t.accent, borderTopRightRadius: 4 }
                  : {
                      backgroundColor: t.surface,
                      borderColor: t.border,
                      borderWidth: 1,
                      borderTopLeftRadius: 4,
                    },
                alert && !mine ? { borderColor: t.warn } : null,
              ]}>
              <Text
                style={[
                  styles.meta,
                  { color: mine ? 'rgba(255,255,255,0.88)' : t.textMuted },
                ]}>
                {mine ? 'Sen' : item.from_user}
                {' -> '}
                {item.to_user}
                {alert ? ' · konum uyarisi' : ''} · {formatMessageTime(item.created_at)}
              </Text>
              <Text style={[styles.bodyText, { color: mine ? '#fff' : t.text }]}>
                {item.body}
              </Text>
            </View>
          );
        }}
      />

      {sendErr ? <Text style={[styles.err, { color: t.danger }]}>{sendErr}</Text> : null}

      <View
        style={[
          styles.compose,
          { backgroundColor: t.surface, borderTopColor: t.border, paddingBottom: composePadBottom },
        ]}>
        {user?.emergency_contact ? (
          <Pressable
            onPress={() => setToUser(user.emergency_contact ?? '')}
            style={[styles.contactChip, { backgroundColor: t.surfaceMuted }]}>
            <FontAwesome name="bolt" size={12} color={t.brandTab} />
            <Text style={[styles.contactChipText, { color: t.text }]}>
              Acil kisi: @{user.emergency_contact}
            </Text>
          </Pressable>
        ) : null}

        <TextInput
          placeholder="Alici kullanici adi"
          placeholderTextColor={t.textMuted}
          autoCapitalize="none"
          style={[
            styles.input,
            { color: t.text, borderColor: t.border, backgroundColor: t.surfaceMuted },
          ]}
          value={toUser}
          onChangeText={setToUser}
        />
        <TextInput
          placeholder="Mesajiniz..."
          placeholderTextColor={t.textMuted}
          style={[
            styles.input,
            styles.inputMulti,
            { color: t.text, borderColor: t.border, backgroundColor: t.surfaceMuted },
          ]}
          value={body}
          onChangeText={setBody}
          multiline
        />
        <Pressable
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: pressed ? t.accentRipple : t.accent, opacity: pressed ? 0.95 : 1 },
          ]}
          onPress={() => void onSend()}>
          <Text style={[styles.btnText, { color: scheme === 'dark' ? t.onAccent : '#fff' }]}>
            Gonder
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    flex: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28 },
    lockCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    hintTitle: { fontSize: 20, fontWeight: '700' },
    hint: { marginTop: 8, textAlign: 'center', lineHeight: 22, maxWidth: 280 },
    topPad: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
    head: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
    headSub: { fontSize: 12, marginTop: 4, lineHeight: 18 },
    meshLink: {
      marginTop: 10,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
    },
    meshLinkText: { fontSize: 12, fontWeight: '800' },
    offlineBanner: {
      marginTop: 12,
      borderWidth: 1,
      borderRadius: 18,
      padding: 14,
      gap: 10,
    },
    offlineBannerTextWrap: { gap: 4 },
    offlineTitle: { fontSize: 14, fontWeight: '800' },
    offlineBody: { fontSize: 12, lineHeight: 18 },
    offlineMeta: { fontSize: 12, fontWeight: '700' },
    flushBtn: {
      alignItems: 'center',
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    flushBtnText: { fontSize: 13, fontWeight: '800' },
    list: { flex: 1 },
    listContent: {},
    err: { paddingHorizontal: 16, marginBottom: 4, fontSize: 13 },
    bubble: {
      marginHorizontal: 14,
      marginBottom: 10,
      padding: 14,
      borderRadius: 18,
      maxWidth: '88%',
    },
    meta: { fontSize: 11, marginBottom: 6, fontWeight: '500' },
    bodyText: { fontSize: 15, lineHeight: 21 },
    compose: { padding: 14, paddingTop: 14, borderTopWidth: 1, gap: 8 },
    contactChip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      gap: 6,
    },
    contactChipText: { fontSize: 12, fontWeight: '700' },
    input: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
    },
    inputMulti: { minHeight: 72, textAlignVertical: 'top' },
    btn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
    btnText: { fontWeight: '700', fontSize: 16 },
  });
}
