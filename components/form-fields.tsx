import { useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];
  return (
    <View style={styles.section}>
      <ThemedText type="subtitle">{title}</ThemedText>
      {hint && <ThemedText style={[styles.hint, { color: colors.icon }]}>{hint}</ThemedText>}
      {children}
    </View>
  );
}

export function NumberField({
  label,
  unit,
  value,
  min,
  max = Infinity,
  onCommit,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max?: number;
  onCommit: (value: number) => void;
}) {
  return (
    <Field
      // Remount when the stored value changes elsewhere (presets, reset) to refresh the text.
      key={value}
      label={`${label} (${unit})`}
      initialText={String(value)}
      keyboardType="decimal-pad"
      onCommit={(text) => {
        const parsed = Number(text.replace(',', '.'));
        if (!Number.isFinite(parsed) || parsed < min || parsed > max) return false;
        onCommit(parsed);
        return true;
      }}
    />
  );
}

export function TextField({
  label,
  value,
  autoCapitalize = 'characters',
  onCommit,
}: {
  label: string;
  value: string;
  autoCapitalize?: 'none' | 'characters';
  onCommit: (value: string) => void;
}) {
  return (
    <Field
      key={value}
      label={label}
      initialText={value}
      autoCapitalize={autoCapitalize}
      onCommit={(text) => {
        if (!text.trim()) return false;
        onCommit(text.trim());
        return true;
      }}
    />
  );
}

/** Text input that commits on blur/submit and reverts if `onCommit` rejects the value. */
function Field({
  label,
  initialText,
  keyboardType,
  autoCapitalize,
  onCommit,
}: {
  label: string;
  initialText: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'characters';
  onCommit: (text: string) => boolean;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const [text, setText] = useState(initialText);
  const commit = () => {
    if (!onCommit(text)) setText(initialText);
  };

  return (
    <View style={styles.field}>
      <ThemedText style={[styles.fieldLabel, { color: colors.icon }]}>{label}</ThemedText>
      <TextInput
        value={text}
        onChangeText={setText}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? 'none'}
        autoCorrect={false}
        returnKeyType="done"
        style={[
          styles.input,
          { color: colors.text, backgroundColor: colors.card, borderColor: colors.border },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
  },
  field: {
    flex: 1,
    gap: 4,
  },
  fieldLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
  },
});
