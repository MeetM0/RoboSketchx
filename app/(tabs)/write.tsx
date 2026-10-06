import { Image } from 'expo-image';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { FontPicker } from '@/components/font-picker';
import { SegmentedControl } from '@/components/segmented-control';
import { SketchActions } from '@/components/sketch-actions';
import { SketchPreview } from '@/components/sketch-preview';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { pickImage, type PickedImage } from '@/lib/pick-image';
import { usePlotterSettings } from '@/lib/plotter-settings';
import { preparePhoto, SCAN_PROCESSING_SIZE } from '@/lib/prepare-photo';
import { decodeJpegBase64, scanPage, type PageScan, type RgbaImage } from '@/lib/sketch';
import { layoutText, type FontId, type TextLayoutOptions } from '@/lib/text/layout';

const MODE_OPTIONS = [
  { value: 'type', label: 'Type' },
  { value: 'scan', label: 'Scan page' },
] as const;

const SIZE_OPTIONS = [
  { value: '5', label: 'Small' },
  { value: '8', label: 'Medium' },
  { value: '12', label: 'Large' },
] as const;

const ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
] as const;

const STYLE_OPTIONS = [
  { value: 'natural', label: 'Natural' },
  { value: 'neat', label: 'Neat' },
] as const;

const INK_OPTIONS = [
  { value: 'pen', label: 'Pen / marker' },
  { value: 'pencil', label: 'Faint / pencil' },
] as const;

/** How much darker than the surrounding paper ink must be; lower picks up fainter lines. */
const INK_SENSITIVITY = { pen: 0.15, pencil: 0.08 } as const;

const VIEW_OPTIONS = [
  { value: 'sketch', label: 'Strokes' },
  { value: 'photo', label: 'Photo' },
] as const;

// Page scanning runs on the JS thread; yield first so the spinner can render.
const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 50));

export default function WriteScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const [mode, setMode] = useState<'type' | 'scan'>('type');
  const [error, setError] = useState<string | null>(null);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <ThemedText type="title">Write</ThemedText>
            <ThemedText style={{ color: colors.icon }}>
              Type a message or scan handwriting, and the robot writes it out.
            </ThemedText>
          </View>
          <SegmentedControl
            options={MODE_OPTIONS}
            value={mode}
            onChange={(next) => {
              setMode(next);
              setError(null);
            }}
          />
          {mode === 'type' ? <TypeMode onError={setError} /> : <ScanMode onError={setError} />}
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
  const [size, setSize] = useState<(typeof SIZE_OPTIONS)[number]['value']>('8');
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
        { font, letterHeightMm: Number(size), lineSpacing: 1.15, align, natural: style === 'natural' }
      ),
    [text, font, size, align, style, settings]
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

function ScanMode({ onError }: { onError: (message: string) => void }) {
  const colors = Colors[useColorScheme() ?? 'light'];
  const { settings } = usePlotterSettings();
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  const [source, setSource] = useState<RgbaImage | null>(null);
  const [scan, setScan] = useState<PageScan | null>(null);
  const [ink, setInk] = useState<keyof typeof INK_SENSITIVITY>('pen');
  const [view, setView] = useState<'sketch' | 'photo'>('sketch');
  const [busy, setBusy] = useState(false);
  // Bumped on every new request so results from an older, slower request are ignored.
  const jobRef = useRef(0);

  async function runJob(task: (job: number) => Promise<void>) {
    const job = ++jobRef.current;
    setBusy(true);
    try {
      await task(job);
    } catch (e) {
      if (job === jobRef.current) onError(e instanceof Error ? e.message : String(e));
    } finally {
      if (job === jobRef.current) setBusy(false);
    }
  }

  async function runScan(job: number, image: RgbaImage, inkType: keyof typeof INK_SENSITIVITY) {
    await nextFrame();
    const result = scanPage(image, { sensitivity: INK_SENSITIVITY[inkType] });
    if (job === jobRef.current) setScan(result);
  }

  async function pickPage(from: 'camera' | 'library') {
    let asset: PickedImage | null;
    try {
      asset = await pickImage(from);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      return;
    }
    if (!asset) return;
    const { uri, width, height } = asset;
    setPhoto(asset);
    setSource(null);
    setScan(null);
    setView('sketch');
    await runJob(async (job) => {
      const image = decodeJpegBase64(await preparePhoto(uri, width, height, SCAN_PROCESSING_SIZE));
      if (job !== jobRef.current) return;
      setSource(image);
      await runScan(job, image, ink);
    });
  }

  function changeInk(next: keyof typeof INK_SENSITIVITY) {
    setInk(next);
    if (source) runJob((job) => runScan(job, source, next));
  }

  const nothingFound = scan !== null && scan.sketch.strokes.length === 0;

  return (
    <>
      {!photo ? (
        <View style={[styles.emptyCard, { borderColor: colors.border }]}>
          <IconSymbol name="doc.text.viewfinder" size={48} color={colors.icon} />
          <ThemedText type="subtitle">Scan handwriting</ThemedText>
          <ThemedText style={[styles.centerText, { color: colors.icon }]}>
            Photograph the page straight on in even light, filling the frame. The robot traces
            the centre of every pen line, so it copies the writing in the same hand.
          </ThemedText>
        </View>
      ) : (
        <>
          <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={setView} />
          <View>
            {view === 'photo' ? (
              <Image
                source={{ uri: photo.uri }}
                contentFit="contain"
                style={[
                  styles.photo,
                  { aspectRatio: photo.width && photo.height ? photo.width / photo.height : 1 },
                ]}
              />
            ) : scan && !nothingFound ? (
              <SketchPreview sketch={scan.sketch} settings={settings} />
            ) : (
              <View
                style={[
                  styles.placeholder,
                  {
                    aspectRatio: settings.paperWidthMm / settings.paperHeightMm,
                    backgroundColor: colors.card,
                  },
                ]}
              />
            )}
            {busy && (
              <View style={styles.busyOverlay}>
                <ActivityIndicator size="large" color={colors.tint} />
                <ThemedText style={styles.busyText}>Reading the page…</ThemedText>
              </View>
            )}
          </View>
          {nothingFound && (
            <ThemedText style={[styles.note, styles.warning]}>
              No writing found. Try &quot;Faint / pencil&quot;, better light, or a closer photo.
            </ThemedText>
          )}

          <View style={styles.section}>
            <ThemedText type="defaultSemiBold">Ink</ThemedText>
            <SegmentedControl options={INK_OPTIONS} value={ink} onChange={changeInk} disabled={busy} />
          </View>

          <SketchActions
            sketch={scan?.sketch ?? null}
            disabled={busy}
            fileName="robosketch-scan"
            onError={onError}
          />
        </>
      )}

      <View style={styles.section}>
        {photo && <ThemedText type="defaultSemiBold">New page</ThemedText>}
        <View style={styles.row}>
          <Button
            title="Scan page"
            icon="camera.fill"
            variant={photo ? 'secondary' : 'primary'}
            disabled={busy}
            onPress={() => pickPage('camera')}
          />
          <Button
            title="Choose photo"
            icon="photo.on.rectangle"
            variant={photo ? 'secondary' : 'primary'}
            disabled={busy}
            onPress={() => pickPage('library')}
          />
        </View>
      </View>
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
  section: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  textInput: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    lineHeight: 22,
  },
  emptyCard: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 40,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
  },
  centerText: {
    textAlign: 'center',
  },
  photo: {
    width: '100%',
    borderRadius: 4,
  },
  placeholder: {
    width: '100%',
    borderRadius: 4,
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 4,
  },
  busyText: {
    color: '#fff',
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
