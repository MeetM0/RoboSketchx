import { Image } from 'expo-image';
import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Section } from '@/components/ui/list';
import { Workspace } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { Radius, Space } from '@/constants/theme';
import { BackgroundOverlay } from '@/features/draw/background-overlay';
import { PlotActionBar } from '@/features/plot/plot-action-bar';
import { SketchPreview, Stage } from '@/features/plot/sketch-preview';
import { StatusPill } from '@/features/robot/status-pill';
import { useTheme } from '@/hooks/use-theme';
import type { DetailLevel, RgbaImage } from '@/lib/geometry';
import {
  decodeJpegBase64,
  PHOTO_WORK_SIZE,
  photoToSketchWithModel,
  type BackgroundRemoval,
  type PhotoSketch,
  type TraceMode,
} from '@/lib/sources/photo';
import { getLineModel } from '@/platform/line-model';
import { pickImage, type PickedImage } from '@/platform/pick-image';
import { preparePhoto } from '@/platform/prepare-photo';
import { usePlotterSettings } from '@/state/plotter-settings';

const DETAIL_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
] as const;

const BACKGROUND_OPTIONS = [
  { value: 'remove', label: 'Remove' },
  { value: 'keep', label: 'Keep' },
] as const;

type BackgroundMode = (typeof BACKGROUND_OPTIONS)[number]['value'];

const TRACE_OPTIONS = [
  { value: 'lines', label: 'Single lines' },
  { value: 'edges', label: 'Outlines' },
] as const;

type Settings = { detail: DetailLevel; background: BackgroundMode; trace: TraceMode };

const VIEW_OPTIONS = [
  { value: 'sketch', label: 'Drawing' },
  { value: 'photo', label: 'Photo' },
] as const;

const REMOVAL_FAILURE_MESSAGES: Record<
  Extract<BackgroundRemoval, { ok: false }>['reason'],
  string
> = {
  'busy-background':
    'The background is too busy to separate, so the whole photo is drawn. A plain wall, table or sky works best.',
  'no-background': "Couldn't tell the background from the subject, so the whole photo is drawn.",
  'no-subject': "Couldn't find a clear subject, so the whole photo is drawn.",
};

// Tracing runs on the JS thread; yield first so the progress state can render.
const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 50));

/** Your own photo, traced into pen lines; background removal and detail level adjustable. */
export function PhotoMode({ toolbar }: { toolbar: ReactNode }) {
  const colors = useTheme();
  const { settings } = usePlotterSettings();
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  // The downscaled photo the engine works on.
  const [source, setSource] = useState<RgbaImage | null>(null);
  const [result, setResult] = useState<PhotoSketch | null>(null);
  const [detail, setDetail] = useState<DetailLevel>('medium');
  const [background, setBackground] = useState<BackgroundMode>('remove');
  // 'auto' until the person picks: the engine detects line drawings itself.
  const [trace, setTrace] = useState<TraceMode>('auto');
  const [view, setView] = useState<'sketch' | 'photo'>('sketch');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped on every new request so results from an older, slower request are ignored.
  const jobRef = useRef(0);

  async function generate(job: number, image: RgbaImage, options: Settings) {
    await nextFrame();
    const next = await photoToSketchWithModel(
      image,
      {
        detail: options.detail,
        removeBackground: options.background === 'remove',
        trace: options.trace,
        settings,
      },
      getLineModel()
    );
    if (job === jobRef.current) setResult(next);
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

  async function pickPhoto(from: 'camera' | 'library') {
    let asset: PickedImage | null;
    try {
      asset = await pickImage(from);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    if (!asset) return;

    setPhoto(asset);
    setSource(null);
    setResult(null);
    setView('sketch');
    setTrace('auto');
    await run(async (job) => {
      const { uri, width, height } = asset;
      const image = decodeJpegBase64(await preparePhoto(uri, width, height, PHOTO_WORK_SIZE));
      if (job !== jobRef.current) return;
      setSource(image);
      await generate(job, image, { detail, background, trace: 'auto' });
    });
  }

  function changeDetail(level: DetailLevel) {
    setDetail(level);
    if (source) run((job) => generate(job, source, { detail: level, background, trace }));
  }

  function changeBackground(mode: BackgroundMode) {
    setBackground(mode);
    if (source) run((job) => generate(job, source, { detail, background: mode, trace }));
  }

  function changeTrace(mode: 'lines' | 'edges') {
    setTrace(mode);
    if (source) run((job) => generate(job, source, { detail, background, trace: mode }));
  }

  const sketch = result?.sketch ?? null;
  const removal = result?.removal ?? null;
  const removalApplied = background === 'remove' && removal?.ok ? removal : null;
  const removalFailure =
    background === 'remove' && removal && !removal.ok
      ? REMOVAL_FAILURE_MESSAGES[removal.reason]
      : null;

  const pickButtons = (variant: 'primary' | 'secondary') => (
    <View style={styles.row}>
      <Button
        title="Take photo"
        icon="camera.fill"
        variant={variant}
        grow
        disabled={busy}
        onPress={() => pickPhoto('camera')}
      />
      <Button
        title="Choose photo"
        icon="photo.on.rectangle"
        variant="secondary"
        grow
        disabled={busy}
        onPress={() => pickPhoto('library')}
      />
    </View>
  );

  const busyOverlay = busy ? (
    <View
      style={[styles.busy, { backgroundColor: colors.surface, borderColor: colors.border }]}
      role="status">
      <ActivityIndicator color={colors.accent} />
      <Text variant="label">{source ? 'Tracing lines…' : 'Opening photo…'}</Text>
    </View>
  ) : null;

  let stage: ReactNode;
  if (!photo) {
    stage = (
      <SketchPreview
        sketch={null}
        settings={settings}
        overlay={
          <View style={styles.empty}>
            <IconSymbol name="photo.on.rectangle" size={32} color={colors.textTertiary} />
            <Text variant="secondary" tone="secondary" style={styles.center}>
              Your drawing appears here
            </Text>
          </View>
        }
      />
    );
  } else if (view === 'photo') {
    const aspect = source
      ? source.width / source.height
      : photo.width && photo.height
        ? photo.width / photo.height
        : 1;
    stage = (
      <Stage aspect={aspect} label="The photo; faded areas won't be drawn">
        {/* Same frame as the processed image so the background overlay lines up. */}
        <View style={styles.photoFrame}>
          <Image source={{ uri: photo.uri }} contentFit="fill" style={StyleSheet.absoluteFill} />
          {source && result && (
            <BackgroundOverlay
              frameWidth={source.width}
              frameHeight={source.height}
              crop={result.crop}
              mask={removalApplied?.mask ?? null}
              maskWidth={result.traced.width}
              maskHeight={result.traced.height}
            />
          )}
        </View>
        {busyOverlay && <View style={styles.centerOverlay}>{busyOverlay}</View>}
      </Stage>
    );
  } else {
    stage = <SketchPreview sketch={sketch} settings={settings} overlay={busyOverlay} />;
  }

  return (
    <Workspace
      title="Draw"
      headerRight={<StatusPill />}
      toolbar={toolbar}
      stage={stage}
      footer={
        <PlotActionBar
          sketch={sketch}
          busy={busy}
          emptyHint={
            photo
              ? 'No lines found. Try more detail or keep the background.'
              : 'Choose a photo to start.'
          }
          fileName="robosketch-drawing"
        />
      }>
      {error && (
        <Banner
          tone="error"
          title="Couldn't use that photo"
          message={error}
          actionLabel={photo ? undefined : 'Try another photo'}
          onAction={photo ? undefined : () => pickPhoto('library')}
        />
      )}

      {!photo ? (
        <Section
          title="Turn a photo into a drawing"
          footer="Simple subjects with clear outlines on a plain background give the cleanest lines.">
          {pickButtons('primary')}
        </Section>
      ) : (
        <>
          <Section title="Show">
            <Segmented label="Show" options={VIEW_OPTIONS} value={view} onChange={setView} />
            {view === 'photo' && removalApplied && (
              <Text variant="caption" tone="secondary">
                Faded areas are background and won&apos;t be drawn.
              </Text>
            )}
          </Section>
          <Section
            title="Drawing style"
            footer={
              (trace === 'auto' ? 'Picked automatically. ' : '') +
              'Single lines draws each line of a cartoon or sketch once, along its middle. Outlines draws around the edges of every shape, best for photos.'
            }>
            <Segmented
              label="Drawing style"
              options={TRACE_OPTIONS}
              value={trace === 'auto' ? (result?.trace ?? 'lines') : trace}
              onChange={changeTrace}
              disabled={busy}
            />
          </Section>
          <Section title="Background">
            <Segmented
              label="Background"
              options={BACKGROUND_OPTIONS}
              value={background}
              onChange={changeBackground}
              disabled={busy}
            />
            {removalFailure && <Banner tone="warning" message={removalFailure} />}
          </Section>
          <Section title="Detail" footer="More detail draws more lines and takes longer.">
            <Segmented
              label="Detail"
              options={DETAIL_OPTIONS}
              value={detail}
              onChange={changeDetail}
              disabled={busy}
            />
          </Section>
          <Section title="Photo">{pickButtons('secondary')}</Section>
        </>
      )}
    </Workspace>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  empty: {
    alignItems: 'center',
    gap: Space.sm,
  },
  center: {
    textAlign: 'center',
  },
  photoFrame: {
    flex: 1,
    borderRadius: Radius.control,
    overflow: 'hidden',
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  busy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderWidth: 1,
    borderRadius: Radius.control,
  },
});
