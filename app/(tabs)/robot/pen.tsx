import { useBackToRobot } from '@/components/robot/use-back';
import { FieldRow, NumberField, TextField } from '@/components/ui/field';
import { OptionList, Section } from '@/components/ui/list';
import { Screen } from '@/components/ui/screen';
import { usePlotterSettings } from '@/lib/plotter-settings';

const PEN_MODES = [
  {
    value: 'z',
    title: 'Z axis',
    description: 'The pen is on a Z axis: lifted with G0 Z… and lowered with G1 Z….',
  },
  {
    value: 'custom',
    title: 'Custom commands',
    description: 'Your firmware moves the pen with its own commands, e.g. a servo’s M3 S… / M5.',
  },
] as const;

export default function PenScreen() {
  const back = useBackToRobot();
  const { settings, updateSettings } = usePlotterSettings();

  return (
    <Screen title="Pen" onBack={back}>
      <Section title="How the pen lifts">
        <OptionList
          label="How the pen lifts"
          options={PEN_MODES}
          value={settings.penMode}
          onChange={(penMode) => updateSettings({ penMode })}
        />
      </Section>

      {settings.penMode === 'z' ? (
        <Section
          title="Pen height"
          footer="Up must clear the paper; down is where the tip touches it.">
          <FieldRow>
            <NumberField
              label="Up"
              unit="mm"
              value={settings.penUpZ}
              min={-100}
              max={100}
              onCommit={(penUpZ) => updateSettings({ penUpZ })}
            />
            <NumberField
              label="Down"
              unit="mm"
              value={settings.penDownZ}
              min={-100}
              max={100}
              onCommit={(penDownZ) => updateSettings({ penDownZ })}
            />
          </FieldRow>
          <FieldRow>
            <NumberField
              label="Lowering speed"
              unit="mm/min"
              value={settings.penFeedRate}
              min={1}
              max={20000}
              helper="Slower is gentler on the pen tip."
              onCommit={(penFeedRate) => updateSettings({ penFeedRate })}
            />
          </FieldRow>
        </Section>
      ) : (
        <Section title="Commands" footer="Sent exactly as written.">
          <TextField
            label="Pen up"
            mono
            autoCapitalize="characters"
            value={settings.penUpCommand}
            onCommit={(penUpCommand) => updateSettings({ penUpCommand })}
          />
          <TextField
            label="Pen down"
            mono
            autoCapitalize="characters"
            value={settings.penDownCommand}
            onCommit={(penDownCommand) => updateSettings({ penDownCommand })}
          />
        </Section>
      )}
    </Screen>
  );
}
