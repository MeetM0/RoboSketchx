import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { backgroundPathData } from '@/lib/sketch';

type Props = {
  mask: Uint8Array;
  width: number;
  height: number;
};

/** Fades out the removed background on top of the photo it was computed from. */
export function BackgroundOverlay({ mask, width, height }: Props) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const pathData = useMemo(() => backgroundPathData(mask, width, height), [mask, width, height]);

  return (
    <Svg
      style={StyleSheet.absoluteFill}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      pointerEvents="none">
      <Path d={pathData} fill={colors.paper} fillOpacity={0.85} />
    </Svg>
  );
}
