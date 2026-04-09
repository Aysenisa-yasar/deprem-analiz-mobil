import { StyleSheet, Text, View } from 'react-native';

import type { ThemeTokens } from '@/constants/theme';

import { alpha } from './cosmic';

export function SeismicPulseMark({
  t,
  size = 104,
  showWordmark = false,
}: {
  t: ThemeTokens;
  size?: number;
  showWordmark?: boolean;
}) {
  const outerSize = size;
  const middleSize = size * 0.7;
  const innerSize = size * 0.42;
  const coreSize = size * 0.14;
  const waveWidth = size * 0.72;
  const waveHeight = size * 0.14;

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.mark,
          {
            width: outerSize,
            height: outerSize,
            borderRadius: outerSize / 2,
            backgroundColor: alpha(t.glowBlue, 0.08),
            borderColor: alpha(t.glowBlue, 0.18),
          },
        ]}>
        <View
          style={[
            styles.ring,
            {
              width: outerSize * 0.88,
              height: outerSize * 0.88,
              borderRadius: outerSize * 0.44,
              borderColor: alpha(t.glowBlue, 0.38),
            },
          ]}
        />
        <View
          style={[
            styles.ring,
            {
              width: middleSize,
              height: middleSize,
              borderRadius: middleSize / 2,
              borderColor: alpha(t.glowOrange, 0.62),
            },
          ]}
        />
        <View
          style={[
            styles.ring,
            {
              width: innerSize,
              height: innerSize,
              borderRadius: innerSize / 2,
              borderColor: alpha(t.star, 0.75),
            },
          ]}
        />
        <View
          style={[
            styles.core,
            {
              width: coreSize,
              height: coreSize,
              borderRadius: coreSize / 2,
              backgroundColor: t.glowOrange,
              shadowColor: t.glowOrange,
            },
          ]}
        />
        <View
          style={[
            styles.faultLine,
            {
              width: outerSize * 0.86,
              backgroundColor: alpha(t.glowOrange, 0.42),
              shadowColor: t.glowOrange,
            },
          ]}
        />
        <View
          style={[
            styles.waveWrap,
            {
              width: waveWidth,
              height: waveHeight,
              bottom: outerSize * 0.17,
              backgroundColor: alpha(t.overlayStrong, 0.8),
              borderColor: alpha(t.glowBlue, 0.16),
            },
          ]}>
          {[0.36, 0.7, 0.48, 0.94, 0.58, 0.8, 0.42].map((ratio, index) => (
            <View
              key={`${ratio}-${index}`}
              style={[
                styles.waveBar,
                {
                  height: waveHeight * ratio,
                  backgroundColor: index % 3 === 1 ? t.glowOrange : t.glowBlue,
                },
              ]}
            />
          ))}
        </View>
      </View>

      {showWordmark ? (
        <View style={styles.wordmark}>
          <Text style={[styles.wordmarkTitle, { color: t.text, fontFamily: t.displayFont }]}>
            DepremAnaliz
          </Text>
          <Text style={[styles.wordmarkSub, { color: t.textSecondary }]}>
            Live risk, direct relay, real device P2P
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 14,
  },
  mark: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
  },
  core: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
  },
  faultLine: {
    position: 'absolute',
    height: 2,
    borderRadius: 999,
    transform: [{ rotate: '-27deg' }],
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  waveWrap: {
    position: 'absolute',
    left: '14%',
    right: '14%',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  waveBar: {
    width: 5,
    borderRadius: 999,
  },
  wordmark: {
    alignItems: 'center',
    gap: 4,
  },
  wordmarkTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  wordmarkSub: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
});
