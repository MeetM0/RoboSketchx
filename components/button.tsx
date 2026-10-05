import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  title: string;
  icon?: IconSymbolName;
  variant?: 'primary' | 'secondary';
};

export function Button({ title, icon, variant = 'primary', disabled, ...rest }: Props) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const primary = variant === 'primary';
  const foreground = primary ? colors.onTint : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: colors.tint }
          : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
        (pressed || disabled) && { opacity: disabled ? 0.4 : 0.75 },
      ]}
      {...rest}>
      {icon && <IconSymbol name={icon} size={20} color={foreground} />}
      <ThemedText type="defaultSemiBold" style={{ color: foreground }}>
        {title}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
});
