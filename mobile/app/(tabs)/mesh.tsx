import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import { theme, type ThemeTokens } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useMesh } from '@/context/MeshContext';

function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MeshScreen() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const t = theme[scheme];
  const styles = useMemo(() => makeStyles(t), [t]);
  const { user } = useAuth();
  const {
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
    startNode,
    stopNode,
    askConnect,
    acceptInvite,
    rejectInvite,
    sendTextToSelected,
    sendSos,
    disconnectPeer,
  } = useMesh();
  const [composeText, setComposeText] = useState('');

  const sendNow = async () => {
    const result = await sendTextToSelected(composeText);
    if (result.ok) {
      setComposeText('');
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: t.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scrollPad} showsVerticalScrollIndicator={false}>
          <View style={[styles.hero, { backgroundColor: t.brandHeader }]}>
            <View style={styles.heroRow}>
              <FontAwesome name="wifi" size={18} color={t.brandOnHeader} />
              <Text style={[styles.heroBadge, { color: t.brandOnHeader }]}>Yakin Ag / Mesh</Text>
            </View>
            <Text style={[styles.heroTitle, { color: t.brandOnHeader }]}>
              Internet ve GSM yokken yakin cihazlarla canli baglanti
            </Text>
            <Text style={[styles.heroSub, { color: t.brandOnHeader }]}>
              Bu oturum artik uygulama genelinde yasiyor. Mesh ekranindan ayrilsan bile sen
              durdurana kadar aktif kalir.
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Durum</Text>
            <Text style={[styles.sectionBody, { color: t.textSecondary }]}>
              {availability?.supported
                ? 'Yakin ag modulu hazir gorunuyor.'
                : availability?.reason || 'Yakin ag durumu kontrol ediliyor.'}
            </Text>
            <Text style={[styles.meta, { color: t.textMuted }]}>
              Runtime: {availability?.runtime || 'bilinmiyor'}
            </Text>
            {availability?.playServicesAvailable === false ? (
              <Text style={[styles.warn, { color: t.warn }]}>
                Google Play Services eksik veya uygun degil.
              </Text>
            ) : null}

            <TextInput
              style={[
                styles.input,
                { color: t.text, borderColor: t.border, backgroundColor: t.surfaceMuted },
              ]}
              value={deviceName}
              onChangeText={setDeviceName}
              placeholder="Cihaz adi"
              placeholderTextColor={t.textMuted}
            />

            <View style={styles.actionRow}>
              <Pressable
                onPress={() => void startNode()}
                disabled={busy || running}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: busy || running ? t.surfaceMuted : pressed ? t.accentRipple : t.accent },
                ]}>
                <Text style={[styles.primaryBtnText, { color: busy || running ? t.textMuted : '#fff' }]}>
                  Agi baslat
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void stopNode()}
                disabled={busy || !running}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  {
                    borderColor: t.border,
                    backgroundColor: busy || !running ? t.surfaceMuted : pressed ? t.surfaceMuted : t.surface,
                  },
                ]}>
                <Text style={[styles.secondaryBtnText, { color: busy || !running ? t.textMuted : t.text }]}>
                  Durdur
                </Text>
              </Pressable>
            </View>

            <View style={styles.pillRow}>
              <View style={[styles.pill, { backgroundColor: t.surfaceMuted }]}>
                <Text style={[styles.pillText, { color: t.text }]}>
                  {running ? 'Mesh aktif' : 'Mesh kapali'}
                </Text>
              </View>
              <View style={[styles.pill, { backgroundColor: t.surfaceMuted }]}>
                <Text style={[styles.pillText, { color: t.text }]}>
                  Bagli cihaz: {connectedPeers.length}
                </Text>
              </View>
              {myPeerId ? (
                <View style={[styles.pill, { backgroundColor: t.surfaceMuted }]}>
                  <Text style={[styles.pillText, { color: t.text }]}>Peer: {myPeerId.slice(0, 8)}</Text>
                </View>
              ) : null}
            </View>

            <Pressable
              onPress={() => void sendSos()}
              disabled={!connectedPeers.length}
              style={({ pressed }) => [
                styles.sosBtn,
                {
                  backgroundColor: !connectedPeers.length ? t.surfaceMuted : pressed ? '#b91c1c' : t.danger,
                },
              ]}>
              <FontAwesome name="warning" size={16} color={!connectedPeers.length ? t.textMuted : '#fff'} />
              <Text style={[styles.sosBtnText, { color: !connectedPeers.length ? t.textMuted : '#fff' }]}>
                Bagli cihazlara SOS gonder
              </Text>
            </Pressable>

            {user?.emergency_contact ? (
              <Text style={[styles.note, { color: t.textSecondary }]}>
                Otomatik yakin-deprem konum uyarisi ag yoksa once secili kisiyi mesh adinda arar,
                bulamazsa bagli yakin cihazlara relay yayini yapar.
              </Text>
            ) : null}
          </View>

          <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Gelen baglanti istekleri</Text>
            {invitations.length ? (
              invitations.map((peer) => (
                <View key={peer.peerId} style={[styles.peerRow, { borderColor: t.border }]}>
                  <View style={styles.peerMetaWrap}>
                    <Text style={[styles.peerName, { color: t.text }]}>{peer.name}</Text>
                    <Text style={[styles.peerMeta, { color: t.textMuted }]}>{peer.peerId.slice(0, 10)}</Text>
                  </View>
                  <View style={styles.smallRow}>
                    <Pressable
                      onPress={() => void acceptInvite(peer)}
                      style={({ pressed }) => [
                        styles.smallBtn,
                        { backgroundColor: pressed ? t.accentRipple : t.accent },
                      ]}>
                      <Text style={styles.smallBtnText}>Kabul</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void rejectInvite(peer)}
                      style={({ pressed }) => [
                        styles.smallBtnOutline,
                        { borderColor: t.border, backgroundColor: pressed ? t.surfaceMuted : t.surface },
                      ]}>
                      <Text style={[styles.smallBtnOutlineText, { color: t.text }]}>Reddet</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            ) : (
              <Text style={[styles.sectionBody, { color: t.textSecondary }]}>Bekleyen davet yok.</Text>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Bulunan cihazlar</Text>
            {discoveredPeers.length ? (
              discoveredPeers.map((peer) => (
                <View key={peer.peerId} style={[styles.peerRow, { borderColor: t.border }]}>
                  <View style={styles.peerMetaWrap}>
                    <Text style={[styles.peerName, { color: t.text }]}>{peer.name}</Text>
                    <Text style={[styles.peerMeta, { color: t.textMuted }]}>{peer.peerId.slice(0, 10)}</Text>
                  </View>
                  <Pressable
                    onPress={() => void askConnect(peer)}
                    style={({ pressed }) => [
                      styles.smallBtn,
                      { backgroundColor: pressed ? t.accentRipple : t.accent },
                    ]}>
                    <Text style={styles.smallBtnText}>Baglan</Text>
                  </Pressable>
                </View>
              ))
            ) : (
              <Text style={[styles.sectionBody, { color: t.textSecondary }]}>
                Henuz cihaz bulunmadi. Iki telefonda da ayni development build acik olmali.
              </Text>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Bagli cihazlar</Text>
            {connectedPeers.length ? (
              <>
                <View style={styles.chipRow}>
                  {connectedPeers.map((peer) => {
                    const selected = selectedPeerId === peer.peerId;
                    return (
                      <Pressable
                        key={peer.peerId}
                        onPress={() => setSelectedPeerId(peer.peerId)}
                        style={[
                          styles.peerChip,
                          { backgroundColor: selected ? t.accent : t.surfaceMuted },
                        ]}>
                        <Text style={[styles.peerChipText, { color: selected ? '#fff' : t.text }]}>
                          {peer.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {connectedPeers.map((peer) => (
                  <View key={`conn_${peer.peerId}`} style={[styles.peerRow, { borderColor: t.border }]}>
                    <View style={styles.peerMetaWrap}>
                      <Text style={[styles.peerName, { color: t.text }]}>{peer.name}</Text>
                      <Text style={[styles.peerMeta, { color: t.textMuted }]}>{peer.peerId.slice(0, 10)}</Text>
                    </View>
                    <Pressable
                      onPress={() => void disconnectPeer(peer)}
                      style={({ pressed }) => [
                        styles.smallBtnOutline,
                        { borderColor: t.border, backgroundColor: pressed ? t.surfaceMuted : t.surface },
                      ]}>
                      <Text style={[styles.smallBtnOutlineText, { color: t.text }]}>Ayir</Text>
                    </Pressable>
                  </View>
                ))}
              </>
            ) : (
              <Text style={[styles.sectionBody, { color: t.textSecondary }]}>Bagli cihaz yok.</Text>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Yakin mesaj</Text>
            <TextInput
              style={[
                styles.input,
                styles.inputMulti,
                { color: t.text, borderColor: t.border, backgroundColor: t.surfaceMuted },
              ]}
              multiline
              placeholder="Bagli cihaza kisa mesaj veya enkaz altindayim notu gonder..."
              placeholderTextColor={t.textMuted}
              value={composeText}
              onChangeText={setComposeText}
            />
            <Pressable
              onPress={() => void sendNow()}
              disabled={!selectedPeerId || !composeText.trim()}
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  backgroundColor:
                    !selectedPeerId || !composeText.trim()
                      ? t.surfaceMuted
                      : pressed
                        ? t.accentRipple
                        : t.accent,
                },
              ]}>
              <Text
                style={[
                  styles.primaryBtnText,
                  { color: !selectedPeerId || !composeText.trim() ? t.textMuted : '#fff' },
                ]}>
                Yakin cihaza gonder
              </Text>
            </Pressable>
          </View>

          <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Yerel akis</Text>
            {transcript.length ? (
              transcript.map((item) => {
                const incoming = item.direction === 'incoming';
                const outgoing = item.direction === 'outgoing';
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.chatBubble,
                      incoming
                        ? { alignSelf: 'flex-start', backgroundColor: t.surfaceMuted }
                        : outgoing
                          ? { alignSelf: 'flex-end', backgroundColor: t.accent }
                          : { alignSelf: 'stretch', backgroundColor: t.listCard },
                    ]}>
                    <Text
                      style={[
                        styles.chatMeta,
                        { color: outgoing ? 'rgba(255,255,255,0.86)' : t.textMuted },
                      ]}>
                      {item.peerName || item.peerId?.slice(0, 6) || 'sistem'} - {formatClock(item.createdAt)}
                    </Text>
                    <Text style={[styles.chatBody, { color: outgoing ? '#fff' : t.text }]}>{item.text}</Text>
                  </View>
                );
              })
            ) : (
              <Text style={[styles.sectionBody, { color: t.textSecondary }]}>
                Henuz yakin ag trafigi yok. Iki cihazi da yakin ag ekranindan baslat.
              </Text>
            )}
          </View>

          {statusMessage ? (
            <Text style={[styles.statusBox, { color: t.textSecondary, backgroundColor: t.surface }]}>
              {statusMessage}
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1 },
    safe: { flex: 1 },
    scrollPad: { padding: 16, paddingBottom: 120, gap: 14 },
    hero: { borderRadius: 26, padding: 20, gap: 10 },
    heroRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    heroBadge: { fontSize: 12, fontWeight: '800' },
    heroTitle: { fontSize: 24, fontWeight: '800', lineHeight: 30 },
    heroSub: { fontSize: 13, lineHeight: 19, opacity: 0.95 },
    card: { borderWidth: 1, borderRadius: 22, padding: 16, gap: 12 },
    sectionTitle: { fontSize: 18, fontWeight: '800' },
    sectionBody: { fontSize: 13, lineHeight: 19 },
    meta: { fontSize: 12, fontWeight: '700' },
    warn: { fontSize: 13, fontWeight: '700' },
    note: { fontSize: 12, lineHeight: 18 },
    input: {
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 15,
    },
    inputMulti: { minHeight: 92, textAlignVertical: 'top' },
    actionRow: { flexDirection: 'row', gap: 10 },
    primaryBtn: { flex: 1, borderRadius: 16, alignItems: 'center', paddingVertical: 14 },
    primaryBtnText: { fontSize: 15, fontWeight: '800' },
    secondaryBtn: {
      minWidth: 110,
      borderRadius: 16,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    secondaryBtnText: { fontSize: 14, fontWeight: '800' },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
    pillText: { fontSize: 12, fontWeight: '800' },
    sosBtn: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 16,
      paddingVertical: 14,
    },
    sosBtnText: { fontSize: 15, fontWeight: '800' },
    peerRow: {
      borderWidth: 1,
      borderRadius: 16,
      padding: 12,
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
    },
    peerMetaWrap: { flex: 1 },
    peerName: { fontSize: 14, fontWeight: '800' },
    peerMeta: { fontSize: 12, marginTop: 4 },
    smallRow: { flexDirection: 'row', gap: 8 },
    smallBtn: {
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    smallBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
    smallBtnOutline: {
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    smallBtnOutlineText: { fontSize: 12, fontWeight: '800' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    peerChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
    peerChipText: { fontSize: 12, fontWeight: '800' },
    chatBubble: {
      borderRadius: 16,
      padding: 12,
      maxWidth: '92%',
      gap: 6,
    },
    chatMeta: { fontSize: 11, fontWeight: '700' },
    chatBody: { fontSize: 14, lineHeight: 20 },
    statusBox: { borderRadius: 16, padding: 14, fontSize: 13, lineHeight: 19 },
  });
}
