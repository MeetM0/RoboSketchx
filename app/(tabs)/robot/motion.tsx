import { START_LABELS } from '@/components/robot/status';
import { useBackToRobot } from '@/components/robot/use-back';
import { FieldRow, NumberField } from '@/components/ui/field';
import { OptionList, Section } from '@/components/ui/list';
import { Screen } from '@/components/ui/screen';
import { usePlotterSettings } from '@/lib/plotter-settings';

const START_OPTIONS = [
  {
    value: 'g92',
    title: START_LABELS.g92,
    description: 'Put the pen over the paper’s bottom-left corner before sending (G92).',
  },
  {
    value: 'g28',
    title: START_LABELS.g28,
    description: 'The robot first moves to its stored reference position (G28).',
  },
  {
    value: 'home',
    title: START_LABELS.home,
    description: 'The robot finds its limit switches first ($H). Needs limit switches.',
  },
] as const;

export default function MotionScreen() {
  const back = useBackToRobot();
  const { settings, updateSettings } = usePlotterSettings();

  return (
    <Screen title="Motion" onBack={back}>
      <Section title="Speed">
        <FieldRow>
          <NumberField
            label="Drawing"
            unit="mm/min"
            value={settings.drawFeedRate}
            min={1}
            max={50000}
            helper="How fast the pen moves on paper."
            onCommit={(drawFeedRate) => updateSettings({ drawFeedRate })}
          />
          <NumberField
            label="Travel"
            unit="mm/min"
            value={settings.travelFeedRate}
            min={1}
            max={50000}
            helper="Your machine’s rapid speed; used for time estimates."
            onCommit={(travelFeedRate) => updateSettings({ travelFeedRate })}
          />
        </FieldRow>
      </Section>

      <Section
        title="Start position"
        description="Where the paper’s bottom-left corner (X0 Y0) is.">
        <OptionList
          label="Start position"
          options={START_OPTIONS}
          value={settings.startMode}
          onChange={(startMode) => updateSettings({ startMode })}
        />
      </Section>

      <Section
        title="When finished"
        footer="The pen lifts and moves here. Measured from the paper’s bottom-left corner.">
        <FieldRow>
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
        </FieldRow>
      </Section>
    </Screen>
  );
}
