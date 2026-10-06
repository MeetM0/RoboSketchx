import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  pixelToPaperTransform,
  sketchToSvgPathData,
  type PlotterSettings,
  type Sketch,
} from '@/lib/sketch';

/** Pen tip width used for the on-screen preview, in millimetres. */
const PEN_WIDTH_MM = 0.5;

type Props = {
  sketch: Sketch;
  settings: PlotterSettings;
};

/** Shows the sketch on the configured sheet of paper, exactly where the plotter will draw it. */
export function SketchPreview({ sketch, settings }: Props) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const pathData = useMemo(() => sketchToSvgPathData(sketch), [sketch]);
  const { scale, previewOffsetX, previewOffsetY } = pixelToPaperTransform(sketch, settings);
  const { paperWidthMm: w, paperHeightMm: h, marginMm: m } = settings;

  return (
    <View style={[styles.frame, { aspectRatio: w / h, borderColor: colors.border }]}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`}>
        <Rect x={0} y={0} width={w} height={h} fill={colors.paper} />
        <Rect
          x={m}
          y={m}
          width={w - 2 * m}
          height={h - 2 * m}
          fill="none"
          stroke={colors.border}
          strokeWidth={0.4}
          strokeDasharray="2 2"
        />
        <G transform={`translate(${previewOffsetX} ${previewOffsetY}) scale(${scale})`}>
          <Path
            d={pathData}
            fill="none"
            stroke={colors.ink}
            strokeWidth={PEN_WIDTH_MM / scale}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
});
