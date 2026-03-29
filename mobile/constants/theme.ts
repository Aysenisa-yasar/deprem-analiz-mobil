/**
 * Deprem teması — yüksek kontrast, sade gölgeler (GPU / pil dostu).
 */
export type ColorScheme = 'light' | 'dark';

const themeConst = {
  light: {
    bg: '#f4f4f5',
    surface: '#ffffff',
    surfaceMuted: '#f4f4f5',
    text: '#0f172a',
    textSecondary: '#64748b',
    textMuted: '#94a3b8',
    border: '#e2e8f0',
    accent: '#0d9488',
    accentRipple: '#0f766e',
    onAccent: '#ffffff',
    warn: '#d97706',
    danger: '#dc2626',
    success: '#059669',
    high: '#ea580c',
    mid: '#ca8a04',
    low: '#0d9488',
    tabBar: 'rgba(255,255,255,0.94)',
    tabBarBorder: 'transparent',
    brandHeader: '#e53935',
    brandOnHeader: '#ffffff',
    listCard: '#fff9e6',
    brandTab: '#e53935',
    mapMarkerBg: '#ffffff',
    glassOverlay: 'rgba(255,255,255,0.88)',
  },
  dark: {
    bg: '#020617',
    surface: '#0f172a',
    surfaceMuted: '#1e293b',
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
    border: '#334155',
    accent: '#2dd4bf',
    accentRipple: '#14b8a6',
    onAccent: '#042f2e',
    warn: '#fbbf24',
    danger: '#f87171',
    success: '#34d399',
    high: '#fb923c',
    mid: '#facc15',
    low: '#2dd4bf',
    tabBar: 'rgba(15,23,42,0.94)',
    tabBarBorder: 'transparent',
    brandHeader: '#7f1d1d',
    brandOnHeader: '#fecaca',
    listCard: '#151d2e',
    brandTab: '#f87171',
    mapMarkerBg: '#1e293b',
    glassOverlay: 'rgba(30,41,59,0.9)',
  },
} as const;

export const theme = themeConst;

/** Aktif tema renkleri (açık / koyu ortak şekil) */
export type ThemeTokens = (typeof theme)[ColorScheme];

export function riskAccent(
  scheme: keyof typeof theme,
  riskLevel: string | undefined,
  riskScore?: number
): string {
  const t = theme[scheme];
  const lv = (riskLevel || '').toLowerCase();
  if (lv.includes('yüksek') || (riskScore != null && riskScore >= 5.5)) return t.high;
  if (lv.includes('orta') || (riskScore != null && riskScore >= 3.5)) return t.mid;
  return t.low;
}
