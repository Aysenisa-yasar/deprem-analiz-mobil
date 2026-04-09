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

import { CosmicBackdrop, CosmicLabel, GlassCard, GlowButton, alpha } from '@/components/cosmic';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/context/AuthContext';
import { theme, type ThemeTokens } from '@/constants/theme';
import { askChatbot } from '@/services/assistantService';

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
      'Deprem asistanına hoş geldin. Risk, son depremler, hazırlık, acil durumda ne yapman gerektiği ve il bazlı analizler konusunda yardımcı olabilirim.',
  },
];

const SUGGESTIONS = [
  'İstanbul deprem riski nedir?',
  'Depremden sonra ilk 10 dakika ne yapmalıyım?',
  'Acil durum çantasında neler olmalı?',
  'Bulunduğum bölgede son depremleri özetle',
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

    let reply: Awaited<ReturnType<typeof askChatbot>>;
    try {
      reply = await askChatbot(apiBase, clean, sessionId.current);
    } catch {
      reply = { ok: false, message: 'Asistan isteği tamamlanamadı.' };
    }
    setBusy(false);

    setMessages((current) => [
      ...current,
      {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: reply.ok && reply.reply ? reply.reply : 'Asistan şu an yanıt veremedi.',
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <CosmicBackdrop t={t} />
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listPad}
          ListHeaderComponent={
            <View style={styles.headerWrap}>
              <GlassCard t={t} tone="cool" style={styles.hero}>
                <CosmicLabel t={t}>ai briefing</CosmicLabel>
                <View style={styles.heroTop}>
                  <FontAwesome name="magic" size={18} color={t.brandTab} />
                  <Text style={[styles.heroTitle, { color: t.text }]}>Deprem Asistanı</Text>
                </View>
                <Text style={[styles.heroSub, { color: t.textSecondary }]}>
                  Risk özeti, hazırlık önerileri, il bazlı yorumlar ve acil durum yönlendirmesi için
                  hızlı sohbet alanı.
                </Text>
              </GlassCard>

              <View style={styles.suggestionWrap}>
                {SUGGESTIONS.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => void sendPrompt(item)}
                    style={[styles.suggestionChip, { backgroundColor: alpha(t.glowBlue, 0.10), borderColor: alpha(t.glowBlue, 0.20) }]}>
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
                    ? { alignSelf: 'flex-end', backgroundColor: alpha(t.glowBlue, 0.18), borderColor: alpha(t.glowBlue, 0.28) }
                    : { alignSelf: 'flex-start', backgroundColor: t.panel, borderColor: t.border },
                ]}>
                <Text style={[styles.messageRole, { color: mine ? '#dff6ff' : t.textMuted }]}>
                  {mine ? 'Sen' : 'Asistan'}
                </Text>
                <Text style={[styles.messageText, { color: mine ? '#eef7ff' : t.textSecondary }]}>
                  {item.text}
                </Text>
              </View>
            );
          }}
        />

        <View style={[styles.compose, { backgroundColor: alpha(t.overlayStrong, 0.98), borderTopColor: t.border }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Deprem, risk, hazırlık veya acil durum sor..."
            placeholderTextColor={t.textMuted}
            multiline
            style={[
              styles.input,
              { color: t.text, borderColor: t.border, backgroundColor: t.inputBg },
            ]}
          />
          <GlowButton
            t={t}
            label={busy ? 'Bekle...' : 'Sor'}
            onPress={() => void sendPrompt(input)}
            disabled={busy}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    list: { flex: 1 },
    listPad: { padding: 18, paddingBottom: 120, gap: 12 },
    headerWrap: { gap: 12, marginBottom: 12 },
    hero: { gap: 10 },
    heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    heroTitle: { fontSize: 26, fontWeight: '800', fontFamily: t.displayFont },
    heroSub: { fontSize: 14, lineHeight: 21 },
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
      borderRadius: 22,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 10,
    },
    messageRole: { fontSize: 11, fontWeight: '700', marginBottom: 6 },
    messageText: { fontSize: 15, lineHeight: 22 },
    compose: {
      borderTopWidth: 1,
      padding: 14,
      gap: 10,
    },
    input: {
      borderWidth: 1,
      borderRadius: 16,
      minHeight: 82,
      textAlignVertical: 'top',
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 15,
    },
  });
}
