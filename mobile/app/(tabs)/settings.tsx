import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { CosmicBackdrop, CosmicLabel, GlassCard, GlowButton, alpha } from '@/components/cosmic';
import { useColorScheme } from '@/components/useColorScheme';
import {
  useAlertPreferences,
  type AlertPreferences,
} from '@/context/AlertPreferencesContext';
import { useAuth } from '@/context/AuthContext';
import { theme, type ThemeTokens } from '@/constants/theme';
import { DEFAULT_API_URL } from '@/lib/config';
import { getSafeDeviceLocation } from '@/lib/location';
import {
  confirmRegister,
  requestRegisterCode,
  setEmergencyContact,
  updateUserSettings,
} from '@/services/authService';

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const t = theme[scheme];
  const styles = useMemo(() => makeStyles(t), [t]);

  const { ready, token, user, apiBase, setApiBase, login, completeLoginWithToken, logout, refreshMe } =
    useAuth();
  const { ready: alertsReady, preferences, updatePreferences } = useAlertPreferences();

  const [urlInput, setUrlInput] = useState(apiBase);
  const [userIn, setUserIn] = useState('');
  const [emailIn, setEmailIn] = useState('');
  const [passIn, setPassIn] = useState('');
  const [registerCodeIn, setRegisterCodeIn] = useState('');
  const [contactIn, setContactIn] = useState('');
  const [alertForm, setAlertForm] = useState<AlertPreferences>(preferences);
  const [alertMagnitudeInput, setAlertMagnitudeInput] = useState(String(preferences.minMagnitude));
  const [alertDistanceInput, setAlertDistanceInput] = useState(String(preferences.maxDistanceKm));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setUrlInput(apiBase);
  }, [apiBase]);

  useEffect(() => {
    setAlertForm(preferences);
    setAlertMagnitudeInput(String(preferences.minMagnitude));
    setAlertDistanceInput(String(preferences.maxDistanceKm));
  }, [preferences]);

  useEffect(() => {
    if (user?.emergency_contact) {
      setContactIn(user.emergency_contact);
    }
  }, [user?.emergency_contact]);

  if (!ready || !alertsReady) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator size="large" color={t.accent} />
      </View>
    );
  }

  const saveUrl = async () => {
    const nextUrl = urlInput.trim() || DEFAULT_API_URL;
    await setApiBase(nextUrl);
    setMessage('API adresi kaydedildi.');
  };

  const doLogin = async () => {
    setBusy(true);
    setMessage(null);
    const result = await login(userIn.trim(), passIn);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message || 'Giris yapilamadi.');
      return;
    }
    setPassIn('');
    setMessage('Giris basarili.');
  };

  const doRegister = async () => {
    if (!userIn.trim() || !emailIn.trim() || passIn.trim().length < 4) {
      setMessage('Kullanici adi, e-posta ve en az 4 karakterli sifre gir.');
      return;
    }

    setBusy(true);
    setMessage(null);

    if (!registerCodeIn.trim()) {
      const result = await requestRegisterCode(apiBase, userIn.trim(), emailIn.trim(), passIn);
      setBusy(false);
      if (!result.ok) {
        setMessage(result.message || 'Kayit kodu gonderilemedi.');
        return;
      }
      setMessage(
        result.debugCode
          ? `Kayit kodu hazir. Gelisim kodu: ${result.debugCode}`
          : 'Dogrulama kodu e-posta adresine gonderildi.'
      );
      return;
    }

    const result = await confirmRegister(apiBase, emailIn.trim(), registerCodeIn.trim());
    setBusy(false);
    if (!result.ok || !result.token) {
      setMessage(result.message || 'Kayit tamamlanamadi.');
      return;
    }
    await completeLoginWithToken(result.token);
    setPassIn('');
    setRegisterCodeIn('');
    setMessage('Kayit tamamlandi ve oturum acildi.');
  };

  const saveContact = async () => {
    if (!token) {
      setMessage('Once giris yapin.');
      return;
    }

    setBusy(true);
    const result = await setEmergencyContact(apiBase, token, contactIn.trim());
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message || 'Acil kisi kaydedilemedi.');
      return;
    }

    await refreshMe();
    setMessage('Acil kisi guncellendi.');
  };

  const saveAlertPreferences = async () => {
    const minMagnitude = Number(alertMagnitudeInput.replace(',', '.'));
    const maxDistanceKm = Number(alertDistanceInput);
    const normalizedMagnitude = Number.isFinite(minMagnitude)
      ? minMagnitude
      : preferences.minMagnitude;

    await updatePreferences({
      enabled: alertForm.enabled,
      minMagnitude: normalizedMagnitude,
      maxDistanceKm: Number.isFinite(maxDistanceKm) ? maxDistanceKm : preferences.maxDistanceKm,
    });

    if (token) {
      await updateUserSettings(apiBase, token, {
        notification_enabled: alertForm.enabled,
        location_tracking_enabled: true,
        min_risk_score: Math.max(0.25, Math.min(0.95, normalizedMagnitude / 10)),
      });
    }
    setMessage('Ozel uyari ayarlari kaydedildi.');
  };

  const askLocation = async () => {
    const result = await getSafeDeviceLocation({ requestPermission: true, allowLastKnown: true });
    if (!result.ok) {
      Alert.alert('Konum', result.message);
      return;
    }
    if (token) {
      await updateUserSettings(apiBase, token, { location_tracking_enabled: true });
    }
    setMessage(
      result.source === 'last_known'
        ? 'Konum izni verildi. Son bilinen konum kullanilabiliyor.'
        : `Konum hazir: ${result.lat.toFixed(5)}, ${result.lon.toFixed(5)}`
    );
  };

  return (
    <View style={styles.root}>
      <CosmicBackdrop t={t} compact />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.pad}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <GlassCard t={t} tone="cool" style={styles.heroCard}>
          <CosmicLabel t={t}>control center</CosmicLabel>
          <View style={styles.heroHeader}>
            <FontAwesome name="sliders" size={18} color={t.brandTab} />
            <Text style={[styles.heroTitle, { color: t.text }]}>Ayarlar ve Guvenlik</Text>
          </View>
          <Text style={[styles.heroText, { color: t.textSecondary }]}>
            Kisisel alarm esiklerini, acil kisiyi ve baglandigin API adresini tek yerden yonet.
          </Text>
        </GlassCard>

        <GlassCard t={t} style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Hesap</Text>
            <CosmicLabel t={t}>{token && user ? 'aktif' : 'misafir'}</CosmicLabel>
          </View>

          {token && user ? (
            <View
              style={[
                styles.accountRow,
                {
                  backgroundColor: alpha(t.glowBlue, 0.08),
                  borderColor: alpha(t.glowBlue, 0.18),
                },
              ]}>
              <FontAwesome name="check-circle" size={18} color={t.success} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.accountName, { color: t.text }]}>@{user.username}</Text>
                <Text style={[styles.accountSub, { color: t.textSecondary }]}>
                  Mesajlasma ve acil bildirimler aktif.
                </Text>
                {user.auth_channel ? (
                  <Text style={[styles.accountSub, { color: t.textSecondary }]}>
                    Giris yontemi: {user.auth_channel}
                  </Text>
                ) : null}
                {user.email ? (
                  <Text style={[styles.accountSub, { color: t.textSecondary }]}>
                    E-posta: {user.email}
                  </Text>
                ) : null}
                {user.phone ? (
                  <Text style={[styles.accountSub, { color: t.textSecondary }]}>
                    Telefon: {user.phone}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : (
            <>
              <Text style={[styles.helper, { color: t.textSecondary }]}>
                Hesap acinca mesajlar, acil durum kartlari ve otomatik konum paylasimi
                kullanilabilir.
              </Text>
              <TextInput
                style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.inputBg }]}
                placeholder="Kullanici adi"
                placeholderTextColor={t.textMuted}
                autoCapitalize="none"
                value={userIn}
                onChangeText={setUserIn}
              />
              <TextInput
                style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.inputBg }]}
                placeholder="E-posta adresi"
                placeholderTextColor={t.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                value={emailIn}
                onChangeText={setEmailIn}
              />
              <TextInput
                style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.inputBg }]}
                placeholder="Sifre"
                placeholderTextColor={t.textMuted}
                secureTextEntry
                value={passIn}
                onChangeText={setPassIn}
              />
              <TextInput
                style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.inputBg }]}
                placeholder="Kayit dogrulama kodu"
                placeholderTextColor={t.textMuted}
                keyboardType="number-pad"
                value={registerCodeIn}
                onChangeText={setRegisterCodeIn}
              />
              <View style={styles.buttonRow}>
                <GlowButton
                  t={t}
                  label={busy ? 'Bekle...' : 'Giris'}
                  onPress={() => void doLogin()}
                  disabled={busy}
                  style={styles.flexButton}
                />
                <GlowButton
                  t={t}
                  tone="orange"
                  label={registerCodeIn.trim() ? 'Kaydi Tamamla' : 'Kod Gonder'}
                  onPress={() => void doRegister()}
                  disabled={busy}
                  style={styles.flexButton}
                />
              </View>
            </>
          )}

          {token ? <GlowButton t={t} tone="danger" label="Cikis Yap" onPress={logout} /> : null}
        </GlassCard>

        <GlassCard t={t} tone="warm" style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Ozel Uyarilar</Text>
            <CosmicLabel t={t} accent={alertForm.enabled ? t.success : t.textMuted}>
              {alertForm.enabled ? 'acik' : 'kapali'}
            </CosmicLabel>
          </View>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldTitle, { color: t.text }]}>Sesli yakin deprem uyarisi</Text>
              <Text style={[styles.helper, { color: t.textSecondary }]}>
                Uygulama acikken secilen buyukluk ve mesafe esigine gore cihazda ses calar.
              </Text>
            </View>
            <Switch
              value={alertForm.enabled}
              onValueChange={(value) => setAlertForm((current) => ({ ...current, enabled: value }))}
              trackColor={{ false: alpha(t.textMuted, 0.3), true: alpha(t.accent, 0.6) }}
              thumbColor={scheme === 'dark' ? '#eef7ff' : '#ffffff'}
            />
          </View>

          <Text style={[styles.label, { color: t.textMuted }]}>Minimum buyukluk</Text>
          <TextInput
            style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.inputBg }]}
            keyboardType="decimal-pad"
            value={alertMagnitudeInput}
            onChangeText={setAlertMagnitudeInput}
          />

          <Text style={[styles.label, { color: t.textMuted }]}>Maksimum mesafe (km)</Text>
          <TextInput
            style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.inputBg }]}
            keyboardType="number-pad"
            value={alertDistanceInput}
            onChangeText={setAlertDistanceInput}
          />

          <View style={styles.metaGrid}>
            <View style={[styles.metaPill, { backgroundColor: alpha(t.glowBlue, 0.08) }]}>
              <Text style={[styles.metaText, { color: t.textSecondary }]}>
                Teslimat modeli: internet varsa anlik, yoksa yerel kuyruk
              </Text>
            </View>
            <View style={[styles.metaPill, { backgroundColor: alpha(t.glowOrange, 0.08) }]}>
              <Text style={[styles.metaText, { color: t.textSecondary }]}>
                API secimi: uygulama acilisinda erisilebilir adres otomatik dogrulanir
              </Text>
            </View>
          </View>

          <Text style={[styles.note, { color: t.textSecondary }]}>
            Otomatik konum paylasimi sabit acil esikte calisir: M5+ ve 150 km.
          </Text>

          <GlowButton t={t} label="Uyari Tercihlerini Kaydet" onPress={() => void saveAlertPreferences()} />
        </GlassCard>

        <GlassCard t={t} style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Acil Kisi</Text>
            <CosmicLabel t={t} accent={t.warn}>priority contact</CosmicLabel>
          </View>
          <Text style={[styles.helper, { color: t.textSecondary }]}>
            Acil ekrandaki hizli durum mesajlari ve otomatik konum paylasimi bu kullaniciya gider.
          </Text>
          <TextInput
            style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.inputBg }]}
            placeholder="Acil kisi kullanici adi"
            placeholderTextColor={t.textMuted}
            autoCapitalize="none"
            value={contactIn}
            onChangeText={setContactIn}
          />
          <View style={styles.buttonRow}>
            <GlowButton
              t={t}
              label="Acil Kisiyi Kaydet"
              onPress={() => void saveContact()}
              disabled={busy || !token}
              style={styles.flexButton}
            />
            <GlowButton
              t={t}
              tone="orange"
              label="Konum Izni Ver"
              onPress={() => void askLocation()}
              style={styles.flexButton}
            />
          </View>
        </GlassCard>

        <GlassCard t={t} tone="cool" style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: t.text }]}>Sunucu</Text>
            <CosmicLabel t={t}>endpoint</CosmicLabel>
          </View>
          <Text style={[styles.helper, { color: t.textSecondary }]}>
            Mobil uygulamanin baglandigi backend kok adresi.
          </Text>
          <TextInput
            style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.inputBg }]}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={DEFAULT_API_URL}
            placeholderTextColor={t.textMuted}
            value={urlInput}
            onChangeText={setUrlInput}
          />
          <GlowButton t={t} label="API Adresini Kaydet" onPress={() => void saveUrl()} />
        </GlassCard>

        {message ? (
          <GlassCard t={t} style={styles.messageCard}>
            <Text style={[styles.messageText, { color: t.textSecondary }]}>{message}</Text>
          </GlassCard>
        ) : null}
      </ScrollView>
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    scroll: { flex: 1 },
    pad: { padding: 18, paddingBottom: 118, gap: 16 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    heroCard: { gap: 10 },
    heroHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    heroTitle: { fontSize: 24, fontWeight: '800', fontFamily: t.displayFont },
    heroText: { fontSize: 14, lineHeight: 21 },
    sectionCard: { gap: 12 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' },
    sectionTitle: { fontSize: 20, fontWeight: '800', fontFamily: t.displayFont },
    helper: { fontSize: 13, lineHeight: 19 },
    accountRow: {
      borderRadius: 18,
      borderWidth: 1,
      padding: 14,
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
    },
    accountName: { fontSize: 16, fontWeight: '800', fontFamily: t.displayFont },
    accountSub: { fontSize: 12, lineHeight: 18, marginTop: 2 },
    input: {
      minHeight: 52,
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 16,
      fontSize: 15,
    },
    buttonRow: { flexDirection: 'row', gap: 10 },
    flexButton: { flex: 1 },
    fieldTitle: { fontSize: 15, fontWeight: '700' },
    switchRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    label: { fontSize: 12, fontWeight: '700', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
    metaGrid: { gap: 8 },
    metaPill: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
    metaText: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
    note: { fontSize: 12, lineHeight: 18 },
    messageCard: { padding: 16 },
    messageText: { fontSize: 13, lineHeight: 19 },
  });
}
