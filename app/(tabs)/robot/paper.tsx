import { StyleSheet, View } from 'react-native';

import { paperName } from '@/components/robot/status';
import { useBackToRobot } from '@/components/robot/use-back';
import { SketchPreview } from '@/components/sketch-preview';
import { ChipGroup } from '@/components/ui/chip';
import { FieldRow, NumberField } from '@/components/ui/field';
import { Section } from '@/components/ui/list';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePlotterSettings } from '@/lib/plotter-settings';

const PRESETS = [
  { value: 'A4', label: 'A4', short: 210, long: 297 },
  { value: 'A5', label: 'A5', short: 148, long: 210 },
  { value: 'A3', label: 'A3', short: 297, long: 420 },
  { value: 'Letter', label: 'Letter', short: 216, long: 279 },
  { value: 'custom', label: 'Custom', short: 0, long: 0 },
] as const;

const ORIENTATION_OPTIONS = [
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
] as const;

export default function PaperScreen() {
  const colors = useTheme();
  const back = useBackToRobot();
  const { settings, updateSettings } = usePlotterSettings();
  const landscape = settings.paperWidthMm > settings.paperHeightMm;
  const name = paperName(settings);
  const preset = PRESETS.find((p) => p.value === name)?.value ?? 'custom';
  const maxMargin = Math.floor(Math.min(settings.paperWidthMm, settings.paperHeightMm) / 2 - 1);

  function choosePreset(value: (typeof PRESETS)[number]['value']) {
    const p = PRESETS.find((x) => x.value === value);
    if (!p || value === 'custom') return;
    updateSettings(
      landscape
        ? { paperWidthMm: p.long, paperHeightMm: p.short }
        : { paperWidthMm: p.short, paperHeightMm: p.long }
    );
  }

  return (
    <Screen title="Paper" onBack={back}>
      <View
        style={[
          styles.preview,
          { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
        ]}>
        <SketchPreview
          sketch={null}
          settings={settings}
          caption={`${settings.paperWidthMm} × ${settings.paperHeightMm} mm · drawing area inside the dashed line`}
        />
      </View>

      <Section title="Size">
        <ChipGroup label="Paper size" options={PRESETS} value={preset} onChange={choosePreset} />
        <Segmented
          label="Orientation"
          options={ORIENTATION_OPTIONS}
          value={landscape ? 'landscape' : 'portrait'}
          onChange={(o) => {
            if ((o === 'landscape') !== landscape) {
              updateSettings({
                paperWidthMm: settings.paperHeightMm,
                paperHeightMm: settings.paperWidthMm,
              });
            }
          }}
        />
        {preset === 'custom' && (
          <FieldRow>
            <NumberField
              label="Width"
              unit="mm"
              value={settings.paperWidthMm}
              min={10}
              max={2000}
              onCommit={(paperWidthMm) => updateSettings({ paperWidthMm })}
            />
            <NumberField
              label="Height"
              unit="mm"
              value={settings.paperHeightMm}
              min={10}
              max={2000}
              onCommit={(paperHeightMm) => updateSettings({ paperHeightMm })}
            />
          </FieldRow>
        )}
      </Section>

      <Section title="Margin" footer="Nothing is drawn closer to the edge than this.">
        <FieldRow>
          <NumberField
            label="Margin on every side"
            unit="mm"
            value={settings.marginMm}
            min={0}
            max={maxMargin}
            onCommit={(marginMm) => updateSettings({ marginMm })}
          />
        </FieldRow>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: {
    height: 260,
    borderWidth: 1,
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
});
