import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { fetchMessages, sendMessage, type ChatMessage } from '@/lib/api';

export default function MesajlarScreen() {
  const { token, user, apiBase, ready } = useAuth();
  const [list, setList] = useState<ChatMessage[]>([]);
  const [toUser, setToUser] = useState('');
  const [body, setBody] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const listRef = useRef<ChatMessage[]>([]);
  listRef.current = list;

  const mergeMessages = useCallback((prev: ChatMessage[], incoming: ChatMessage[]) => {
    const ids = new Set(prev.map((m) => m.id));
    const add = incoming.filter((m) => !ids.has(m.id));
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
      const prev = listRef.current;
      const since = prev.length ? Math.max(...prev.map((m) => m.id)) : 0;
      try {
        const msg = await fetchMessages(apiBase, token, since);
        if (msg.length) setList((p) => mergeMessages(p, msg));
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

    const id = setInterval(poll, 8000);
    return () => clearInterval(id);
  }, [ready, token, apiBase, mergeMessages]);

  const onSend = async () => {
    if (!token || !user) return;
    setSendErr(null);
    const u = toUser.trim();
    const b = body.trim();
    if (!u || !b) {
      setSendErr('Kullanıcı adı ve mesaj gerekli');
      return;
    }
    const r = await sendMessage(apiBase, token, u, b);
    if (!r.ok) {
      setSendErr(r.message || 'Gönderilemedi');
      return;
    }
    setBody('');
    const fresh = await fetchMessages(apiBase, token, 0);
    setList(fresh);
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
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!token) {
    return (
      <View style={styles.center}>
        <FontAwesome name="lock" size={40} color="#71717a" />
        <Text style={styles.hint}>Mesajlaşmak için Ayarlar sekmesinden giriş yapın.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}>
      <View style={styles.container}>
        <Text style={styles.head}>Gelen / giden</Text>
        <FlatList
          data={list}
          keyExtractor={(m) => String(m.id)}
          refreshing={refreshing}
          onRefresh={onRefresh}
          renderItem={({ item }) => {
            const mine = item.from_user.toLowerCase() === user?.username.toLowerCase();
            return (
              <View
                style={[
                  styles.bubble,
                  mine ? styles.bubbleMine : styles.bubbleOther,
                ]}>
                <Text style={styles.meta}>
                  {mine ? 'Sen' : item.from_user} → {item.to_user}
                  {item.kind === 'location_alert' ? ' · konum uyarısı' : ''}
                </Text>
                <Text style={styles.bodyText}>{item.body}</Text>
              </View>
            );
          }}
        />
        {sendErr ? <Text style={styles.err}>{sendErr}</Text> : null}
        <View style={styles.compose}>
          <TextInput
            placeholder="Alıcı kullanıcı adı"
            placeholderTextColor="#a1a1aa"
            autoCapitalize="none"
            style={styles.input}
            value={toUser}
            onChangeText={setToUser}
          />
          <TextInput
            placeholder="Mesaj yazın"
            placeholderTextColor="#a1a1aa"
            style={[styles.input, styles.inputMulti]}
            value={body}
            onChangeText={setBody}
            multiline
          />
          <Pressable style={styles.btn} onPress={onSend}>
            <Text style={styles.btnText}>Gönder</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, paddingTop: 12, backgroundColor: '#f4f4f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  hint: { marginTop: 12, textAlign: 'center', color: '#52525b' },
  head: { fontSize: 18, fontWeight: '700', paddingHorizontal: 16, marginBottom: 8 },
  err: { color: '#b91c1c', paddingHorizontal: 16 },
  bubble: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    maxWidth: '92%',
  },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: '#dbeafe' },
  bubbleOther: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e4e4e7' },
  meta: { fontSize: 11, color: '#71717a', marginBottom: 4 },
  bodyText: { fontSize: 15, color: '#18181b' },
  compose: { padding: 12, borderTopWidth: 1, borderTopColor: '#e4e4e7', backgroundColor: '#fafafa' },
  input: {
    borderWidth: 1,
    borderColor: '#d4d4d8',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#fff',
    fontSize: 15,
  },
  inputMulti: { minHeight: 64, textAlignVertical: 'top' },
  btn: { backgroundColor: '#2563eb', padding: 14, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
