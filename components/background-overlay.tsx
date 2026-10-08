import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import { backgroundPathData, type CropRect } from '@/lib/sketch';

type Props = {
  /** Size of the photo the overlay sits on (the decoded working image). */
  frameWidth: number;
  frameHeight: number;
  /** The part of the photo that was traced, in frame pixels. */
  crop: CropRect;
  /** Background mask of the traced crop (maskWidth × maskHeight), or null. */
  mask: Uint8Array | null;
  maskWidth: number;
  maskHeight: number;
};

/**
 * Fades out what won't be drawn: everything outside the traced crop, and the removed
 * background inside it.
 */
export function BackgroundOverlay({
  frameWidth,
  frameHeight,
  crop,
  mask,
  maskWidth,
  maskHeight,
}: Props) {
  const colors = useTheme();
  const maskPath = useMemo(
    () => (mask ? backgroundPathData(mask, maskWidth, maskHeight) : ''),
    [mask, maskWidth, maskHeight]
  );
  const outside =
    `M0 0H${frameWidth}V${frameHeight}H0Z` +
    `M${crop.x} ${crop.y}V${crop.y + crop.height}H${crop.x + crop.width}V${crop.y}Z`;

  return (
    <Svg
      style={StyleSheet.absoluteFill}
      viewBox={`0 0 ${frameWidth} ${frameHeight}`}
      preserveAspectRatio="none"
      pointerEvents="none">
      <Path d={outside} fill={colors.paper} fillOpacity={0.85} fillRule="evenodd" />
      {maskPath ? (
        <G
          transform={`translate(${crop.x} ${crop.y}) scale(${crop.width / maskWidth} ${crop.height / maskHeight})`}>
          <Path d={maskPath} fill={colors.paper} fillOpacity={0.85} />
        </G>
      ) : null}
    </Svg>
  );
}
