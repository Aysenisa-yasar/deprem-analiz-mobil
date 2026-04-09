import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { ThemeTokens } from '@/constants/theme';

type CardTone = 'default' | 'warm' | 'cool';
type ButtonTone = 'blue' | 'orange' | 'danger';

const STARS = [
  { top: 34, left: 28, size: 2.2, opacity: 0.9 },
  { top: 52, left: 286, size: 1.8, opacity: 0.72 },
  { top: 84, left: 162, size: 1.6, opacity: 0.58 },
  { top: 132, left: 332, size: 2.4, opacity: 0.86 },
  { top: 156, left: 54, size: 1.6, opacity: 0.75 },
  { top: 204, left: 238, size: 1.8, opacity: 0.66 },
  { top: 248, left: 88, size: 2.3, opacity: 0.88 },
  { top: 292, left: 308, size: 1.6, opacity: 0.56 },
  { top: 336, left: 24, size: 2.1, opacity: 0.74 },
  { top: 362, left: 196, size: 1.5, opacity: 0.62 },
  { top: 388, left: 272, size: 2.4, opacity: 0.9 },
  { top: 436, left: 108, size: 1.7, opacity: 0.68 },
  { top: 468, left: 316, size: 1.5, opacity: 0.72 },
  { top: 504, left: 66, size: 1.9, opacity: 0.78 },
  { top: 548, left: 230, size: 2.4, opacity: 0.84 },
  { top: 582, left: 142, size: 1.6, opacity: 0.62 },
];

function toneBackground(t: ThemeTokens, tone: CardTone) {
  if (tone === 'warm') return t.panelWarm;
  if (tone === 'cool') return t.panelCool;
  return t.panel;
}

export function alpha(hex: string, opacity: number): string {
  const safeOpacity = Math.max(0, Math.min(1, opacity));
  if (hex.startsWith('rgba(') || hex.startsWith('rgb(')) return hex;
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const value = Number.parseInt(clean, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${safeOpacity})`;
}

export function CosmicBackdrop({
  t,
  compact = false,
}: {
  t: ThemeTokens;
  compact?: boolean;
}) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg }]} />
      <View
        style={[
          styles.glowOrb,
          {
            backgroundColor: alpha(t.glowOrange, compact ? 0.18 : 0.26),
            top: compact ? -18 : 42,
            left: -56,
            width: compact ? 168 : 236,
            height: compact ? 168 : 236,
          },
        ]}
      />
      <View
        style={[
          styles.glowOrb,
          {
            backgroundColor: alpha(t.glowBlue, compact ? 0.16 : 0.22),
            top: compact ? 78 : 168,
            right: -44,
            width: compact ? 152 : 208,
            height: compact ? 152 : 208,
          },
        ]}
      />
      <View
        style={[
          styles.glowOrb,
          {
            backgroundColor: alpha(t.glowPurple, compact ? 0.12 : 0.18),
            bottom: compact ? 64 : 132,
            left: '33%',
            width: compact ? 146 : 188,
            height: compact ? 146 : 188,
          },
        ]}
      />
      {STARS.map((star, index) => (
        <View
          key={`star-${index}`}
          style={[
            styles.star,
            {
              top: star.top,
              left: star.left,
              width: star.size,
              height: star.size,
              opacity: star.opacity,
              backgroundColor: t.star,
            },
          ]}
        />
      ))}
      <View style={[styles.horizon, { backgroundColor: alpha(t.glowOrange, compact ? 0.2 : 0.28) }]} />
    </View>
  );
}

export function GlassCard({
  children,
  t,
  tone = 'default',
  style,
}: {
  children: ReactNode;
  t: ThemeTokens;
  tone?: CardTone;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: toneBackground(t, tone),
          borderColor: t.border,
          shadowColor: tone === 'warm' ? t.glowOrange : t.glowBlue,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export function CosmicLabel({
  t,
  children,
  accent,
}: {
  t: ThemeTokens;
  children: ReactNode;
  accent?: string;
}) {
  return (
    <View
      style={[
        styles.label,
        {
          backgroundColor: alpha(accent || t.glowBlue, 0.12),
          borderColor: alpha(accent || t.glowBlue, 0.22),
        },
      ]}>
      <Text style={[styles.labelText, { color: accent || t.brandTab, fontFamily: t.displayFont }]}>{children}</Text>
    </View>
  );
}

export function GlowButton({
  t,
  label,
  onPress,
  tone = 'blue',
  disabled = false,
  trailing,
  style,
}: {
  t: ThemeTokens;
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const color =
    tone === 'orange' ? t.glowOrange : tone === 'danger' ? t.danger : t.glowBlue;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: disabled ? alpha(color, 0.16) : alpha(color, pressed ? 0.24 : 0.18),
          borderColor: alpha(color, disabled ? 0.18 : 0.46),
          opacity: disabled ? 0.58 : 1,
        },
        style,
      ]}>
      <Text style={[styles.buttonText, { color: '#eef7ff', fontFamily: t.displayFont }]}>{label}</Text>
      {trailing}
    </Pressable>
  );
}

export function MiniBars({
  values,
  t,
  positiveColor,
  negativeColor,
  style,
}: {
  values: number[];
  t: ThemeTokens;
  positiveColor?: string;
  negativeColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const max = Math.max(...values.map((value) => Math.abs(value)), 1);

  return (
    <View style={[styles.barRow, style]}>
      {values.map((value, index) => {
        const height = 16 + (Math.abs(value) / max) * 42;
        const isPositive = value >= 0;
        return (
          <View key={`${index}-${value}`} style={styles.barSlot}>
            <View
              style={[
                styles.bar,
                {
                  height,
                  backgroundColor: isPositive
                    ? positiveColor || alpha(t.glowBlue, 0.88)
                    : negativeColor || alpha(t.glowOrange, 0.82),
                  shadowColor: isPositive ? t.glowBlue : t.glowOrange,
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

export function AvatarOrb({
  t,
  label,
  size = 38,
}: {
  t: ThemeTokens;
  label: string;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: alpha(t.glowBlue, 0.12),
          borderColor: alpha(t.glowBlue, 0.32),
        },
      ]}>
      <Text style={[styles.avatarText, { color: t.text, fontFamily: t.displayFont }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  glowOrb: {
    position: 'absolute',
    borderRadius: 999,
  },
  star: {
    position: 'absolute',
    borderRadius: 999,
  },
  horizon: {
    position: 'absolute',
    left: -12,
    right: -12,
    bottom: 120,
    height: 2,
    opacity: 0.45,
  },
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 10,
  },
  label: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  labelText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  button: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonText: { fontSize: 15, fontWeight: '800' },
  barRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    minHeight: 72,
  },
  barSlot: {
    flex: 1,
    justifyContent: 'flex-end',
    minWidth: 8,
  },
  bar: {
    borderRadius: 999,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  avatarText: { fontSize: 14, fontWeight: '800' },
});
