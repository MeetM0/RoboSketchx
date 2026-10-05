import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { SegmentedControl } from '@/components/segmented-control';
import { SketchPreview } from '@/components/sketch-preview';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePlotterSettings } from '@/lib/plotter-settings';
import { preparePhoto } from '@/lib/prepare-photo';
import { shareTextFile } from '@/lib/share-file';
import {
  computeStats,
  DETAIL_PRESETS,
  jpegBase64ToSketch,
  pixelToPaperTransform,
  sketchToGcode,
  sketchToSvg,
  type DetailLevel,
  type Sketch,
} from '@/lib/sketch';

const DETAIL_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
] as const;

const VIEW_OPTIONS = [
  { value: 'sketch', label: 'Sketch' },
  { value: 'photo', label: 'Photo' },
] as const;

type Photo = { uri: string; width: number; height: number };

// Edge detection runs on the JS thread; yield first so the spinner can render.
const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 50));

export default function CreateScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const { settings } = usePlotterSettings();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailLevel>('medium');
  const [view, setView] = useState<'sketch' | 'photo'>('sketch');
  const [sketch, setSketch] = useState<Sketch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped on every new request so results from an older, slower request are ignored.
  const jobRef = useRef(0);

  async function generate(job: number, base64: string, level: DetailLevel) {
    await nextFrame();
    const result = jpegBase64ToSketch(base64, DETAIL_PRESETS[level]);
    if (job === jobRef.current) setSketch(result);
  }

  async function run(task: (job: number) => Promise<void>) {
    const job = ++jobRef.current;
    setBusy(true);
    setError(null);
    try {
      await task(job);
    } catch (e) {
      if (job === jobRef.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (job === jobRef.current) setBusy(false);
    }
  }

  async function pickPhoto(source: 'camera' | 'library') {
    if (source === 'camera' && process.env.EXPO_OS !== 'web') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError('Camera permission is needed to take a photo.');
        return;
      }
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;

    const asset = result.assets[0];
    setPhoto({ uri: asset.uri, width: asset.width, height: asset.height });
    setSketch(null);
    setView('sketch');
    await run(async (job) => {
      const base64 = await preparePhoto(asset.uri, asset.width, asset.height);
      if (job !== jobRef.current) return;
      setPhotoBase64(base64);
      await generate(job, base64, detail);
    });
  }

  function changeDetail(level: DetailLevel) {
    setDetail(level);
    if (photoBase64) run((job) => generate(job, photoBase64, level));
  }

  async function exportFile(kind: 'gcode' | 'svg') {
    if (!sketch) return;
    const name = `robosketch-${Date.now()}`;
    try {
      if (kind === 'gcode') {
        await shareTextFile(`${name}.gcode`, sketchToGcode(sketch, settings), 'text/plain');
      } else {
        await shareTextFile(`${name}.svg`, sketchToSvg(sketch), 'image/svg+xml');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText type="title">RoboSketch</ThemedText>
            <ThemedText style={{ color: colors.icon }}>
              Turn a photo into lines your robot can draw.
            </ThemedText>
          </View>

          {!photo ? (
            <View style={[styles.emptyCard, { borderColor: colors.border }]}>
              <IconSymbol name="pencil.and.outline" size={48} color={colors.icon} />
              <ThemedText type="subtitle">Start with a photo</ThemedText>
              <ThemedText style={[styles.centerText, { color: colors.icon }]}>
                Simple subjects with clear outlines on a plain background give the cleanest
                drawings.
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
                ) : sketch ? (
                  <SketchPreview sketch={sketch} settings={settings} />
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
                    <ThemedText style={styles.busyText}>Tracing lines…</ThemedText>
                  </View>
                )}
              </View>

              <View style={styles.section}>
                <ThemedText type="defaultSemiBold">Detail</ThemedText>
                <SegmentedControl
                  options={DETAIL_OPTIONS}
                  value={detail}
                  onChange={changeDetail}
                  disabled={busy}
                />
              </View>

              {sketch && (
                <SketchSummary sketch={sketch} cardColor={colors.card} mutedColor={colors.icon} />
              )}

              <View style={styles.row}>
                <Button
                  title="Export G-code"
                  icon="square.and.arrow.up"
                  disabled={!sketch || busy}
                  onPress={() => exportFile('gcode')}
                />
                <Button
                  title="Export SVG"
                  variant="secondary"
                  disabled={!sketch || busy}
                  onPress={() => exportFile('svg')}
                />
              </View>
            </>
          )}

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}

          <View style={styles.section}>
            {photo && <ThemedText type="defaultSemiBold">New photo</ThemedText>}
            <View style={styles.row}>
              <Button
                title="Take photo"
                icon="camera.fill"
                variant={photo ? 'secondary' : 'primary'}
                disabled={busy}
                onPress={() => pickPhoto('camera')}
              />
              <Button
                title="Choose photo"
                icon="photo.on.rectangle"
                variant={photo ? 'secondary' : 'primary'}
                disabled={busy}
                onPress={() => pickPhoto('library')}
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function SketchSummary({
  sketch,
  cardColor,
  mutedColor,
}: {
  sketch: Sketch;
  cardColor: string;
  mutedColor: string;
}) {
  const { settings } = usePlotterSettings();
  const stats = computeStats(sketch.strokes);
  const { scale } = pixelToPaperTransform(sketch, settings);
  const minutes =
    (stats.drawLength * scale) / settings.drawFeedRate +
    (stats.travelLength * scale) / settings.travelFeedRate;
  const items = [
    { label: 'Strokes', value: stats.strokeCount.toLocaleString() },
    { label: 'Drawing size', value: `${Math.round(sketch.width * scale)}×${Math.round(sketch.height * scale)} mm` },
    { label: 'Est. time', value: minutes < 1 ? '< 1 min' : `≈ ${Math.round(minutes)} min` },
  ];

  return (
    <View style={[styles.summary, { backgroundColor: cardColor }]}>
      {items.map((item) => (
        <View key={item.label} style={styles.summaryItem}>
          <ThemedText style={[styles.summaryLabel, { color: mutedColor }]}>{item.label}</ThemedText>
          <ThemedText type="defaultSemiBold">{item.value}</ThemedText>
        </View>
      ))}
    </View>
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
  section: {
    gap: 8,
  },
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
  error: {
    color: '#D93025',
  },
});
