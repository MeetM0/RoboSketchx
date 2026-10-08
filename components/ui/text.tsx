import { Text as RNText, type TextProps } from 'react-native';

import { Type, type Palette, type TypeVariant } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextTone =
  | 'default'
  | 'secondary'
  | 'tertiary'
  | 'accent'
  | 'onAccent'
  | 'success'
  | 'warning'
  | 'danger';

const TONE: Record<TextTone, keyof Palette> = {
  default: 'text',
  secondary: 'textSecondary',
  tertiary: 'textTertiary',
  accent: 'accent',
  onAccent: 'onAccent',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

type Props = TextProps & { variant?: TypeVariant; tone?: TextTone };

/** Text on the type scale (docs/DESIGN.md §7). */
export function Text({ variant = 'body', tone = 'default', style, ...rest }: Props) {
  const colors = useTheme();
  return (
    <RNText
      role={variant === 'title' ? 'heading' : undefined}
      style={[Type[variant], { color: colors[TONE[tone]] }, style]}
      {...rest}
    />
  );
}
