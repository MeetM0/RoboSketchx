import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import { Space } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  pixelToPaperTransform,
  sketchToSvgPathData,
  type PlotterSettings,
  type Sketch,
} from '@/lib/sketch';

/** Pen tip width used for the on-screen preview, in millimetres. */
const PEN_WIDTH_MM = 0.5;
/** Room kept under the paper for the caption. */
const CAPTION_SPACE = 20;

type Props = {
  /** Null shows the empty sheet. */
  sketch: Sketch | null;
  settings: PlotterSettings;
  /** Shown centred on the sheet (e.g. an empty-state hint). */
  overlay?: ReactNode;
  /** Accessible description of what is drawn. */
  label?: string;
  /** Short note in the stage's corner, e.g. the picture's name. */
  caption?: string;
};

/**
 * The configured sheet of paper, scaled to fit its container, with the sketch exactly where
 * the plotter will draw it. The dashed line is the margin.
 */
export function SketchPreview({ sketch, settings, overlay, label, caption }: Props) {
  const { paperWidthMm: w, paperHeightMm: h } = settings;
  return (
    <Stage aspect={w / h} caption={caption} label={label ?? `Preview on ${w} × ${h} mm paper`}>
      <Paper sketch={sketch} settings={settings} />
      {overlay && <View style={styles.overlay}>{overlay}</View>}
    </Stage>
  );
}

/** Centres its content at the largest size with the given aspect ratio that fits. */
export function Stage({
  aspect,
  caption,
  label,
  children,
}: {
  aspect: number;
  caption?: string;
  label?: string;
  children: ReactNode;
}) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  let size = null;
  if (box) {
    const width = Math.floor(Math.min(box.width, box.height * aspect));
    size = { width, height: Math.floor(width / aspect) };
  }

  return (
    <View
      style={[styles.stage, caption ? { paddingBottom: CAPTION_SPACE } : null]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setBox({
          width: width - 2 * Space.lg,
          height: height - 2 * Space.lg - (caption ? CAPTION_SPACE : 0),
        });
      }}
      role="img"
      aria-label={label}>
      {size && size.width > 0 && size.height > 0 && <View style={size}>{children}</View>}
      {caption && (
        <Text variant="caption" tone="secondary" style={styles.caption} numberOfLines={1}>
          {caption}
        </Text>
      )}
    </View>
  );
}

function Paper({ sketch, settings }: { sketch: Sketch | null; settings: PlotterSettings }) {
  const colors = useTheme();
  const pathData = useMemo(() => (sketch ? sketchToSvgPathData(sketch) : ''), [sketch]);
  const { paperWidthMm: w, paperHeightMm: h, marginMm: m } = settings;
  const transform = sketch ? pixelToPaperTransform(sketch, settings) : null;

  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`}>
      <Rect
        x={0}
        y={0}
        width={w}
        height={h}
        fill={colors.paper}
        stroke={colors.borderStrong}
        strokeWidth={0.6}
      />
      {m > 0 && (
        <Rect
          x={m}
          y={m}
          width={w - 2 * m}
          height={h - 2 * m}
          fill="none"
          stroke={colors.margin}
          strokeWidth={0.4}
          strokeDasharray="2 2"
        />
      )}
      {transform && pathData ? (
        <G
          transform={`translate(${transform.previewOffsetX} ${transform.previewOffsetY}) scale(${transform.scale})`}>
          <Path
            d={pathData}
            fill="none"
            stroke={colors.ink}
            strokeWidth={PEN_WIDTH_MM / transform.scale}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
      ) : null}
    </Svg>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    position: 'absolute',
    left: Space.md,
    bottom: Space.sm,
    right: Space.md,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.xl,
  },
});
