import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { Layout, Radius, Space, type Palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { focusRing, type PressState } from './pressable-styles';
import { IconSymbol, type IconSymbolName } from './icon-symbol';
import { Text } from './text';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  title: string;
  icon?: IconSymbolName;
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  loading?: boolean;
  /** Grow to fill the row (flex: 1). */
  grow?: boolean;
};

function colorsFor(variant: ButtonVariant, colors: Palette, pressed: boolean) {
  switch (variant) {
    case 'primary':
      return {
        background: pressed ? colors.accentPressed : colors.accent,
        border: 'transparent',
        foreground: colors.onAccent,
      };
    case 'secondary':
      return {
        background: pressed ? colors.surfaceMuted : colors.surface,
        border: colors.borderStrong,
        foreground: colors.text,
      };
    case 'tertiary':
      return {
        background: pressed ? colors.surfaceMuted : 'transparent',
        border: 'transparent',
        foreground: colors.accent,
      };
    case 'destructive':
      return {
        background: pressed ? colors.dangerSubtle : colors.surface,
        border: colors.borderStrong,
        foreground: colors.danger,
      };
  }
}

export function Button({
  title,
  icon,
  variant = 'primary',
  size = 'md',
  loading,
  grow,
  disabled,
  ...rest
}: Props) {
  const colors = useTheme();
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      style={(state: PressState) => {
        const c = colorsFor(variant, colors, state.pressed);
        return [
          styles.button,
          size === 'sm' && styles.small,
          grow && styles.grow,
          { backgroundColor: c.background, borderColor: c.border },
          disabled && styles.disabled,
          focusRing(state, colors),
        ];
      }}
      {...rest}>
      {({ pressed }) => {
        const c = colorsFor(variant, colors, pressed);
        return (
          <View style={styles.content}>
            {loading ? (
              <ActivityIndicator size="small" color={c.foreground} />
            ) : (
              icon && <IconSymbol name={icon} size={size === 'sm' ? 18 : 20} color={c.foreground} />
            )}
            <Text
              variant={size === 'sm' ? 'label' : 'bodyStrong'}
              style={{ color: c.foreground }}
              numberOfLines={1}>
              {title}
            </Text>
          </View>
        );
      }}
    </Pressable>
  );
}

/** Square icon-only button with an accessible label. */
export function IconButton({
  icon,
  label,
  variant = 'secondary',
  disabled,
  ...rest
}: Omit<PressableProps, 'children' | 'style'> & {
  icon: IconSymbolName;
  label: string;
  variant?: 'secondary' | 'tertiary';
}) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      style={(state: PressState) => {
        const c = colorsFor(variant, colors, state.pressed);
        return [
          styles.icon,
          { backgroundColor: c.background, borderColor: c.border },
          disabled && styles.disabled,
          focusRing(state, colors),
        ];
      }}
      {...rest}>
      <IconSymbol
        name={icon}
        size={20}
        color={variant === 'tertiary' ? colors.textSecondary : colors.text}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: Layout.hitTarget + 4,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.control,
    borderWidth: 1,
    justifyContent: 'center',
  },
  small: {
    minHeight: 36,
    paddingHorizontal: Space.md,
  },
  grow: {
    flex: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
  },
  disabled: {
    opacity: 0.45,
  },
  icon: {
    width: Layout.hitTarget + 4,
    height: Layout.hitTarget + 4,
    borderRadius: Radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
