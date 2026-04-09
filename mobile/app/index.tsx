import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
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

import { CosmicBackdrop, CosmicLabel, GlassCard, GlowButton, alpha } from '@/components/cosmic';
import { useColorScheme } from '@/components/useColorScheme';
import { theme, type ThemeTokens } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import {
  confirmPasswordReset,
  confirmRegister,
  requestPasswordReset,
  requestRegisterCode,
} from '@/services/authService';

type PasswordMode = 'login' | 'register' | 'reset';

export default function WelcomeScreen() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const t = theme[scheme];
  const styles = useMemo(() => makeStyles(t), [t]);

  const { ready, token, login, completeLoginWithToken, apiBase } = useAuth();

  const [passwordMode, setPasswordMode] = useState<PasswordMode>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registerCode, setRegisterCode] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (ready && token) {
      router.replace('/(tabs)');
    }
  }, [ready, token]);

  const onPasswordSubmit = async () => {
    const usernameValue = username.trim();
    const emailValue = email.trim();
    const passwordValue = password.trim();

    if (passwordMode === 'register') {
      if (!usernameValue || !emailValue || passwordValue.length < 4) {
        setMessage('Kullanici adi, e-posta ve en az 4 karakterli sifre gir.');
        return;
      }
    } else if (!usernameValue || (passwordMode !== 'reset' && passwordValue.length < 4)) {
      setMessage('Kullanici adi gir ve en az 4 karakterli sifre kullan.');
      return;
    }

    if (passwordMode === 'reset' && resetCode.trim() && passwordValue.length < 4) {
      setMessage('Yeni sifre en az 4 karakter olmali.');
      return;
    }

    setBusy(true);
    setMessage(null);

    if (passwordMode === 'reset') {
      if (!resetCode.trim()) {
        const result = await requestPasswordReset(apiBase, usernameValue);
        setBusy(false);
        if (!result.ok) {
          setMessage(result.message || 'Sifirlama kodu olusturulamadi.');
          return;
        }
        setMessage(
          result.debugCode
            ? `Sifirlama kodu hazir. Gelisim kodu: ${result.debugCode}`
            : 'Sifirlama kodu gonderildi. Kodu girip yeni sifreni belirle.'
        );
        return;
      }

      const result = await confirmPasswordReset(
        apiBase,
        usernameValue,
        resetCode.trim(),
        passwordValue
      );
      setBusy(false);
      if (!result.ok || !result.token) {
        setMessage(result.message || 'Sifre sifirlanamadi.');
        return;
      }
      await completeLoginWithToken(result.token);
      setPassword('');
      setResetCode('');
      router.replace('/(tabs)');
      return;
    }

    if (passwordMode === 'register') {
      if (!registerCode.trim()) {
        const result = await requestRegisterCode(apiBase, usernameValue, emailValue, passwordValue);
        setBusy(false);
        if (!result.ok) {
          setMessage(result.message || 'Kayit dogrulama kodu olusturulamadi.');
          return;
        }
        setMessage(
          result.debugCode
            ? `Kayit kodu hazir. Gelisim kodu: ${result.debugCode}`
            : 'Dogrulama kodu e-posta adresine gonderildi. Kodu girip kaydi tamamla.'
        );
        return;
      }

      const result = await confirmRegister(apiBase, emailValue, registerCode.trim());
      setBusy(false);
      if (!result.ok || !result.token) {
        setMessage(result.message || 'Kayit tamamlanamadi.');
        return;
      }
      await completeLoginWithToken(result.token);
      setPassword('');
      setRegisterCode('');
      router.replace('/(tabs)');
      return;
    }

    const result = await login(usernameValue, passwordValue);

    setBusy(false);

    if (!result.ok) {
      setMessage(result.message || 'Islem tamamlanamadi.');
      return;
    }

    setPassword('');
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
    <View style={styles.root}>
      <CosmicBackdrop t={t} />
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.safe}>
          <ScrollView contentContainerStyle={styles.scrollPad} showsVerticalScrollIndicator={false}>
            <View style={styles.heroWrap}>
              <CosmicLabel t={t}>risk intelligence</CosmicLabel>
              <Text style={[styles.heroTitle, { color: t.text }]}>Deprem Risk Izleyici</Text>
              <Text style={[styles.heroSub, { color: t.textSecondary }]}>
                Deprem risklerini takip edin, acil uyarilari gorun ve kritik anlarda
                yakinlariniza hizla ulasin.
              </Text>
            </View>

            <GlassCard t={t} tone="cool" style={styles.formCard}>
              <View style={styles.modeRow}>
                {(['login', 'register', 'reset'] as const).map((item) => {
                  const active = passwordMode === item;
                  return (
                    <Pressable
                      key={item}
                      onPress={() => setPasswordMode(item)}
                      style={[
                        styles.modeButton,
                        {
                          backgroundColor: active ? alpha(t.glowBlue, 0.16) : 'transparent',
                          borderColor: active ? alpha(t.glowBlue, 0.28) : 'transparent',
                        },
                      ]}>
                      <Text style={[styles.modeText, { color: active ? t.text : t.textMuted }]}>
                        {item === 'login'
                          ? 'Giris Yap'
                          : item === 'register'
                            ? 'Kayit Ol'
                            : 'Sifre Sifirla'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.featureStrip}>
                <View style={styles.featureRow}>
                  <FontAwesome name="bolt" size={14} color={t.warn} />
                  <Text style={[styles.featureText, { color: t.textSecondary }]}>
                    Canli risk kartlari ve model ozeti
                  </Text>
                </View>
                <View style={styles.featureRow}>
                  <FontAwesome name="comments" size={14} color={t.brandTab} />
                  <Text style={[styles.featureText, { color: t.textSecondary }]}>
                    Acil mesajlar ve kayitli kisi akisi
                  </Text>
                </View>
              </View>

              <TextInput
                style={[
                  styles.input,
                  { color: t.text, borderColor: t.border, backgroundColor: t.inputBg },
                ]}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={
                  passwordMode === 'reset'
                    ? 'Telefon numarasi veya e-posta'
                    : passwordMode === 'register'
                      ? 'Kullanici adi'
                      : 'Telefon numarasi veya kullanici adi'
                }
                placeholderTextColor={t.textMuted}
                value={username}
                onChangeText={setUsername}
              />

              {passwordMode === 'register' ? (
                <TextInput
                  style={[
                    styles.input,
                    { color: t.text, borderColor: t.border, backgroundColor: t.inputBg },
                  ]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="E-posta adresi"
                  placeholderTextColor={t.textMuted}
                  value={email}
                  onChangeText={setEmail}
                />
              ) : null}

              <TextInput
                style={[
                  styles.input,
                  { color: t.text, borderColor: t.border, backgroundColor: t.inputBg },
                ]}
                secureTextEntry
                placeholder={passwordMode === 'reset' ? 'Yeni parola' : 'Parola'}
                placeholderTextColor={t.textMuted}
                value={password}
                onChangeText={setPassword}
              />

              {passwordMode === 'register' ? (
                <TextInput
                  style={[
                    styles.input,
                    { color: t.text, borderColor: t.border, backgroundColor: t.inputBg },
                  ]}
                  placeholder="E-posta dogrulama kodu"
                  placeholderTextColor={t.textMuted}
                  keyboardType="number-pad"
                  value={registerCode}
                  onChangeText={setRegisterCode}
                />
              ) : null}

              {passwordMode === 'reset' ? (
                <TextInput
                  style={[
                    styles.input,
                    { color: t.text, borderColor: t.border, backgroundColor: t.inputBg },
                  ]}
                  placeholder="Dogrulama kodu"
                  placeholderTextColor={t.textMuted}
                  keyboardType="number-pad"
                  value={resetCode}
                  onChangeText={setResetCode}
                />
              ) : null}

              <GlowButton
                t={t}
                label={
                  passwordMode === 'login'
                    ? busy
                      ? 'Giris yapiliyor...'
                      : 'Giris Yap'
                    : passwordMode === 'register'
                      ? busy
                        ? 'Isleniyor...'
                        : registerCode.trim()
                          ? 'Kaydi Tamamla'
                          : 'Kod Gonder'
                      : busy
                        ? 'Isleniyor...'
                        : resetCode.trim()
                          ? 'Sifreyi Yenile'
                          : 'Kod Gonder'
                }
                onPress={() => void onPasswordSubmit()}
                disabled={busy}
                style={styles.submitButton}
              />

              {message ? (
                <Text
                  style={[
                    styles.message,
                    { color: t.textSecondary, backgroundColor: t.panelSoft },
                  ]}>
                  {message}
                </Text>
              ) : null}

              <Pressable onPress={() => router.replace('/(tabs)')} style={styles.linkWrap}>
                <Text style={[styles.linkText, { color: t.brandTab }]}>Misafir olarak devam et</Text>
              </Pressable>
            </GlassCard>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    safe: { flex: 1 },
    loadingRoot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scrollPad: {
      flexGrow: 1,
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 32,
      paddingBottom: 42,
      gap: 24,
    },
    heroWrap: {
      minHeight: 260,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
      paddingTop: 40,
    },
    heroTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.9, fontFamily: t.displayFont },
    heroSub: { fontSize: 15, lineHeight: 24, textAlign: 'center', maxWidth: 310 },
    formCard: { gap: 14, padding: 18 },
    modeRow: {
      flexDirection: 'row',
      gap: 8,
      padding: 4,
      borderRadius: 16,
      backgroundColor: alpha(t.glowBlue, 0.06),
    },
    modeButton: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    modeText: { fontSize: 14, fontWeight: '800', fontFamily: t.displayFont, textAlign: 'center' },
    featureStrip: {
      gap: 8,
      borderRadius: 18,
      padding: 14,
      backgroundColor: alpha(t.glowOrange, 0.08),
      borderWidth: 1,
      borderColor: alpha(t.glowOrange, 0.16),
    },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    featureText: { fontSize: 13, lineHeight: 18, flex: 1 },
    input: {
      minHeight: 56,
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 16,
      fontSize: 16,
    },
    submitButton: { marginTop: 2 },
    message: { borderRadius: 16, padding: 13, fontSize: 13, lineHeight: 19 },
    linkWrap: { alignItems: 'center', paddingTop: 4 },
    linkText: { fontSize: 14, fontWeight: '700' },
  });
}
