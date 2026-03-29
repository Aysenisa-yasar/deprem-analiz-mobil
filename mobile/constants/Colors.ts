import { theme } from './theme';

const tintLight = theme.light.accent;
const tintDark = theme.dark.accent;

export default {
  light: {
    text: theme.light.text,
    background: theme.light.bg,
    tint: tintLight,
    tabIconDefault: theme.light.textMuted,
    tabIconSelected: tintLight,
  },
  dark: {
    text: theme.dark.text,
    background: theme.dark.bg,
    tint: tintDark,
    tabIconDefault: theme.dark.textMuted,
    tabIconSelected: tintDark,
  },
};
