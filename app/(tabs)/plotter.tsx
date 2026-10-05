import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePlotterSettings } from '@/lib/plotter-settings';

const PAPER_PRESETS = [
  { label: 'A4', width: 210, height: 297 },
  { label: 'A5', width: 148, height: 210 },
  { label: 'Letter', width: 216, height: 279 },
] as const;

export default function PlotterScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const { settings, updateSettings, resetSettings } = usePlotterSettings();
  const maxMargin = Math.min(settings.paperWidthMm, settings.paperHeightMm) / 2 - 1;

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <ThemedText type="title">Plotter</ThemedText>
            <ThemedText style={{ color: colors.icon }}>
              Match these to your robot so the G-code draws at the right size and speed.
            </ThemedText>
          </View>

          <Section title="Paper">
            <View style={styles.row}>
              {PAPER_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  title={preset.label}
                  variant={
                    settings.paperWidthMm === preset.width && settings.paperHeightMm === preset.height
                      ? 'primary'
                      : 'secondary'
                  }
                  onPress={() =>
                    updateSettings({ paperWidthMm: preset.width, paperHeightMm: preset.height })
                  }
                />
              ))}
              <Button
                title="Rotate"
                variant="secondary"
                onPress={() =>
                  updateSettings({
                    paperWidthMm: settings.paperHeightMm,
                    paperHeightMm: settings.paperWidthMm,
                  })
                }
              />
            </View>
            <View style={styles.row}>
              <NumberField
                label="Width"
                unit="mm"
                value={settings.paperWidthMm}
                min={10}
                onCommit={(paperWidthMm) => updateSettings({ paperWidthMm })}
              />
              <NumberField
                label="Height"
                unit="mm"
                value={settings.paperHeightMm}
                min={10}
                onCommit={(paperHeightMm) => updateSettings({ paperHeightMm })}
              />
              <NumberField
                label="Margin"
                unit="mm"
                value={settings.marginMm}
                min={0}
                max={maxMargin}
                onCommit={(marginMm) => updateSettings({ marginMm })}
              />
            </View>
          </Section>

          <Section title="Speed">
            <View style={styles.row}>
              <NumberField
                label="Drawing"
                unit="mm/min"
                value={settings.drawFeedRate}
                min={1}
                onCommit={(drawFeedRate) => updateSettings({ drawFeedRate })}
              />
              <NumberField
                label="Travel"
                unit="mm/min"
                value={settings.travelFeedRate}
                min={1}
                onCommit={(travelFeedRate) => updateSettings({ travelFeedRate })}
              />
            </View>
          </Section>

          <Section
            title="Pen commands"
            hint="G-code sent to lift and lower the pen. Z-axis machines often use G0 Z5 / G1 Z0; servo pen plotters often use M3 S… / M5.">
            <TextField
              label="Pen up"
              value={settings.penUpCommand}
              onCommit={(penUpCommand) => updateSettings({ penUpCommand })}
            />
            <TextField
              label="Pen down"
              value={settings.penDownCommand}
              onCommit={(penDownCommand) => updateSettings({ penDownCommand })}
            />
          </Section>

          <View style={styles.row}>
            <Button
              title="Reset to defaults"
              icon="arrow.counterclockwise"
              variant="secondary"
              onPress={resetSettings}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const colors = Colors[useColorScheme() ?? 'light'];
  return (
    <View style={styles.section}>
      <ThemedText type="subtitle">{title}</ThemedText>
      {hint && <ThemedText style={[styles.hint, { color: colors.icon }]}>{hint}</ThemedText>}
      {children}
    </View>
  );
}

function NumberField({
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

function TextField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  return (
    <Field
      key={value}
      label={label}
      initialText={value}
      autoCapitalize="characters"
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
  screen: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 24,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  header: {
    gap: 4,
  },
  section: {
    gap: 10,
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
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
