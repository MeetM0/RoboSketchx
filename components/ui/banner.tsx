import { StyleSheet, View } from 'react-native';

import { Radius, Space, type Palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Button } from './button';
import { IconSymbol, type IconSymbolName } from './icon-symbol';
import { Text } from './text';

export type BannerTone = 'info' | 'success' | 'warning' | 'error';

const TONES: Record<
  BannerTone,
  {
    icon: IconSymbolName;
    fg: keyof Palette;
    bg: keyof Palette;
    text: 'accent' | 'success' | 'warning' | 'danger';
  }
> = {
  info: {
    icon: 'info.circle',
    fg: 'accent',
    bg: 'accentSubtle',
    text: 'accent',
  },
  success: {
    icon: 'checkmark.circle.fill',
    fg: 'success',
    bg: 'successSubtle',
    text: 'success',
  },
  warning: {
    icon: 'exclamationmark.triangle.fill',
    fg: 'warning',
    bg: 'warningSubtle',
    text: 'warning',
  },
  error: {
    icon: 'exclamationmark.octagon.fill',
    fg: 'danger',
    bg: 'dangerSubtle',
    text: 'danger',
  },
};

/** Inline message: what happened and, when there is one, what to do about it. */
export function Banner({
  tone,
  title,
  message,
  actionLabel,
  onAction,
}: {
  tone: BannerTone;
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const colors = useTheme();
  const t = TONES[tone];
  return (
    <View
      role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}
      style={[styles.banner, { backgroundColor: colors[t.bg], borderColor: colors[t.fg] }]}>
      <IconSymbol name={t.icon} size={20} color={colors[t.fg]} />
      <View style={styles.body}>
        {title && <Text variant="bodyStrong">{title}</Text>}
        <Text variant="secondary">{message}</Text>
        {actionLabel && onAction && (
          <View style={styles.action}>
            <Button title={actionLabel} variant="secondary" size="sm" onPress={onAction} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    gap: Space.md,
    padding: Space.md,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderLeftWidth: 3,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  action: {
    flexDirection: 'row',
    marginTop: Space.sm,
  },
});
