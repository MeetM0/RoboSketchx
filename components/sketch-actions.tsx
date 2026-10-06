import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePlotterSettings } from '@/lib/plotter-settings';
import { shareTextFile } from '@/lib/share-file';
import {
  computeStats,
  pixelToPaperTransform,
  sketchToGcode,
  sketchToSvg,
  type Sketch,
} from '@/lib/sketch';

type Props = {
  sketch: Sketch | null;
  disabled?: boolean;
  /** Prefix for exported file names, e.g. "robosketch-note". */
  fileName: string;
  onError: (message: string) => void;
};

/** Stroke count, drawn size and estimated time, plus G-code / SVG export buttons. */
export function SketchActions({ sketch, disabled, fileName, onError }: Props) {
  const { settings } = usePlotterSettings();

  async function exportFile(kind: 'gcode' | 'svg') {
    if (!sketch) return;
    const name = `${fileName}-${Date.now()}`;
    try {
      if (kind === 'gcode') {
        await shareTextFile(`${name}.gcode`, sketchToGcode(sketch, settings), 'text/plain');
      } else {
        await shareTextFile(`${name}.svg`, sketchToSvg(sketch), 'image/svg+xml');
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      {sketch && <SketchSummary sketch={sketch} />}
      <View style={styles.row}>
        <Button
          title="Export G-code"
          icon="square.and.arrow.up"
          disabled={!sketch || !sketch.strokes.length || disabled}
          onPress={() => exportFile('gcode')}
        />
        <Button
          title="Export SVG"
          variant="secondary"
          disabled={!sketch || !sketch.strokes.length || disabled}
          onPress={() => exportFile('svg')}
        />
      </View>
    </>
  );
}

function SketchSummary({ sketch }: { sketch: Sketch }) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const { settings } = usePlotterSettings();
  const stats = computeStats(sketch.strokes);
  const { scale } = pixelToPaperTransform(sketch, settings);
  const minutes =
    (stats.drawLength * scale) / settings.drawFeedRate +
    (stats.travelLength * scale) / settings.travelFeedRate;

  // Size of what actually gets drawn (the sketch canvas can be larger, e.g. a whole page).
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of sketch.strokes) {
    for (const p of stroke) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const size = stats.strokeCount
    ? `${Math.round((maxX - minX) * scale)}×${Math.round((maxY - minY) * scale)} mm`
    : '—';

  const items = [
    { label: 'Strokes', value: stats.strokeCount.toLocaleString() },
    { label: 'Drawing size', value: size },
    { label: 'Est. time', value: minutes < 1 ? '< 1 min' : `≈ ${Math.round(minutes)} min` },
  ];

  return (
    <View style={[styles.summary, { backgroundColor: colors.card }]}>
      {items.map((item) => (
        <View key={item.label} style={styles.summaryItem}>
          <ThemedText style={[styles.summaryLabel, { color: colors.icon }]}>{item.label}</ThemedText>
          <ThemedText type="defaultSemiBold">{item.value}</ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  summary: {
    flexDirection: 'row',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
});
