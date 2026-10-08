/**
 * Design tokens. See docs/DESIGN.md: neutral structure, one accent for the primary action,
 * selection and focus, semantic colours only for state. Every text colour meets WCAG AA on
 * `bg` and `surface`.
 */

import { Platform } from 'react-native';

const light = {
  bg: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F3F5',
  border: '#E2E5E9',
  borderStrong: '#CDD2D8',
  text: '#14171A',
  textSecondary: '#5B6470',
  textTertiary: '#666F7A',
  accent: '#2F5BD3',
  accentPressed: '#2649AE',
  accentSubtle: '#EAF0FD',
  onAccent: '#FFFFFF',
  success: '#1A7247',
  successSubtle: '#E7F5EE',
  warning: '#8F5400',
  warningSubtle: '#FFF4E0',
  danger: '#C2362F',
  dangerSubtle: '#FDECEB',
  focus: '#2F5BD3',
  scrim: 'rgba(20, 23, 26, 0.4)',
  /** The sheet of paper in previews, and the pen on it. */
  paper: '#FFFFFF',
  ink: '#1A1D21',
  margin: '#C9CED5',
};

export type Palette = typeof light;

const dark: Palette = {
  bg: '#0F1115',
  surface: '#171A20',
  surfaceMuted: '#1E222A',
  border: '#2A2F38',
  borderStrong: '#3A404B',
  text: '#E8EAED',
  textSecondary: '#A3ABB6',
  textTertiary: '#8A929D',
  accent: '#7EA2FF',
  accentPressed: '#9DB8FF',
  accentSubtle: '#1C2740',
  onAccent: '#0F1115',
  success: '#5CC08F',
  successSubtle: '#15281F',
  warning: '#E6B35C',
  warningSubtle: '#2B2214',
  danger: '#F08A83',
  dangerSubtle: '#2E1715',
  focus: '#7EA2FF',
  scrim: 'rgba(0, 0, 0, 0.6)',
  paper: '#F4F2EC',
  ink: '#1A1D21',
  margin: '#C9C5BA',
};

export const Colors = { light, dark };

/** 4 px grid. */
export const Space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const Radius = {
  control: 6,
  card: 10,
  sheet: 14,
  pill: 999,
} as const;

export const Layout = {
  /** Single-column content width. */
  maxContent: 720,
  /** Two-column screens from this window width. */
  wideBreakpoint: 960,
  /** Overall width of two-column screens. */
  maxWide: 1280,
  /** Controls column on two-column screens. */
  sideColumn: 420,
  gutter: 16,
  /** Minimum touch target. */
  hitTarget: 44,
} as const;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', mono: 'ui-monospace' },
  default: { sans: 'normal', mono: 'monospace' },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

export const Type = {
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600' },
  section: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  secondary: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  overline: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  mono: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
    fontFamily: Fonts?.mono,
  },
} as const;

export type TypeVariant = keyof typeof Type;
