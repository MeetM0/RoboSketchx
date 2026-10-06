import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontPicker } from '@/components/font-picker';
import { NumberField } from '@/components/form-fields';
import { SegmentedControl } from '@/components/segmented-control';
import { SketchActions } from '@/components/sketch-actions';
import { SketchPreview } from '@/components/sketch-preview';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePlotterSettings } from '@/lib/plotter-settings';
import {
  layoutText,
  MAX_FIT_LETTER_HEIGHT_MM,
  type FontId,
  type TextLayoutOptions,
} from '@/lib/text/layout';

const SIZE_OPTIONS = [
  { value: 'fit', label: 'Fit width' },
  { value: '6', label: 'Small' },
  { value: '10', label: 'Medium' },
  { value: '16', label: 'Large' },
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
  const colors = Colors[useColorScheme() ?? 'light'];
  const [error, setError] = useState<string | null>(null);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <ThemedText type="title">Write</ThemedText>
            <ThemedText style={{ color: colors.icon }}>
              Type a message and the robot writes it out by hand.
            </ThemedText>
          </View>
          <TypeMode onError={setError} />
          {error && <ThemedText style={styles.error}>{error}</ThemedText>}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function TypeMode({ onError }: { onError: (message: string) => void }) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const { settings } = usePlotterSettings();
  const [text, setText] = useState('');
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

  return (
    <>
      <SketchPreview sketch={layout.sketch} settings={settings} />
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Type what the robot should write…"
        placeholderTextColor={colors.icon}
        multiline
        textAlignVertical="top"
        style={[
          styles.textInput,
          { color: colors.text, backgroundColor: colors.card, borderColor: colors.border },
        ]}
      />
      {layout.overflowLines > 0 && (
        <ThemedText style={[styles.note, styles.warning]}>
          {layout.overflowLines} line{layout.overflowLines === 1 ? '' : 's'} won&apos;t fit on the
          page. Use a smaller size or a bigger sheet.
        </ThemedText>
      )}
      {layout.missingChars.length > 0 && (
        <ThemedText style={[styles.note, { color: colors.icon }]}>
          Skipped characters this font can&apos;t write: {layout.missingChars.join(' ')}
        </ThemedText>
      )}

      <View style={styles.section}>
        <ThemedText type="defaultSemiBold">Style</ThemedText>
        <FontPicker value={font} onChange={setFont} />
        <SegmentedControl options={STYLE_OPTIONS} value={style} onChange={setStyle} />
      </View>
      <View style={styles.section}>
        <ThemedText type="defaultSemiBold">Letter size</ThemedText>
        <SegmentedControl options={SIZE_OPTIONS} value={size} onChange={setSize} />
        {size === 'custom' && (
          <View style={styles.row}>
            <NumberField
              label="Capital letter height"
              unit="mm"
              value={customSizeMm}
              min={1}
              max={200}
              onCommit={setCustomSizeMm}
            />
          </View>
        )}
        <ThemedText style={[styles.note, { color: colors.icon }]}>
          Capitals {layout.letterHeightMm.toFixed(1)} mm · lowercase {layout.xHeightMm.toFixed(1)}{' '}
          mm
          {size === 'fit'
            ? ` · the longest line fills the page width (up to ${MAX_FIT_LETTER_HEIGHT_MM} mm capitals)`
            : ''}
        </ThemedText>
      </View>
      <View style={styles.section}>
        <ThemedText type="defaultSemiBold">Alignment</ThemedText>
        <SegmentedControl options={ALIGN_OPTIONS} value={align} onChange={setAlign} />
      </View>

      <SketchActions
        sketch={text.trim() ? layout.sketch : null}
        fileName="robosketch-text"
        onError={onError}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 16,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  header: {
    gap: 4,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
  },
  section: {
    gap: 8,
  },
  textInput: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    lineHeight: 22,
  },
  note: {
    fontSize: 14,
    lineHeight: 20,
  },
  warning: {
    color: '#B26A00',
  },
  error: {
    color: '#D93025',
  },
});
