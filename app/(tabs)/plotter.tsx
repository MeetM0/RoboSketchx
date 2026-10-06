import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { NumberField, Section, TextField } from '@/components/form-fields';
import { RobotPanel } from '@/components/robot-panel';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePlotterSettings } from '@/lib/plotter-settings';

const START_OPTIONS = [
  { value: 'g92', label: 'Here (G92)' },
  { value: 'g28', label: 'G28' },
  { value: 'home', label: 'Home ($H)' },
] as const;

const PEN_MODE_OPTIONS = [
  { value: 'z', label: 'Z axis' },
  { value: 'custom', label: 'Custom commands' },
] as const;

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
                label="Travel (estimate)"
                unit="mm/min"
                value={settings.travelFeedRate}
                min={1}
                onCommit={(travelFeedRate) => updateSettings({ travelFeedRate })}
              />
            </View>
          </Section>

          <Section
            title="Start position"
            hint="Here (G92): put the pen at the paper's bottom-left corner before sending; that spot becomes X0 Y0. G28 returns to the machine's reference position. Home ($H) runs GRBL's homing cycle (needs limit switches).">
            <SegmentedControl
              options={START_OPTIONS}
              value={settings.startMode}
              onChange={(startMode) => updateSettings({ startMode })}
            />
          </Section>

          <Section
            title="When finished"
            hint="After the last stroke the pen lifts, moves here and the program ends (M2). Machine coordinates: X0 Y0 is the paper's bottom-left corner.">
            <View style={styles.row}>
              <NumberField
                label="Park X"
                unit="mm"
                value={settings.parkXMm}
                min={0}
                max={settings.paperWidthMm}
                onCommit={(parkXMm) => updateSettings({ parkXMm })}
              />
              <NumberField
                label="Park Y"
                unit="mm"
                value={settings.parkYMm}
                min={0}
                max={settings.paperHeightMm}
                onCommit={(parkYMm) => updateSettings({ parkYMm })}
              />
            </View>
          </Section>

          <Section
            title="Pen"
            hint="Z axis: the pen is lifted with G0 Z<up> and lowered with G1 Z<down> at the pen feed. Custom: commands sent as-is (e.g. a servo's M3 S… / M5).">
            <SegmentedControl
              options={PEN_MODE_OPTIONS}
              value={settings.penMode}
              onChange={(penMode) => updateSettings({ penMode })}
            />
            {settings.penMode === 'z' ? (
              <View style={styles.row}>
                <NumberField
                  label="Up Z"
                  unit="mm"
                  value={settings.penUpZ}
                  min={-100}
                  max={100}
                  onCommit={(penUpZ) => updateSettings({ penUpZ })}
                />
                <NumberField
                  label="Down Z"
                  unit="mm"
                  value={settings.penDownZ}
                  min={-100}
                  max={100}
                  onCommit={(penDownZ) => updateSettings({ penDownZ })}
                />
                <NumberField
                  label="Pen feed"
                  unit="mm/min"
                  value={settings.penFeedRate}
                  min={1}
                  onCommit={(penFeedRate) => updateSettings({ penFeedRate })}
                />
              </View>
            ) : (
              <>
                <TextField
                  label="Pen up command"
                  value={settings.penUpCommand}
                  onCommit={(penUpCommand) => updateSettings({ penUpCommand })}
                />
                <TextField
                  label="Pen down command"
                  value={settings.penDownCommand}
                  onCommit={(penDownCommand) => updateSettings({ penDownCommand })}
                />
              </>
            )}
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
