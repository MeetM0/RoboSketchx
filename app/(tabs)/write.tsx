import { useMemo, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { FontPicker } from '@/components/font-picker';
import { PlotActionBar } from '@/components/plot-action-bar';
import { StatusPill } from '@/components/robot/status-pill';
import { SketchPreview } from '@/components/sketch-preview';
import { Banner } from '@/components/ui/banner';
import { FieldRow, NumberField } from '@/components/ui/field';
import { Section } from '@/components/ui/list';
import { Workspace } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { Radius, Space, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePlotterSettings } from '@/lib/plotter-settings';
import {
  layoutText,
  MAX_FIT_LETTER_HEIGHT_MM,
  type FontId,
  type TextLayoutOptions,
} from '@/lib/text/layout';

const SIZE_OPTIONS = [
  { value: 'fit', label: 'Fit' },
  { value: '6', label: 'S' },
  { value: '10', label: 'M' },
  { value: '16', label: 'L' },
  { value: 'custom', label: 'Custom' },
] as const;

type SizeChoice = (typeof SIZE_OPTIONS)[number]['value'];

const ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
] as const;

const STYLE_OPTIONS = [
  { value: 'natural', label: 'Natural' },
  { value: 'neat', label: 'Neat' },
] as const;

export default function WriteScreen() {
  const colors = useTheme();
  const { settings } = usePlotterSettings();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [font, setFont] = useState<FontId>('handwriting');
  const [size, setSize] = useState<SizeChoice>('fit');
  const [customSizeMm, setCustomSizeMm] = useState(20);
  const [align, setAlign] = useState<TextLayoutOptions['align']>('left');
  const [style, setStyle] = useState<'natural' | 'neat'>('natural');

  const layout = useMemo(
    () =>
      layoutText(
        text,
        {
          widthMm: settings.paperWidthMm - 2 * settings.marginMm,
          heightMm: settings.paperHeightMm - 2 * settings.marginMm,
        },
        {
          font,
          letterHeightMm: size === 'fit' ? 'fit' : size === 'custom' ? customSizeMm : Number(size),
          lineSpacing: 1.15,
          align,
          natural: style === 'natural',
        }
      ),
    [text, font, size, customSizeMm, align, style, settings]
  );
  const hasText = text.trim().length > 0;

  return (
    <Workspace
      title="Write"
      headerRight={<StatusPill />}
      stage={
        <SketchPreview
          sketch={hasText ? layout.sketch : null}
          settings={settings}
          label={hasText ? `"${text}" written on the paper` : 'Empty paper'}
          overlay={
            hasText ? null : (
              <Text variant="secondary" tone="tertiary">
                Your text appears here
              </Text>
            )
          }
        />
      }
      footer={
        <PlotActionBar
          sketch={hasText ? layout.sketch : null}
          emptyHint="Type a message to write."
          fileName="robosketch-text"
        />
      }>
      <Section title="Message">
        <TextInput
          accessibilityLabel="Message"
          value={text}
          onChangeText={setText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Type what the robot should write"
          placeholderTextColor={colors.textTertiary}
          multiline
          textAlignVertical="top"
          style={[
            styles.message,
            {
              color: colors.text,
              backgroundColor: colors.surface,
              borderColor: focused ? colors.accent : colors.borderStrong,
            },
            focused && styles.messageFocused,
          ]}
        />
        {layout.overflowLines > 0 && (
          <Banner
            tone="warning"
            message={`${layout.overflowLines} line${layout.overflowLines === 1 ? '' : 's'} won't fit on the paper. Choose a smaller size or larger paper.`}
          />
        )}
        {layout.missingChars.length > 0 && (
          <Banner
            tone="info"
            message={`This font can't write ${layout.missingChars.join(' ')}, so ${layout.missingChars.length === 1 ? 'it is' : 'they are'} skipped.`}
          />
        )}
      </Section>

      <Section title="Font">
        <FontPicker value={font} onChange={setFont} />
        <Segmented label="Letter style" options={STYLE_OPTIONS} value={style} onChange={setStyle} />
        <Text variant="caption" tone="secondary">
          {style === 'natural'
            ? 'Natural varies each letter slightly, like real handwriting.'
            : 'Neat draws every letter identically.'}
        </Text>
      </Section>

      <Section title="Size">
        <Segmented label="Letter size" options={SIZE_OPTIONS} value={size} onChange={setSize} />
        {size === 'custom' && (
          <FieldRow>
            <NumberField
              label="Capital height"
              unit="mm"
              value={customSizeMm}
              min={1}
              max={200}
              onCommit={setCustomSizeMm}
            />
          </FieldRow>
        )}
        <Text variant="caption" tone="secondary">
          {size === 'fit'
            ? `Longest line fills the width, up to ${MAX_FIT_LETTER_HEIGHT_MM} mm capitals. `
            : ''}
          Capitals {layout.letterHeightMm.toFixed(1)} mm · lowercase {layout.xHeightMm.toFixed(1)}{' '}
          mm
        </Text>
      </Section>

      <Section title="Alignment">
        <Segmented label="Alignment" options={ALIGN_OPTIONS} value={align} onChange={setAlign} />
      </Section>
    </Workspace>
  );
}

const styles = StyleSheet.create({
  message: {
    minHeight: 112,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    ...Type.body,
    outlineStyle: 'none',
  } as object,
  messageFocused: {
    borderWidth: 2,
    paddingHorizontal: Space.md - 1,
    paddingVertical: Space.sm + 1,
  },
});
