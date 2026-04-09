import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarOrb, CosmicBackdrop, CosmicLabel, GlassCard, GlowButton, alpha } from '@/components/cosmic';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/context/AuthContext';
import { theme, type ThemeTokens } from '@/constants/theme';
import {
  flushOfflineRelayQueue,
  getOfflineRelayQueue,
  queueOfflineRelayPacket,
} from '@/lib/offlineRelay';
import { ACTIVE_TRANSPORT } from '@/lib/transport';
import { fetchMessages, sendMessage } from '@/services/messageService';
import type { ChatMessage } from '@/services/types';

const POLL_MS = 50_000;
const TAB_BAR_CLEARANCE = 58;

const QUICK_ACTIONS = ['Guvendeyim', 'Yardim lazim', 'Konumumu paylas'];

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
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const safeBottomInset = Math.max(insets.bottom, 8);
  const composePadBottom = keyboardVisible
    ? 12 + safeBottomInset
    : 14 + safeBottomInset + TAB_BAR_CLEARANCE;
  const listPadBottom = keyboardVisible ? 24 + 12 + safeBottomInset : 24 + composePadBottom;

  const { token, user, apiBase, ready } = useAuth();
  const [list, setList] = useState<ChatMessage[]>([]);
  const [toUser, setToUser] = useState('');
  const [body, setBody] = useState('');
  const [search, setSearch] = useState('');
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
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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

    void (async () => {
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

  const filteredList = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('tr-TR');
    if (!query) return list;
    return list.filter((item) =>
      `${item.from_user} ${item.to_user} ${item.body}`.toLocaleLowerCase('tr-TR').includes(query)
    );
  }, [list, search]);

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
        setSendErr('Ag yok gibi gorunuyor. Mesaj cihazda kuyruklandi.');
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

  const applyQuickAction = (label: string) => {
    if (label === 'Konumumu paylas') {
      setBody('Konumumu paylasmam gerekiyor. Musaitsen bana donus yap.');
      return;
    }
    setBody(label);
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
      <View style={styles.root}>
        <CosmicBackdrop t={t} />
        <View style={[styles.center, styles.lockPad]}>
          <GlassCard t={t} tone="cool" style={styles.lockCard}>
            <AvatarOrb t={t} label="MS" size={62} />
            <Text style={[styles.lockTitle, { color: t.text }]}>Acil Mesajlar</Text>
            <Text style={[styles.lockText, { color: t.textSecondary }]}>
              Hesabinla giris yaptiginda birebir mesajlasabilir, durum kartlarini kaydedebilir ve
              kuyruklanan iletileri yonetebilirsin.
            </Text>
          </GlassCard>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CosmicBackdrop t={t} />
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 74 : 0}>
        <View style={styles.topPad}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.push('/(tabs)/emergency')} style={styles.headerBack}>
              <FontAwesome name="arrow-left" size={16} color={t.brandTab} />
            </Pressable>
            <Text style={[styles.head, { color: t.text }]}>Acil Mesajlar</Text>
            <View style={styles.headerIcons}>
              <FontAwesome name="search" size={18} color={t.textMuted} />
              <FontAwesome name="user-circle-o" size={18} color={t.textMuted} />
            </View>
          </View>

          <View style={[styles.searchWrap, { backgroundColor: t.inputBg, borderColor: t.border }]}>
            <FontAwesome name="search" size={16} color={t.textMuted} />
            <TextInput
              placeholder="Mesajlarda ara..."
              placeholderTextColor={t.textMuted}
              value={search}
              onChangeText={setSearch}
              style={[styles.searchInput, { color: t.text }]}
            />
          </View>

          <GlassCard t={t} tone="cool" style={styles.statusCard}>
            <View style={styles.statusHead}>
              <View>
                <Text style={[styles.statusTitle, { color: t.text }]}>Offline Senkron</Text>
                <Text style={[styles.statusBody, { color: t.textSecondary }]}>
                  {ACTIVE_TRANSPORT.summary}
                </Text>
              </View>
              <CosmicLabel t={t}>{queuedCount} kuyruk</CosmicLabel>
            </View>
            <View style={styles.statusMetaRow}>
              <Text style={[styles.statusMeta, { color: t.textMuted }]}>
                Tasiyici: {ACTIVE_TRANSPORT.title}. {ACTIVE_TRANSPORT.meshDisclaimer}
              </Text>
              <GlowButton
                t={t}
                label={queueBusy ? 'Deneniyor' : 'Tekrar Gonder'}
                onPress={() => void onFlushQueue()}
                disabled={queueBusy || queuedCount === 0}
                style={styles.flushButton}
              />
            </View>
          </GlassCard>
        </View>

        <FlatList
          data={filteredList}
          keyExtractor={(item) => String(item.id)}
          removeClippedSubviews={Platform.OS === 'android'}
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingBottom: listPadBottom }]}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          refreshing={refreshing}
          onRefresh={onRefresh}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: t.textSecondary }]}>
              Konusma akisi burada gorunecek.
            </Text>
          }
          renderItem={({ item }) => {
            const mine = item.from_user.toLowerCase() === user?.username.toLowerCase();
            const alert = item.kind === 'location_alert';
            const senderLabel = (mine ? item.to_user : item.from_user).slice(0, 2).toUpperCase();

            return (
              <View style={[styles.messageRow, mine && styles.messageRowMine]}>
                {!mine ? <AvatarOrb t={t} label={senderLabel} size={40} /> : null}
                <View
                  style={[
                    styles.messageCard,
                    mine
                      ? {
                          backgroundColor: alpha(t.glowBlue, 0.18),
                          borderColor: alpha(t.glowBlue, 0.28),
                        }
                      : {
                          backgroundColor: alert ? alpha(t.glowOrange, 0.1) : t.panel,
                          borderColor: alert ? alpha(t.glowOrange, 0.24) : t.border,
                        },
                  ]}>
                  <View style={styles.messageMetaRow}>
                    <Text style={[styles.messageName, { color: mine ? '#eef7ff' : t.text }]}>
                      {mine ? 'Sen' : item.from_user}
                    </Text>
                    <Text
                      style={[
                        styles.messageTime,
                        { color: mine ? 'rgba(255,255,255,0.72)' : t.textMuted },
                      ]}>
                      {formatMessageTime(item.created_at)}
                    </Text>
                  </View>
                  <Text
                    style={[styles.messageBody, { color: mine ? '#eef7ff' : t.textSecondary }]}>
                    {item.body}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        <View
          style={[
            styles.compose,
            {
              backgroundColor: alpha(t.overlayStrong, 0.98),
              borderTopColor: t.border,
              paddingBottom: composePadBottom,
            },
          ]}>
          {sendErr ? <Text style={[styles.errorText, { color: t.danger }]}>{sendErr}</Text> : null}

          <View style={styles.quickRow}>
            {QUICK_ACTIONS.map((item) => (
              <Pressable
                key={item}
                onPress={() => applyQuickAction(item)}
                style={[
                  styles.quickChip,
                  {
                    backgroundColor: alpha(t.glowBlue, 0.1),
                    borderColor: alpha(t.glowBlue, 0.2),
                  },
                ]}>
                <Text style={[styles.quickChipText, { color: t.text }]}>{item}</Text>
              </Pressable>
            ))}
          </View>

          {user?.emergency_contact ? (
            <Pressable
              onPress={() => setToUser(user.emergency_contact ?? '')}
              style={[
                styles.contactChip,
                {
                  backgroundColor: alpha(t.glowOrange, 0.1),
                  borderColor: alpha(t.glowOrange, 0.22),
                },
              ]}>
              <FontAwesome name="shield" size={12} color={t.warn} />
              <Text style={[styles.contactChipText, { color: t.text }]}>
                Acil Yardim Grubu: @{user.emergency_contact}
              </Text>
            </Pressable>
          ) : null}

          <TextInput
            placeholder="Alici kullanici adi"
            placeholderTextColor={t.textMuted}
            autoCapitalize="none"
            style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.inputBg }]}
            value={toUser}
            onChangeText={setToUser}
          />
          <View style={styles.composeRow}>
            <TextInput
              placeholder="Mesajinizi yazin..."
              placeholderTextColor={t.textMuted}
              style={[
                styles.input,
                styles.inputMulti,
                { color: t.text, borderColor: t.border, backgroundColor: t.inputBg },
              ]}
              value={body}
              onChangeText={setBody}
              multiline
            />
            <Pressable
              onPress={() => void onSend()}
              style={({ pressed }) => [
                styles.sendFab,
                { backgroundColor: pressed ? t.accentRipple : t.accent },
              ]}>
              <FontAwesome name="send" size={16} color={scheme === 'dark' ? t.onAccent : '#fff'} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    lockPad: { padding: 22 },
    lockCard: { alignItems: 'center', gap: 12, padding: 22 },
    lockTitle: { fontSize: 26, fontWeight: '800', fontFamily: t.displayFont },
    lockText: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
    topPad: { paddingHorizontal: 18, paddingTop: 8, gap: 12 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerBack: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: alpha(t.glowBlue, 0.1),
      borderWidth: 1,
      borderColor: alpha(t.glowBlue, 0.18),
    },
    head: { fontSize: 30, fontWeight: '800', letterSpacing: -0.9, fontFamily: t.displayFont },
    headerIcons: { flexDirection: 'row', gap: 12 },
    searchWrap: {
      minHeight: 52,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      gap: 10,
    },
    searchInput: { flex: 1, fontSize: 15 },
    statusCard: { gap: 12 },
    statusHead: { gap: 6 },
    statusTitle: { fontSize: 18, fontWeight: '800' },
    statusBody: { fontSize: 13, lineHeight: 19 },
    statusMetaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    statusMeta: { fontSize: 12, fontWeight: '700', flex: 1 },
    flushButton: { minWidth: 132 },
    list: { flex: 1 },
    listContent: { paddingTop: 18, paddingHorizontal: 18 },
    emptyText: { textAlign: 'center', marginTop: 36, fontSize: 15 },
    messageRow: { flexDirection: 'row', gap: 10, marginBottom: 12, alignItems: 'flex-end' },
    messageRowMine: { justifyContent: 'flex-end' },
    messageCard: {
      maxWidth: '82%',
      borderWidth: 1,
      borderRadius: 22,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 8,
    },
    messageMetaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 10,
      alignItems: 'center',
    },
    messageName: { fontSize: 14, fontWeight: '800' },
    messageTime: { fontSize: 12, fontWeight: '600' },
    messageBody: { fontSize: 15, lineHeight: 22 },
    compose: { borderTopWidth: 1, paddingHorizontal: 14, paddingTop: 12, gap: 10 },
    errorText: { fontSize: 13, lineHeight: 18 },
    quickRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    quickChip: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    quickChipText: { fontSize: 12, fontWeight: '700' },
    contactChip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 8,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    contactChipText: { fontSize: 12, fontWeight: '700' },
    input: {
      minHeight: 50,
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 16,
      fontSize: 15,
    },
    composeRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
    inputMulti: {
      flex: 1,
      minHeight: 64,
      textAlignVertical: 'top',
      paddingTop: 14,
      paddingBottom: 14,
    },
    sendFab: {
      width: 52,
      height: 52,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
  });
}
