import { Children, Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Layout, Radius, Space } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { IconSymbol, type IconSymbolName } from './icon-symbol';
import { focusRing, type PressState } from './pressable-styles';
import { Text } from './text';

/**
 * A titled group. `inset` content (rows) sits in one bordered surface separated by hairlines;
 * otherwise children are laid out with standard spacing (fields, controls).
 */
export function Section({
  title,
  description,
  footer,
  action,
  inset,
  children,
}: {
  title?: string;
  description?: string;
  footer?: string;
  /** Right-aligned control in the title row (e.g. a tertiary button). */
  action?: ReactNode;
  inset?: boolean;
  children: ReactNode;
}) {
  const colors = useTheme();
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.section}>
      {(title || action) && (
        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            {title && (
              <Text variant="section" role="heading">
                {title}
              </Text>
            )}
            {description && (
              <Text variant="caption" tone="secondary">
                {description}
              </Text>
            )}
          </View>
          {action}
        </View>
      )}
      {inset ? (
        <View
          style={[styles.inset, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {items.map((child, i) => (
            <Fragment key={i}>
              {i > 0 && <View style={[styles.separator, { backgroundColor: colors.border }]} />}
              {child}
            </Fragment>
          ))}
        </View>
      ) : (
        <View style={styles.stack}>{items}</View>
      )}
      {footer && (
        <Text variant="caption" tone="secondary">
          {footer}
        </Text>
      )}
    </View>
  );
}

/** A row in an inset section: label, optional description and value, and a chevron if it navigates. */
export function Row({
  title,
  description,
  value,
  icon,
  onPress,
  accessibilityLabel,
}: {
  title: string;
  description?: string;
  value?: string;
  icon?: IconSymbolName;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const colors = useTheme();
  const content = (
    <>
      {icon && <IconSymbol name={icon} size={20} color={colors.textSecondary} />}
      <View style={styles.rowText}>
        <Text variant="body">{title}</Text>
        {description && (
          <Text variant="caption" tone="secondary">
            {description}
          </Text>
        )}
      </View>
      {value !== undefined && (
        <Text variant="secondary" tone="secondary" style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      )}
      {onPress && <IconSymbol name="chevron.right" size={20} color={colors.textTertiary} />}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (value ? `${title}, ${value}` : title)}
      onPress={onPress}
      style={(state: PressState) => [
        styles.row,
        (state.pressed || state.hovered) && {
          backgroundColor: colors.surfaceMuted,
        },
        focusRing(state, colors),
      ]}>
      {content}
    </Pressable>
  );
}

/** Single choice where each option needs a sentence of explanation. */
export function OptionList<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; title: string; description?: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const colors = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.inset, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {options.map((option, i) => {
        const selected = option.value === value;
        return (
          <Fragment key={option.value}>
            {i > 0 && <View style={[styles.separator, { backgroundColor: colors.border }]} />}
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(option.value)}
              style={(state: PressState) => [
                styles.row,
                (state.pressed || state.hovered) && {
                  backgroundColor: colors.surfaceMuted,
                },
                focusRing(state, colors),
              ]}>
              <View
                style={[
                  styles.radio,
                  {
                    borderColor: selected ? colors.accent : colors.borderStrong,
                  },
                ]}>
                {selected && <View style={[styles.radioDot, { backgroundColor: colors.accent }]} />}
              </View>
              <View style={styles.rowText}>
                <Text variant={selected ? 'bodyStrong' : 'body'}>{option.title}</Text>
                {option.description && (
                  <Text variant="caption" tone="secondary">
                    {option.description}
                  </Text>
                )}
              </View>
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Space.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    minHeight: 28,
  },
  titleText: {
    flex: 1,
    gap: 2,
  },
  stack: {
    gap: Space.md,
  },
  inset: {
    borderWidth: 1,
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Space.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    minHeight: Layout.hitTarget + 8,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.lg,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  value: {
    flexShrink: 1,
    maxWidth: '55%',
    textAlign: 'right',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
