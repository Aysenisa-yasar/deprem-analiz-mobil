import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Location from 'expo-location';

import { useAuth } from '@/context/AuthContext';
import { DEFAULT_API_URL } from '@/lib/config';
import { setEmergencyContact } from '@/lib/api';

export default function AyarlarScreen() {
  const { ready, token, user, apiBase, setApiBase, login, register, logout, refreshMe } =
    useAuth();
  const [urlInput, setUrlInput] = useState(apiBase);
  const [userIn, setUserIn] = useState('');
  const [passIn, setPassIn] = useState('');
  const [contactIn, setContactIn] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setUrlInput(apiBase);
  }, [apiBase]);

  useEffect(() => {
    if (user?.emergency_contact) setContactIn(user.emergency_contact);
  }, [user?.emergency_contact]);

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const saveUrl = async () => {
    const u = urlInput.trim() || DEFAULT_API_URL;
    await setApiBase(u);
    setMsg('API adresi kaydedildi');
  };

  const doLogin = async () => {
    setBusy(true);
    setMsg(null);
    const r = await login(userIn.trim(), passIn);
    setBusy(false);
    if (!r.ok) setMsg(r.message || 'Hata');
    else {
      setMsg('Giriş OK');
      setPassIn('');
    }
  };

  const doRegister = async () => {
    setBusy(true);
    setMsg(null);
    const r = await register(userIn.trim(), passIn);
    setBusy(false);
    if (!r.ok) setMsg(r.message || 'Hata');
    else {
      setMsg('Kayıt OK');
      setPassIn('');
    }
  };

  const saveContact = async () => {
    if (!token) {
      setMsg('Önce giriş yapın');
      return;
    }
    setBusy(true);
    const r = await setEmergencyContact(apiBase, token, contactIn.trim());
    setBusy(false);
    if (!r.ok) setMsg(r.message || 'Kaydedilemedi');
    else {
      setMsg('Acil kişi güncellendi');
      await refreshMe();
    }
  };

  const askLocation = async () => {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      Alert.alert('Konum', 'Deprem uyarısı için konum izni gerekir.');
      return;
    }
    if (Platform.OS === 'ios') {
      try {
        const bg = await Location.requestBackgroundPermissionsAsync();
        if (bg.status !== 'granted') {
          Alert.alert(
            'Arka plan',
            'Uyarılar ön planda çalışır. Tam arka plan için ek ayar gerekebilir.'
          );
        }
      } catch {
        /* Simulator / web uyumsuzluğu */
      }
    }
    setMsg('Konum izni verildi');
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.pad}>
      <Text style={styles.title}>Hesap ve sunucu</Text>
      <Text style={styles.label}>API kök URL</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={DEFAULT_API_URL}
        placeholderTextColor="#a1a1aa"
        value={urlInput}
        onChangeText={setUrlInput}
      />
      <Pressable style={styles.secondary} onPress={saveUrl}>
        <Text style={styles.secondaryText}>API kaydet</Text>
      </Pressable>

      <Text style={styles.section}>Giriş / kayıt (kullanıcı adı ile)</Text>
      <TextInput
        style={styles.input}
        placeholder="Kullanıcı adı"
        placeholderTextColor="#a1a1aa"
        autoCapitalize="none"
        value={userIn}
        onChangeText={setUserIn}
      />
      <TextInput
        style={styles.input}
        placeholder="Şifre"
        placeholderTextColor="#a1a1aa"
        secureTextEntry
        value={passIn}
        onChangeText={setPassIn}
      />
      <View style={styles.row}>
        <Pressable style={[styles.btn, styles.flex1]} onPress={doLogin} disabled={busy}>
          <Text style={styles.btnText}>Giriş</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.outline, styles.flex1]}
          onPress={doRegister}
          disabled={busy}>
          <Text style={styles.outlineText}>Kayıt ol</Text>
        </Pressable>
      </View>

      {token && user ? (
        <View style={styles.box}>
          <FontAwesome name="check-circle" size={20} color="#16a34a" />
          <Text style={styles.userLine}>@{user.username}</Text>
          {user.emergency_contact ? (
            <Text style={styles.sub}>
              Acil kişi: @{user.emergency_contact}
            </Text>
          ) : (
            <Text style={styles.warn}>Acil kişi seçilmedi (M5+ uyarısı gönderilmez)</Text>
          )}
        </View>
      ) : null}

      <Text style={styles.section}>Acil iletişim (M5+, 150 km)</Text>
      <Text style={styles.hint}>
        Deprem büyüklüğü 5 ve üzeri ve sizden 150 km içindeyken seçtiğiniz kullanıcıya otomatik
        konum mesajı gider. Alıcı önce uygulamaya kayıtlı olmalı.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Acil kişi kullanıcı adı"
        placeholderTextColor="#a1a1aa"
        autoCapitalize="none"
        value={contactIn}
        onChangeText={setContactIn}
      />
      <Pressable style={styles.btn} onPress={saveContact} disabled={busy || !token}>
        <Text style={styles.btnText}>Acil kişiyi kaydet</Text>
      </Pressable>

      <Pressable style={styles.secondary} onPress={askLocation}>
        <Text style={styles.secondaryText}>Konum iznini iste</Text>
      </Pressable>

      {token ? (
        <Pressable style={styles.danger} onPress={logout}>
          <Text style={styles.dangerText}>Çıkış</Text>
        </Pressable>
      ) : null}

      {msg ? <Text style={styles.msg}>{msg}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f4f4f5' },
  pad: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  section: { fontSize: 16, fontWeight: '600', marginTop: 20, marginBottom: 8 },
  label: { fontSize: 13, color: '#52525b', marginBottom: 4 },
  hint: { fontSize: 13, color: '#71717a', marginBottom: 8, lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: '#d4d4d8',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
    fontSize: 16,
    marginBottom: 10,
  },
  row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  flex1: { flex: 1 },
  btn: {
    backgroundColor: '#2563eb',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  btnText: { color: '#fff', fontWeight: '600' },
  outline: { backgroundColor: 'transparent', borderWidth: 2, borderColor: '#2563eb' },
  outlineText: { color: '#2563eb', fontWeight: '600' },
  secondary: { padding: 12, alignItems: 'center' },
  secondaryText: { color: '#2563eb', fontWeight: '500' },
  box: {
    marginTop: 12,
    padding: 14,
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  userLine: { fontSize: 16, fontWeight: '600', marginTop: 6 },
  sub: { fontSize: 14, color: '#166534', marginTop: 4 },
  warn: { fontSize: 13, color: '#b45309', marginTop: 4 },
  danger: { marginTop: 24, padding: 14, alignItems: 'center' },
  dangerText: { color: '#b91c1c', fontWeight: '600' },
  msg: { marginTop: 16, color: '#52525b' },
});
