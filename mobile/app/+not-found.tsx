import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, Stack } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CosmicBackdrop, CosmicLabel, GlassCard } from '@/components/cosmic';
import { useColorScheme } from '@/components/useColorScheme';
import { theme, type ThemeTokens } from '@/constants/theme';

export default function NotFoundScreen() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === 'dark' ? 'dark' : 'light';
  const t = theme[scheme];
  const styles = useMemo(() => makeStyles(t), [t]);

  return (
    <>
      <Stack.Screen options={{ title: 'Bulunamadı' }} />
      <View style={styles.root}>
        <CosmicBackdrop t={t} compact />
        <View style={styles.container}>
          <GlassCard t={t} tone="warm" style={styles.card}>
            <CosmicLabel t={t}>404</CosmicLabel>
            <FontAwesome name="compass" size={30} color={t.warn} />
            <Text style={[styles.title, { color: t.text }]}>Bu ekran bulunamadı</Text>
            <Text style={[styles.body, { color: t.textSecondary }]}>
              İstediğin rota şu an uygulamada yok ya da taşınmış olabilir.
            </Text>
            <Link href="/" style={styles.link}>
              <Text style={[styles.linkText, { color: t.brandTab }]}>Ana ekrana dön</Text>
            </Link>
          </GlassCard>
        </View>
      </View>
    </>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 },
    card: { width: '100%', maxWidth: 420, alignItems: 'center', gap: 12, padding: 22 },
    title: { fontSize: 24, fontWeight: '800', fontFamily: t.displayFont, textAlign: 'center' },
    body: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
    link: { marginTop: 4, paddingVertical: 10 },
    linkText: { fontSize: 14, fontWeight: '700' },
  });
}
