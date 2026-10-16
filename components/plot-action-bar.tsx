import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useConnectRobot } from '@/components/robot/connect';
import { describeJob, jobFraction } from '@/components/robot/status';
import { Banner } from '@/components/ui/banner';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { Button, IconButton } from '@/components/ui/button';
import { Row, Section } from '@/components/ui/list';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useIsWide } from '@/components/ui/screen';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { Layout, Space } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePlotterSettings } from '@/lib/plotter-settings';
import { useRobot } from '@/lib/robot/robot-context';
import { shareTextFile } from '@/lib/share-file';
import {
  penUpLine,
  planPlot,
  sketchToGcode,
  sketchToSvg,
  type PlotterSettings,
  type Sketch,
} from '@/lib/sketch';

const OUTCOME_ICONS: Record<'success' | 'warning' | 'error', IconSymbolName> = {
  success: 'checkmark.circle.fill',
  warning: 'exclamationmark.triangle.fill',
  error: 'exclamationmark.octagon.fill',
};

type Props = {
  sketch: Sketch | null;
  /** True while the sketch is being (re)computed. */
  busy?: boolean;
  /** Shown instead of the summary when there's nothing to draw yet. */
  emptyHint: string;
  /** Prefix for exported file names, e.g. "robosketch-note". */
  fileName: string;
};

/**
 * The bottom action area of a creation screen: what will be drawn (strokes · size · time), the
 * one primary action (Connect robot → Send to robot → Stop), live progress, the outcome of the
 * last job, and export in a sheet.
 */
export function PlotActionBar({ sketch, busy, emptyHint, fileName }: Props) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useIsWide();
  const { settings } = usePlotterSettings();
  const robot = useRobot();
  const { connect, sheet: connectSheet } = useConnectRobot();
  const [exportOpen, setExportOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const drawable = sketch && sketch.strokes.length > 0 && !busy ? sketch : null;
  const summary = useMemo(
    () => (drawable ? summarize(drawable, settings) : null),
    [drawable, settings]
  );
  const connected = robot.status === 'connected' && !!robot.robot;
  const job = robot.job;
  const sending = job?.state === 'sending';
  const outcome = job ? describeJob(job) : null;

  async function exportFile(kind: 'gcode' | 'svg') {
    if (!drawable) return;
    const name = `${fileName}-${Date.now()}`;
    setExportError(null);
    try {
      if (kind === 'gcode') {
        await shareTextFile(`${name}.gcode`, sketchToGcode(drawable, settings), 'text/plain');
      } else {
        await shareTextFile(`${name}.svg`, sketchToSvg(drawable), 'image/svg+xml');
      }
      setExportOpen(false);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <View
      style={[
        styles.bar,
        { borderTopColor: colors.border, backgroundColor: colors.surface },
        !wide && { paddingBottom: Space.md },
      ]}>
      <View
        style={[
          styles.inner,
          !wide && styles.readable,
          wide && { paddingBottom: Space.lg + insets.bottom },
        ]}>
        {outcome && job && !sending && (
          <View style={styles.outcome} role={outcome.tone === 'success' ? 'status' : 'alert'}>
            <IconSymbol
              name={OUTCOME_ICONS[outcome.tone]}
              size={20}
              color={colors[outcome.tone === 'error' ? 'danger' : outcome.tone]}
            />
            <View style={styles.grow}>
              <Text variant="label">{outcome.title}</Text>
              {/* Success needs no explanation here; problems do. */}
              {outcome.tone !== 'success' && (
                <Text variant="caption" tone="secondary">
                  {outcome.message}
                </Text>
              )}
            </View>
            <Button title="Dismiss" variant="tertiary" size="sm" onPress={robot.dismissJob} />
          </View>
        )}
        {!connected && robot.error && !sending && (
          <Text variant="caption" tone="danger" role="alert">
            {robot.error}
          </Text>
        )}

        {sending && job ? (
          <View style={styles.status} aria-live="polite">
            <View style={styles.statusLine}>
              <Text variant="label">Sending to {robot.robot?.name ?? 'robot'}</Text>
              <Text variant="label" tone="secondary">
                {Math.round(jobFraction(job) * 100)}%
              </Text>
            </View>
            <ProgressBar value={jobFraction(job)} label="Sending progress" />
          </View>
        ) : (
          <Text variant="secondary" tone={summary ? 'default' : 'secondary'} numberOfLines={2}>
            {busy ? 'Preparing drawing…' : (summary ?? emptyHint)}
          </Text>
        )}

        <View style={styles.actions}>
          {sending ? (
            <Button
              title="Stop"
              icon="stop.fill"
              variant="destructive"
              grow
              onPress={robot.cancel}
            />
          ) : connected ? (
            <Button
              title="Send to robot"
              icon="paperplane.fill"
              grow
              disabled={!drawable}
              onPress={() =>
                drawable && robot.send(sketchToGcode(drawable, settings), penUpLine(settings))
              }
            />
          ) : (
            <Button
              title={robot.status === 'connecting' ? 'Connecting…' : 'Connect robot'}
              icon="antenna.radiowaves.left.and.right"
              grow
              loading={robot.status === 'connecting'}
              onPress={connect}
            />
          )}
          <IconButton
            icon="square.and.arrow.up"
            label="Export file"
            disabled={!drawable}
            onPress={() => {
              setExportError(null);
              setExportOpen(true);
            }}
          />
        </View>
      </View>

      {connectSheet}
      <Sheet
        visible={exportOpen}
        title="Export"
        description="Save the drawing to use without Bluetooth."
        onClose={() => setExportOpen(false)}>
        {exportError && <Banner tone="error" message={exportError} />}
        <Section inset>
          <Row
            icon="doc.text"
            title="G-code (.gcode)"
            description="The exact program the robot runs, for an SD card or another sender."
            onPress={() => exportFile('gcode')}
          />
          <Row
            icon="photo"
            title="SVG (.svg)"
            description="Vector lines for editing or other plotter software."
            onPress={() => exportFile('svg')}
          />
        </Section>
      </Sheet>
    </View>
  );
}

/** "214 strokes · 120 × 150 mm · ≈ 4 min" — exactly what the robot will do. */
function summarize(sketch: Sketch, settings: PlotterSettings) {
  const plan = planPlot(sketch, settings);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of plan.strokes) {
    for (const p of stroke) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const strokes = `${plan.strokeCount.toLocaleString()} stroke${plan.strokeCount === 1 ? '' : 's'}`;
  const size = `${Math.round(maxX - minX)} × ${Math.round(maxY - minY)} mm`;
  const time = plan.minutes < 1 ? 'under 1 min' : `≈ ${Math.round(plan.minutes)} min`;
  return `${strokes} · ${size} · ${time}`;
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inner: {
    gap: Space.md,
    paddingHorizontal: Layout.gutter,
    paddingTop: Space.md,
  },
  readable: {
    width: '100%',
    maxWidth: Layout.maxContent,
    alignSelf: 'center',
  },
  outcome: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  grow: {
    flex: 1,
  },
  status: {
    gap: Space.sm,
  },
  statusLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actions: {
    flexDirection: 'row',
    gap: Space.sm,
  },
});
