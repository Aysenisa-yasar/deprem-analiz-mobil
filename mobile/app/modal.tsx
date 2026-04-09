import FontAwesome from '@expo/vector-icons/FontAwesome';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CosmicBackdrop, CosmicLabel, GlassCard, GlowButton } from '@/components/cosmic';
import { useColorScheme } from '@/components/useColorScheme';
import { theme, type ThemeTokens } from '@/constants/theme';

export default function ModalScreen() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const t = theme[scheme];
  const styles = useMemo(() => makeStyles(t), [t]);

  return (
    <View style={styles.root}>
      <CosmicBackdrop t={t} compact />
      <View style={styles.container}>
        <GlassCard t={t} tone="cool" style={styles.card}>
          <CosmicLabel t={t}>info panel</CosmicLabel>
          <FontAwesome name="info-circle" size={28} color={t.brandTab} />
          <Text style={[styles.title, { color: t.text }]}>Bilgi Penceresi</Text>
          <Text style={[styles.body, { color: t.textSecondary }]}>
            Bu alanı ileride detay paneli, onboarding ipucu ya da kritik bilgilendirme akışı için
            kullanabiliriz.
          </Text>
          <GlowButton t={t} label="Kapat" onPress={() => router.back()} />
          <Pressable onPress={() => router.replace('/(tabs)')} style={styles.link}>
            <Text style={[styles.linkText, { color: t.brandTab }]}>Ana akışa dön</Text>
          </Pressable>
        </GlassCard>
      </View>
      <StatusBar style="light" />
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 },
    card: { width: '100%', maxWidth: 420, alignItems: 'center', gap: 12, padding: 22 },
    title: { fontSize: 24, fontWeight: '800', fontFamily: t.displayFont },
    body: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
    link: { paddingTop: 2 },
    linkText: { fontSize: 14, fontWeight: '700' },
  });
}
