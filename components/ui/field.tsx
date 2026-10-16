import { useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { Fonts, Layout, Radius, Space, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Text } from './text';

/** Lays out fields side by side, wrapping on narrow screens. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <View style={styles.fieldRow}>{children}</View>;
}

const formatNumber = (n: number) => (Number.isInteger(n) ? String(n) : String(+n.toFixed(2)));

export function NumberField({
  label,
  unit,
  value,
  min,
  max = Infinity,
  helper,
  onCommit,
}: {
  label: string;
  unit?: string;
  value: number;
  min: number;
  max?: number;
  helper?: string;
  onCommit: (value: number) => void;
}) {
  const range =
    max === Infinity ? `${formatNumber(min)} or more` : `${formatNumber(min)}–${formatNumber(max)}`;
  return (
    <Field
      // Remount when the stored value changes elsewhere (presets, reset) to refresh the text.
      key={value}
      label={label}
      unit={unit}
      helper={helper}
      initialText={formatNumber(value)}
      keyboardType="decimal-pad"
      validate={(text) => {
        const parsed = Number(text.replace(',', '.'));
        if (!text.trim() || !Number.isFinite(parsed)) return 'Enter a number.';
        if (parsed < min || parsed > max)
          return `Enter a value from ${range}${unit ? ` ${unit}` : ''}.`;
        onCommit(parsed);
        return null;
      }}
    />
  );
}

export function TextField({
  label,
  value,
  helper,
  mono,
  autoCapitalize = 'none',
  onCommit,
}: {
  label: string;
  value: string;
  helper?: string;
  mono?: boolean;
  autoCapitalize?: 'none' | 'characters';
  onCommit: (value: string) => void;
}) {
  return (
    <Field
      key={value}
      label={label}
      helper={helper}
      mono={mono}
      initialText={value}
      autoCapitalize={autoCapitalize}
      validate={(text) => {
        if (!text.trim()) return 'This can’t be empty.';
        onCommit(text.trim());
        return null;
      }}
    />
  );
}

/**
 * Labelled input that commits on blur / submit. `validate` returns an error message (the
 * value is kept for correcting, and the stored setting is unchanged) or null once committed.
 */
function Field({
  label,
  unit,
  helper,
  mono,
  initialText,
  keyboardType,
  autoCapitalize,
  validate,
}: {
  label: string;
  unit?: string;
  helper?: string;
  mono?: boolean;
  initialText: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'characters';
  validate: (text: string) => string | null;
}) {
  const colors = useTheme();
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const commit = () => {
    setFocused(false);
    if (text === initialText) return setError(null);
    setError(validate(text));
  };

  return (
    <View style={styles.field}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <View
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : focused ? colors.accent : colors.borderStrong,
          },
          focused && styles.inputFocused,
        ]}>
        <TextInput
          accessibilityLabel={unit ? `${label} in ${unit}` : label}
          aria-invalid={!!error}
          value={text}
          onChangeText={setText}
          onFocus={() => setFocused(true)}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize ?? 'none'}
          autoCorrect={false}
          returnKeyType="done"
          style={[
            styles.textInput,
            { color: colors.text },
            mono && { fontFamily: Fonts?.mono, fontSize: 14 },
          ]}
        />
        {unit && (
          <Text variant="secondary" tone="tertiary">
            {unit}
          </Text>
        )}
      </View>
      {error ? (
        <Text variant="caption" tone="danger" role="alert">
          {error}
        </Text>
      ) : helper ? (
        <Text variant="caption" tone="secondary">
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.md,
  },
  field: {
    flexGrow: 1,
    flexBasis: 140,
    gap: Space.xs + 2,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: Layout.hitTarget,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Space.md,
  },
  inputFocused: {
    borderWidth: 2,
    paddingHorizontal: Space.md - 1,
  },
  textInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: Space.sm,
    ...Type.body,
    // Web draws its own focus outline; the border shows focus instead.
    outlineStyle: 'none',
  } as object,
});
