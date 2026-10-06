import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { NumberField, Section, TextField } from '@/components/form-fields';
import { RobotPanel } from '@/components/robot-panel';
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
              Connect your robot and match these settings so drawings come out the right size and
              speed.
            </ThemedText>
          </View>

          <RobotPanel />

          <Section title="Paper">
            <View style={styles.row}>
              {PAPER_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  title={preset.label}
                  variant={
                    settings.paperWidthMm === preset.width &&
                    settings.paperHeightMm === preset.height
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
  row: {
    flexDirection: 'row',
    gap: 10,
  },
});
