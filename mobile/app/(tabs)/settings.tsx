import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';

import { useColorScheme } from '@/components/useColorScheme';
import {
  useAlertPreferences,
  type AlertPreferences,
} from '@/context/AlertPreferencesContext';
import { useAuth } from '@/context/AuthContext';
import { theme, type ThemeTokens } from '@/constants/theme';
import { setEmergencyContact } from '@/lib/api';
import { DEFAULT_API_URL } from '@/lib/config';

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const t = theme[scheme];
  const styles = useMemo(() => makeStyles(t), [t]);

  const { ready, token, user, apiBase, setApiBase, login, register, logout, refreshMe } =
    useAuth();
  const { ready: alertsReady, preferences, updatePreferences } = useAlertPreferences();

  const [urlInput, setUrlInput] = useState(apiBase);
  const [userIn, setUserIn] = useState('');
  const [passIn, setPassIn] = useState('');
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
    setBusy(true);
    setMessage(null);
    const result = await register(userIn.trim(), passIn);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message || 'Kayit olusturulamadi.');
      return;
    }
    setPassIn('');
    setMessage('Kayit tamamlandi.');
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

    await updatePreferences({
      enabled: alertForm.enabled,
      minMagnitude: Number.isFinite(minMagnitude) ? minMagnitude : preferences.minMagnitude,
      maxDistanceKm: Number.isFinite(maxDistanceKm) ? maxDistanceKm : preferences.maxDistanceKm,
    });
    setMessage('Ozel uyari ayarlari kaydedildi.');
  };

  const askLocation = async () => {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      Alert.alert('Konum', 'Deprem uyarilari icin konum izni gerekiyor.');
      return;
    }

    if (Platform.OS === 'ios') {
      try {
        await Location.requestBackgroundPermissionsAsync();
      } catch {
        /* ignore */
      }
    }

    setMessage('Konum izni verildi.');
  };

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: t.bg }]}
      contentContainerStyle={styles.pad}
      keyboardShouldPersistTaps="handled">
      <View style={[styles.heroCard, { backgroundColor: t.surfaceMuted, borderColor: t.border }]}>
        <FontAwesome name="sliders" size={18} color={t.brandTab} />
        <View style={styles.heroBody}>
          <Text style={[styles.heroTitle, { color: t.text }]}>Guvenli ve kisisel kullanim</Text>
          <Text style={[styles.heroText, { color: t.textSecondary }]}>
            Ozel uyari esiklerini, acil kisini ve baglandigin API adresini bu ekrandan yonet.
          </Text>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: t.text }]}>Hesap</Text>
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        {token && user ? (
          <View style={[styles.accountRow, { backgroundColor: t.surfaceMuted }]}>
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
              {user.phone ? (
                <Text style={[styles.accountSub, { color: t.textSecondary }]}>
                  Telefon: {user.phone}
                </Text>
              ) : null}
              {user.email ? (
                <Text style={[styles.accountSub, { color: t.textSecondary }]}>
                  E-posta: {user.email}
                </Text>
              ) : null}
            </View>
          </View>
        ) : (
          <Text style={[styles.helper, { color: t.textSecondary }]}>
            Hesap acinca mesajlar, acil durum durumlari ve otomatik konum paylasimi kullanilabilir.
            Ilk ekranda telefon veya e-posta ile kod akisi da destekleniyor.
          </Text>
        )}

        {!token ? (
          <>
            <TextInput
              style={[
                styles.input,
                { color: t.text, borderColor: t.border, backgroundColor: t.surfaceMuted },
              ]}
              placeholder="Kullanici adi"
              placeholderTextColor={t.textMuted}
              autoCapitalize="none"
              value={userIn}
              onChangeText={setUserIn}
            />
            <TextInput
              style={[
                styles.input,
                { color: t.text, borderColor: t.border, backgroundColor: t.surfaceMuted },
              ]}
              placeholder="Sifre"
              placeholderTextColor={t.textMuted}
              secureTextEntry
              value={passIn}
              onChangeText={setPassIn}
            />
            <View style={styles.row}>
              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  styles.flex1,
                  { backgroundColor: pressed || busy ? t.accentRipple : t.accent },
                ]}
                onPress={() => void doLogin()}
                disabled={busy}>
                <Text style={[styles.primaryBtnText, { color: scheme === 'dark' ? t.onAccent : '#fff' }]}>
                  Giris
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.outlineBtn,
                  styles.flex1,
                  { borderColor: t.accent, opacity: pressed || busy ? 0.82 : 1 },
                ]}
                onPress={() => void doRegister()}
                disabled={busy}>
                <Text style={[styles.outlineBtnText, { color: t.accent }]}>Kayit ol</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Pressable style={styles.logoutBtn} onPress={logout}>
            <Text style={[styles.logoutText, { color: t.danger }]}>Cikis yap</Text>
          </Pressable>
        )}
      </View>

      <Text style={[styles.sectionTitle, { color: t.text }]}>Ozel uyarilar</Text>
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.fieldTitle, { color: t.text }]}>Sesli yakin deprem uyarisi</Text>
            <Text style={[styles.helper, { color: t.textSecondary }]}>
              Uygulama acikken secilen buyukluk ve mesafe esigine gore cihazda ses cikarir.
            </Text>
          </View>
          <Switch
            value={alertForm.enabled}
            onValueChange={(value) => setAlertForm((current) => ({ ...current, enabled: value }))}
            trackColor={{ false: t.border, true: t.accent }}
            thumbColor={scheme === 'dark' ? t.surface : '#fff'}
          />
        </View>

        <Text style={[styles.label, { color: t.textMuted }]}>Minimum buyukluk</Text>
        <TextInput
          style={[
            styles.input,
            { color: t.text, borderColor: t.border, backgroundColor: t.surfaceMuted },
          ]}
          keyboardType="decimal-pad"
          value={alertMagnitudeInput}
          onChangeText={setAlertMagnitudeInput}
        />

        <Text style={[styles.label, { color: t.textMuted }]}>Maksimum mesafe (km)</Text>
        <TextInput
          style={[
            styles.input,
            { color: t.text, borderColor: t.border, backgroundColor: t.surfaceMuted },
          ]}
          keyboardType="number-pad"
          value={alertDistanceInput}
          onChangeText={setAlertDistanceInput}
        />

        <Text style={[styles.note, { color: t.textSecondary }]}>
          Acil kisiya otomatik konum paylasimi guvenlik icin sabit esikte calisir: M5+ ve 150 km.
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: pressed ? t.accentRipple : t.accent },
          ]}
          onPress={() => void saveAlertPreferences()}>
          <Text style={[styles.primaryBtnText, { color: scheme === 'dark' ? t.onAccent : '#fff' }]}>
            Uyari tercihlerini kaydet
          </Text>
        </Pressable>
      </View>

      <Text style={[styles.sectionTitle, { color: t.text }]}>Acil kisi</Text>
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={[styles.helper, { color: t.textSecondary }]}>
          Acil ekrandaki hizli durum mesajlari ve otomatik konum paylasimi bu kullaniciya gider.
        </Text>
        <TextInput
          style={[
            styles.input,
            { color: t.text, borderColor: t.border, backgroundColor: t.surfaceMuted },
          ]}
          placeholder="Acil kisi kullanici adi"
          placeholderTextColor={t.textMuted}
          autoCapitalize="none"
          value={contactIn}
          onChangeText={setContactIn}
        />
        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: pressed || busy || !token ? t.accentRipple : t.accent, opacity: !token ? 0.6 : 1 },
          ]}
          onPress={() => void saveContact()}
          disabled={busy || !token}>
          <Text style={[styles.primaryBtnText, { color: scheme === 'dark' ? t.onAccent : '#fff' }]}>
            Acil kisiyi kaydet
          </Text>
        </Pressable>
        <Pressable style={styles.locationLink} onPress={() => void askLocation()}>
          <FontAwesome name="map-marker" size={15} color={t.brandTab} />
          <Text style={[styles.locationLinkText, { color: t.brandTab }]}> Konum izni ver</Text>
        </Pressable>
      </View>

      <Text style={[styles.sectionTitle, { color: t.text }]}>Sunucu</Text>
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={[styles.label, { color: t.textMuted }]}>API kok URL</Text>
        <TextInput
          style={[
            styles.input,
            { color: t.text, borderColor: t.border, backgroundColor: t.surfaceMuted },
          ]}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={DEFAULT_API_URL}
          placeholderTextColor={t.textMuted}
          value={urlInput}
          onChangeText={setUrlInput}
        />
        <Pressable
          style={({ pressed }) => [
            styles.outlineBtn,
            { borderColor: t.accent, opacity: pressed ? 0.82 : 1 },
          ]}
          onPress={() => void saveUrl()}>
          <Text style={[styles.outlineBtnText, { color: t.accent }]}>API adresini kaydet</Text>
        </Pressable>
      </View>

      {message ? (
        <Text style={[styles.message, { color: t.textSecondary, backgroundColor: t.surfaceMuted }]}>
          {message}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    pad: { padding: 18, paddingBottom: 120, gap: 12 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    heroCard: {
      borderRadius: 18,
      borderWidth: 1,
      padding: 16,
      flexDirection: 'row',
      gap: 12,
      marginBottom: 8,
    },
    heroBody: { flex: 1, gap: 4 },
    heroTitle: { fontSize: 17, fontWeight: '800' },
    heroText: { fontSize: 13, lineHeight: 19 },
    sectionTitle: { fontSize: 13, fontWeight: '800', marginTop: 8 },
    card: {
      borderRadius: 18,
      borderWidth: 1,
      padding: 16,
      gap: 10,
    },
    helper: { fontSize: 13, lineHeight: 19 },
    fieldTitle: { fontSize: 15, fontWeight: '700' },
    label: { fontSize: 12, fontWeight: '700', marginTop: 2 },
    note: { fontSize: 12, lineHeight: 18 },
    input: {
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 14,
      fontSize: 15,
    },
    row: { flexDirection: 'row', gap: 10 },
    flex1: { flex: 1 },
    primaryBtn: {
      borderRadius: 14,
      alignItems: 'center',
      paddingVertical: 14,
    },
    primaryBtnText: { fontSize: 15, fontWeight: '800' },
    outlineBtn: {
      borderRadius: 14,
      alignItems: 'center',
      paddingVertical: 14,
      borderWidth: 2,
    },
    outlineBtnText: { fontSize: 15, fontWeight: '800' },
    accountRow: {
      borderRadius: 14,
      padding: 14,
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
    },
    accountName: { fontSize: 15, fontWeight: '800' },
    accountSub: { fontSize: 12, lineHeight: 18, marginTop: 2 },
    logoutBtn: { alignItems: 'center', paddingVertical: 8 },
    logoutText: { fontSize: 15, fontWeight: '800' },
    switchRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    locationLink: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8, flexDirection: 'row' },
    locationLinkText: { fontSize: 14, fontWeight: '700' },
    message: { borderRadius: 12, padding: 12, fontSize: 13, lineHeight: 18 },
  });
}
