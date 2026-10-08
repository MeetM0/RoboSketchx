import type { ViewStyle } from 'react-native';

import type { Palette } from '@/constants/theme';

/** Pressable state; `focused` / `hovered` are reported by react-native-web. */
export type PressState = { pressed: boolean; focused?: boolean; hovered?: boolean };

// Like CSS :focus-visible: show the ring only when the keyboard moved focus, not after a click.
let keyboardModality = false;
if (process.env.EXPO_OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener('keydown', () => (keyboardModality = true), true);
  document.addEventListener('pointerdown', () => (keyboardModality = false), true);
}

/** Visible keyboard focus ring (web) that doesn't shift layout. */
export function focusRing(state: PressState, colors: Palette): ViewStyle | null {
  return state.focused && keyboardModality
    ? ({
        outlineColor: colors.focus,
        outlineStyle: 'solid',
        outlineWidth: 2,
        outlineOffset: 2,
      } as ViewStyle)
    : null;
}
