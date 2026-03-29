import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/context/AuthContext';
import { theme, type ThemeTokens } from '@/constants/theme';
import { askChatbot } from '@/lib/api';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

const STARTER_MESSAGES: Message[] = [
  {
    id: 'intro',
    role: 'assistant',
    text:
      'Deprem asistanina hos geldin. Risk, son depremler, hazirlik, acil durumda ne yapman gerektigi ve il bazli analizler konusunda yardimci olabilirim.',
  },
];

const SUGGESTIONS = [
  'Istanbul deprem riski nedir?',
  'Depremden sonra ilk 10 dakika ne yapmaliyim?',
  'Acil durum cantasinda neler olmali?',
  'Bulundugum bolgede son depremleri ozetle',
];

export default function AssistantScreen() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const t = theme[scheme];
  const styles = useMemo(() => makeStyles(t), [t]);
  const { apiBase, user } = useAuth();

  const sessionId = useRef(`mobile-${user?.username || 'guest'}-${Date.now()}`);
  const [messages, setMessages] = useState<Message[]>(STARTER_MESSAGES);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const sendPrompt = async (prompt: string) => {
    const clean = prompt.trim();
    if (!clean || busy) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: clean,
    };
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setBusy(true);

    const reply = await askChatbot(apiBase, clean, sessionId.current);
    setBusy(false);

    setMessages((current) => [
      ...current,
      {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: reply.ok && reply.reply ? reply.reply : 'Asistan su an yanit veremedi.',
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: t.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listPad}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <View style={[styles.hero, { backgroundColor: t.surface, borderColor: t.border }]}>
              <View style={styles.heroTop}>
                <FontAwesome name="magic" size={18} color={t.brandTab} />
                <Text style={[styles.heroTitle, { color: t.text }]}>Deprem Asistani</Text>
              </View>
              <Text style={[styles.heroSub, { color: t.textSecondary }]}>
                Ust seviye yonlendirme, hazirlik, il bazli risk sorulari ve acil durumda ne yapman
                gerektigi icin hizli sohbet alani.
              </Text>
            </View>
            <View style={styles.suggestionWrap}>
              {SUGGESTIONS.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => void sendPrompt(item)}
                  style={[styles.suggestionChip, { backgroundColor: t.surface, borderColor: t.border }]}>
                  <Text style={[styles.suggestionText, { color: t.text }]}>{item}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const mine = item.role === 'user';
          return (
            <View
              style={[
                styles.messageBubble,
                mine
                  ? { alignSelf: 'flex-end', backgroundColor: t.accent }
                  : { alignSelf: 'flex-start', backgroundColor: t.surface, borderColor: t.border, borderWidth: 1 },
              ]}>
              <Text style={[styles.messageRole, { color: mine ? 'rgba(255,255,255,0.9)' : t.textMuted }]}>
                {mine ? 'Sen' : 'Asistan'}
              </Text>
              <Text style={[styles.messageText, { color: mine ? '#fff' : t.text }]}>{item.text}</Text>
            </View>
          );
        }}
      />

      <View style={[styles.compose, { backgroundColor: t.surface, borderTopColor: t.border }]}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Deprem, risk, hazirlik veya acil durum sor..."
          placeholderTextColor={t.textMuted}
          multiline
          style={[
            styles.input,
            { color: t.text, borderColor: t.border, backgroundColor: t.surfaceMuted },
          ]}
        />
        <Pressable
          onPress={() => void sendPrompt(input)}
          disabled={busy}
          style={({ pressed }) => [
            styles.sendButton,
            { backgroundColor: pressed || busy ? t.accentRipple : t.accent },
          ]}>
          <Text style={[styles.sendText, { color: scheme === 'dark' ? t.onAccent : '#fff' }]}>
            {busy ? 'Bekle' : 'Sor'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1 },
    list: { flex: 1 },
    listPad: { padding: 16, paddingBottom: 120, gap: 12 },
    headerWrap: { gap: 12, marginBottom: 12 },
    hero: {
      borderRadius: 22,
      borderWidth: 1,
      padding: 18,
      gap: 10,
    },
    heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    heroTitle: { fontSize: 22, fontWeight: '800' },
    heroSub: { fontSize: 13, lineHeight: 19 },
    suggestionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    suggestionChip: {
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 9,
      maxWidth: '100%',
    },
    suggestionText: { fontSize: 12, fontWeight: '700' },
    messageBubble: {
      maxWidth: '88%',
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 10,
    },
    messageRole: { fontSize: 11, fontWeight: '700', marginBottom: 6 },
    messageText: { fontSize: 15, lineHeight: 21 },
    compose: {
      borderTopWidth: 1,
      padding: 14,
      gap: 8,
    },
    input: {
      borderWidth: 1,
      borderRadius: 14,
      minHeight: 72,
      textAlignVertical: 'top',
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
    },
    sendButton: {
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    sendText: { fontSize: 16, fontWeight: '800' },
  });
}
