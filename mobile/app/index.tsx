import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { useAuth } from '@/context/AuthContext';
import { theme, type ThemeTokens } from '@/constants/theme';
import { requestLoginCode, verifyLoginCode } from '@/lib/api';
import {
  detectAuthTargetKind,
  isSupabaseConfigured,
  requestSupabaseOtp,
  signInSupabaseWithPassword,
  signUpSupabaseWithPassword,
  verifySupabaseOtp,
} from '@/lib/supabase';

type EntryMode = 'otp' | 'password';
type PasswordMode = 'login' | 'register';

export default function WelcomeScreen() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const t = theme[scheme];
  const styles = useMemo(() => makeStyles(t), [t]);

  const {
    ready,
    token,
    apiBase,
    login,
    register,
    completeLoginWithToken,
    completeLoginWithSupabaseAccessToken,
  } = useAuth();

  const [entryMode, setEntryMode] = useState<EntryMode>('otp');
  const [passwordMode, setPasswordMode] = useState<PasswordMode>('login');

  const [target, setTarget] = useState('');
  const [code, setCode] = useState('');
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (ready && token) {
      router.replace('/(tabs)');
    }
  }, [ready, token]);

  const onPasswordSubmit = async () => {
    const targetValue = username.trim();
    if (!targetValue || password.trim().length < 4) {
      setMessage('Giris bilgisi girin, sifre en az 4 karakter olsun.');
      return;
    }

    setBusy(true);
    setMessage(null);
    const kind = detectAuthTargetKind(targetValue);

    if (isSupabaseConfigured && kind !== 'unknown') {
      const result =
        passwordMode === 'login'
          ? await signInSupabaseWithPassword(targetValue, password)
          : await signUpSupabaseWithPassword(targetValue, password);
      setBusy(false);

      if (!result.ok || !result.accessToken) {
        setMessage(result.message || 'Islem tamamlanamadi.');
        return;
      }

      const synced = await completeLoginWithSupabaseAccessToken(result.accessToken);
      if (!synced.ok) {
        setMessage(synced.message || 'Oturum eslenemedi.');
        return;
      }
    } else {
      const result =
        passwordMode === 'login'
          ? await login(targetValue, password)
          : await register(targetValue, password);
      setBusy(false);

      if (!result.ok) {
        setMessage(result.message || 'Islem tamamlanamadi.');
        return;
      }
    }

    setPassword('');
    router.replace('/(tabs)');
  };

  const onRequestCode = async () => {
    if (!target.trim()) {
      setMessage('Telefon numarasi veya e-posta gir.');
      return;
    }

    setBusy(true);
    setMessage(null);
    const result =
      isSupabaseConfigured && detectAuthTargetKind(target) !== 'unknown'
        ? await requestSupabaseOtp(target.trim())
        : await requestLoginCode(apiBase, target.trim());
    setBusy(false);

    if (!result.ok) {
      setMessage(result.message || 'Kod gonderilemedi.');
      return;
    }

    const devCode =
      'debugCode' in result && typeof result.debugCode === 'string' ? result.debugCode : null;
    setDebugCode(devCode);
    setMessage(
      devCode
        ? `Gelisim modu kodu: ${devCode}`
        : result.message || 'Dogrulama kodu gonderildi. Gelen kodu asagida gir.'
    );
  };

  const onVerifyCode = async () => {
    if (!target.trim() || !code.trim()) {
      setMessage('Telefon/e-posta ve dogrulama kodu gerekli.');
      return;
    }

    setBusy(true);
    setMessage(null);
    const kind = detectAuthTargetKind(target);
    const result =
      isSupabaseConfigured && kind !== 'unknown'
        ? await verifySupabaseOtp(target.trim(), code.trim())
        : await verifyLoginCode(apiBase, target.trim(), code.trim());
    setBusy(false);

    if (!result.ok) {
      setMessage(result.message || 'Kod dogrulanamadi.');
      return;
    }

    if ('accessToken' in result && result.accessToken) {
      const synced = await completeLoginWithSupabaseAccessToken(result.accessToken);
      if (!synced.ok) {
        setMessage(synced.message || 'Supabase oturumu eslenemedi.');
        return;
      }
    } else if ('token' in result && result.token) {
      await completeLoginWithToken(result.token);
    } else {
      setMessage('Oturum baslatilamadi.');
      return;
    }
    router.replace('/(tabs)');
  };

  if (!ready) {
    return (
      <View style={[styles.loadingRoot, { backgroundColor: t.bg }]}>
        <ActivityIndicator size="large" color={t.brandTab} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: t.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scrollPad} showsVerticalScrollIndicator={false}>
          <View style={[styles.hero, { backgroundColor: t.brandHeader }]}>
            <View style={styles.heroBadge}>
              <FontAwesome name="shield" size={18} color={t.brandOnHeader} />
              <Text style={[styles.heroBadgeText, { color: t.brandOnHeader }]}>
                Ust seviye deprem takip merkezi
              </Text>
            </View>
            <Text style={[styles.heroTitle, { color: t.brandOnHeader }]}>
              Erken uyarilar, 81 il risk haritasi, acil mesajlasma ve akilli asistan
            </Text>
            <Text style={[styles.heroSub, { color: t.brandOnHeader }]}>
              Telefon veya e-posta ile hizlica giris yap, istersen sifreli hesapla devam et.
            </Text>
          </View>

          <View style={styles.featureGrid}>
            {FEATURES.map((feature) => (
              <View
                key={feature.title}
                style={[styles.featureCard, { backgroundColor: t.surface, borderColor: t.border }]}>
                <FontAwesome name={feature.icon} size={18} color={t.brandTab} />
                <Text style={[styles.featureTitle, { color: t.text }]}>{feature.title}</Text>
                <Text style={[styles.featureBody, { color: t.textSecondary }]}>{feature.body}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.authCard, { backgroundColor: t.surface, borderColor: t.border }]}>
            <View style={[styles.modeSwitch, { backgroundColor: t.surfaceMuted }]}>
              {(['otp', 'password'] as const).map((item) => {
                const active = entryMode === item;
                return (
                  <Pressable
                    key={item}
                    onPress={() => setEntryMode(item)}
                    style={[styles.modeButton, active && { backgroundColor: t.surface }]}>
                    <Text style={[styles.modeText, { color: active ? t.text : t.textMuted }]}>
                      {item === 'otp' ? 'Kod ile giris' : 'Sifreli hesap'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {entryMode === 'otp' ? (
              <>
                <Text style={[styles.cardTitle, { color: t.text }]}>E-posta kodu ile gir</Text>
                <Text style={[styles.cardSub, { color: t.textSecondary }]}>
                  Kayit ve giris ayni akistan ilerler. E-posta adresine gelen dogrulama kodunu girmen yeterli.
                </Text>

                <TextInput
                  style={[
                    styles.input,
                    { color: t.text, borderColor: t.border, backgroundColor: t.surfaceMuted },
                  ]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="E-posta adresi"
                  placeholderTextColor={t.textMuted}
                  value={target}
                  onChangeText={setTarget}
                />

                <View style={styles.row}>
                  <Pressable
                    onPress={() => void onRequestCode()}
                    disabled={busy}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      styles.flex1,
                      { backgroundColor: pressed || busy ? t.accentRipple : t.accent },
                    ]}>
                    <Text style={[styles.primaryButtonText, { color: scheme === 'dark' ? t.onAccent : '#fff' }]}>
                      Kodu al
                    </Text>
                  </Pressable>
                </View>

                <TextInput
                  style={[
                    styles.input,
                    { color: t.text, borderColor: t.border, backgroundColor: t.surfaceMuted },
                  ]}
                  keyboardType="number-pad"
                  placeholder="E-postana gelen 6 haneli kod"
                  placeholderTextColor={t.textMuted}
                  value={code}
                  onChangeText={setCode}
                />

                {debugCode ? (
                  <Text style={[styles.debugBox, { color: t.textSecondary, backgroundColor: t.surfaceMuted }]}>
                    Gelisim kodu: {debugCode}
                  </Text>
                ) : null}

                <Pressable
                  onPress={() => void onVerifyCode()}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    { backgroundColor: pressed || busy ? t.accentRipple : t.accent },
                  ]}>
                  <Text style={[styles.primaryButtonText, { color: scheme === 'dark' ? t.onAccent : '#fff' }]}>
                    Kodu dogrula
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={[styles.innerSwitch, { backgroundColor: t.surfaceMuted }]}>
                  {(['login', 'register'] as const).map((item) => {
                    const active = passwordMode === item;
                    return (
                      <Pressable
                        key={item}
                        onPress={() => setPasswordMode(item)}
                        style={[styles.modeButton, active && { backgroundColor: t.surface }]}>
                        <Text style={[styles.modeText, { color: active ? t.text : t.textMuted }]}>
                          {item === 'login' ? 'Giris yap' : 'Kayit ol'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={[styles.cardTitle, { color: t.text }]}>
                  {passwordMode === 'login' ? 'Hesabina giris yap' : 'Yeni hesap olustur'}
                </Text>
                <Text style={[styles.cardSub, { color: t.textSecondary }]}>
                  E-posta veya telefonla Supabase hesabi kullanabilir, istersen mevcut kullanici adi
                  tabanli hesabinla da devam edebilirsin.
                </Text>

                <TextInput
                  style={[
                    styles.input,
                    { color: t.text, borderColor: t.border, backgroundColor: t.surfaceMuted },
                  ]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="E-posta, telefon veya kullanici adi"
                  placeholderTextColor={t.textMuted}
                  value={username}
                  onChangeText={setUsername}
                />
                <TextInput
                  style={[
                    styles.input,
                    { color: t.text, borderColor: t.border, backgroundColor: t.surfaceMuted },
                  ]}
                  secureTextEntry
                  placeholder="Sifre"
                  placeholderTextColor={t.textMuted}
                  value={password}
                  onChangeText={setPassword}
                />

                <Pressable
                  onPress={() => void onPasswordSubmit()}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    { backgroundColor: pressed || busy ? t.accentRipple : t.accent },
                  ]}>
                  <Text style={[styles.primaryButtonText, { color: scheme === 'dark' ? t.onAccent : '#fff' }]}>
                    {passwordMode === 'login' ? 'Giris yap ve devam et' : 'Kayit ol ve devam et'}
                  </Text>
                </Pressable>
              </>
            )}

            {message ? (
              <Text style={[styles.message, { color: t.textSecondary, backgroundColor: t.surfaceMuted }]}>
                {message}
              </Text>
            ) : null}

            <Pressable onPress={() => router.replace('/(tabs)')} style={styles.secondaryButton}>
              <Text style={[styles.secondaryButtonText, { color: t.brandTab }]}>
                Misafir olarak devam et
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const FEATURES: {
  icon: ComponentProps<typeof FontAwesome>['name'];
  title: string;
  body: string;
}[] = [
  {
    icon: 'map-marker',
    title: '81 il risk sinyali',
    body: 'Turkiye genelinde il bazli risk siralamasi ve bulundugun konum icin kisa vadeli analiz.',
  },
  {
    icon: 'bell',
    title: 'Kisisel alarm mantigi',
    body: 'Buyukluk ve mesafe esigine gore sana ozel sesli uyari akisi.',
  },
  {
    icon: 'comments',
    title: 'Acil yardim ve asistan',
    body: 'Tek dokunusla durum gonder, bilgi al, deprem asistanindan yonlendirme iste.',
  },
];

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1 },
    safe: { flex: 1 },
    loadingRoot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scrollPad: { padding: 18, paddingBottom: 36, gap: 18 },
    hero: { borderRadius: 28, padding: 22, gap: 12 },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
    heroBadgeText: { fontSize: 12, fontWeight: '700' },
    heroTitle: { fontSize: 28, fontWeight: '800', lineHeight: 34 },
    heroSub: { fontSize: 14, lineHeight: 21, opacity: 0.94 },
    featureGrid: { gap: 12 },
    featureCard: {
      borderRadius: 20,
      borderWidth: 1,
      padding: 16,
      gap: 8,
    },
    featureTitle: { fontSize: 16, fontWeight: '800' },
    featureBody: { fontSize: 13, lineHeight: 19 },
    authCard: {
      borderRadius: 24,
      borderWidth: 1,
      padding: 18,
      gap: 12,
    },
    modeSwitch: {
      flexDirection: 'row',
      borderRadius: 16,
      padding: 4,
    },
    innerSwitch: {
      flexDirection: 'row',
      borderRadius: 14,
      padding: 4,
    },
    modeButton: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: 12,
    },
    modeText: { fontSize: 14, fontWeight: '700' },
    cardTitle: { fontSize: 22, fontWeight: '800' },
    cardSub: { fontSize: 13, lineHeight: 19 },
    input: {
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 14,
      fontSize: 15,
    },
    row: { flexDirection: 'row', gap: 10 },
    flex1: { flex: 1 },
    debugBox: { borderRadius: 12, padding: 12, fontSize: 13, lineHeight: 18 },
    message: { borderRadius: 12, padding: 12, fontSize: 13, lineHeight: 18 },
    primaryButton: { borderRadius: 16, alignItems: 'center', paddingVertical: 15 },
    primaryButtonText: { fontSize: 16, fontWeight: '800' },
    secondaryButton: { alignItems: 'center', paddingVertical: 12 },
    secondaryButtonText: { fontSize: 14, fontWeight: '700' },
  });
}
