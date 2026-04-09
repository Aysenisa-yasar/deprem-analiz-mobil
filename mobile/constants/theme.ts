export type ColorScheme = 'light' | 'dark';

const themeConst = {
  light: {
    bg: '#060914',
    surface: 'rgba(11, 17, 31, 0.88)',
    surfaceMuted: 'rgba(98, 116, 163, 0.14)',
    text: '#f7fbff',
    textSecondary: '#b6c5e6',
    textMuted: '#6c7ca6',
    border: 'rgba(123, 150, 228, 0.20)',
    accent: '#5fd8ff',
    accentRipple: '#31bce8',
    onAccent: '#041521',
    warn: '#f2c94c',
    danger: '#ff4d4f',
    success: '#27ae60',
    high: '#ff4d4f',
    mid: '#f2c94c',
    low: '#27ae60',
    tabBar: 'rgba(7, 10, 20, 0.94)',
    tabBarBorder: 'rgba(130, 154, 230, 0.16)',
    brandHeader: 'rgba(13, 19, 38, 0.95)',
    brandOnHeader: '#eef7ff',
    listCard: 'rgba(12, 18, 33, 0.96)',
    brandTab: '#7be0ff',
    mapMarkerBg: 'rgba(255, 255, 255, 0.94)',
    glassOverlay: 'rgba(10, 16, 30, 0.74)',
    panel: 'rgba(14, 20, 38, 0.90)',
    panelSoft: 'rgba(17, 24, 44, 0.72)',
    panelWarm: 'rgba(54, 26, 23, 0.62)',
    panelCool: 'rgba(14, 35, 52, 0.60)',
    inputBg: 'rgba(12, 17, 32, 0.78)',
    glowBlue: '#41d4ff',
    glowOrange: '#ff8a4d',
    glowPurple: '#a78bfa',
    star: 'rgba(201, 229, 255, 0.82)',
    overlayStrong: 'rgba(3, 7, 18, 0.94)',
    displayFont: 'SpaceMono',
  },
  dark: {
    bg: '#030712',
    surface: 'rgba(9, 14, 27, 0.90)',
    surfaceMuted: 'rgba(93, 112, 160, 0.16)',
    text: '#f5f8ff',
    textSecondary: '#aebee0',
    textMuted: '#66779e',
    border: 'rgba(118, 142, 214, 0.22)',
    accent: '#58d4ff',
    accentRipple: '#2aa9d9',
    onAccent: '#04121b',
    warn: '#f2c94c',
    danger: '#ff5a5f',
    success: '#34c759',
    high: '#ff5a5f',
    mid: '#f2c94c',
    low: '#34c759',
    tabBar: 'rgba(6, 10, 20, 0.96)',
    tabBarBorder: 'rgba(126, 150, 221, 0.18)',
    brandHeader: 'rgba(11, 16, 30, 0.96)',
    brandOnHeader: '#eef6ff',
    listCard: 'rgba(10, 15, 28, 0.95)',
    brandTab: '#74d7ff',
    mapMarkerBg: 'rgba(255, 255, 255, 0.94)',
    glassOverlay: 'rgba(9, 14, 26, 0.78)',
    panel: 'rgba(12, 18, 34, 0.92)',
    panelSoft: 'rgba(18, 24, 42, 0.76)',
    panelWarm: 'rgba(57, 28, 22, 0.64)',
    panelCool: 'rgba(13, 34, 51, 0.62)',
    inputBg: 'rgba(10, 15, 29, 0.84)',
    glowBlue: '#36d1ff',
    glowOrange: '#ff7a45',
    glowPurple: '#8b7cff',
    star: 'rgba(208, 230, 255, 0.84)',
    overlayStrong: 'rgba(2, 5, 15, 0.96)',
    displayFont: 'SpaceMono',
  },
} as const;

export const theme = themeConst;

export type ThemeTokens = (typeof theme)[ColorScheme];

export function riskAccent(
  scheme: keyof typeof theme,
  riskLevel: string | undefined,
  riskScore?: number
): string {
  const t = theme[scheme];
  const lv = (riskLevel || '').toLowerCase();
  const normalizedScore =
    riskScore == null ? null : riskScore <= 1 ? riskScore : riskScore / 10;

  if (lv.includes('yuksek') || lv.includes('high') || (normalizedScore != null && normalizedScore >= 0.7)) {
    return t.high;
  }

  if (
    lv.includes('orta') ||
    lv.includes('watch') ||
    lv.includes('prepare') ||
    (normalizedScore != null && normalizedScore >= 0.45)
  ) {
    return t.mid;
  }

  return t.low;
}
