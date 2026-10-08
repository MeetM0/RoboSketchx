import { Image } from 'expo-image';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { BackgroundOverlay } from '@/components/background-overlay';
import { PlotActionBar } from '@/components/plot-action-bar';
import { StatusPill } from '@/components/robot/status-pill';
import { SketchPreview, Stage } from '@/components/sketch-preview';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { ChipGroup } from '@/components/ui/chip';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Section } from '@/components/ui/list';
import { focusRing, type PressState } from '@/components/ui/pressable-styles';
import { Workspace } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { Radius, Space } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  CATALOG,
  CATALOG_CATEGORIES,
  pictureToSketch,
  type CatalogCategory,
  type CatalogPicture,
} from '@/lib/catalog';
import { usePlotterSettings } from '@/lib/plotter-settings';
import { pickImage, type PickedImage } from '@/lib/pick-image';
import { preparePhoto } from '@/lib/prepare-photo';
import {
  decodeJpegBase64,
  PHOTO_WORK_SIZE,
  photoToSketch,
  type BackgroundRemoval,
  type DetailLevel,
  type PhotoSketch,
  type RgbaImage,
} from '@/lib/sketch';

const MODE_OPTIONS = [
  { value: 'gallery', label: 'Gallery' },
  { value: 'photo', label: 'Photo' },
] as const;

type DrawMode = (typeof MODE_OPTIONS)[number]['value'];

export default function DrawScreen() {
  const [mode, setMode] = useState<DrawMode>('gallery');
  const toolbar = (
    <Segmented label="Source" options={MODE_OPTIONS} value={mode} onChange={setMode} />
  );

  // Both stay mounted so a traced photo survives a look at the gallery.
  return (
    <View style={styles.fill}>
      <View style={[styles.fill, mode !== 'gallery' && styles.hidden]}>
        <GalleryMode toolbar={toolbar} />
      </View>
      <View style={[styles.fill, mode !== 'photo' && styles.hidden]}>
        <PhotoMode toolbar={toolbar} />
      </View>
    </View>
  );
}

// ─── Gallery ────────────────────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: 'All', label: 'All' },
  ...CATALOG_CATEGORIES.map((c) => ({ value: c, label: c })),
] as const;

function GalleryMode({ toolbar }: { toolbar: ReactNode }) {
  const { settings } = usePlotterSettings();
  const [category, setCategory] = useState<CatalogCategory | 'All'>('All');
  const [selectedId, setSelectedId] = useState(CATALOG[0].id);

  const selected = CATALOG.find((p) => p.id === selectedId) ?? CATALOG[0];
  const sketch = useMemo(() => pictureToSketch(selected), [selected]);
  const pictures = category === 'All' ? CATALOG : CATALOG.filter((p) => p.category === category);

  return (
    <Workspace
      title="Draw"
      headerRight={<StatusPill />}
      toolbar={toolbar}
      stage={
        <SketchPreview
          sketch={sketch}
          settings={settings}
          caption={`${selected.name} · ${selected.category}`}
          label={`${selected.name} on the paper`}
        />
      }
      footer={
        <PlotActionBar
          sketch={sketch}
          emptyHint="Choose a picture."
          fileName={`robosketch-${selected.id}`}
        />
      }>
      <Section title="Pictures">
        <ChipGroup
          label="Category"
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={setCategory}
        />
        <View style={styles.grid}>
          {pictures.map((picture) => (
            <Thumbnail
              key={picture.id}
              picture={picture}
              selected={picture.id === selected.id}
              onPress={() => setSelectedId(picture.id)}
            />
          ))}
        </View>
      </Section>
    </Workspace>
  );
}

function Thumbnail({
  picture,
  selected,
  onPress,
}: {
  picture: CatalogPicture;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={picture.name}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={(state: PressState) => [styles.thumb, focusRing(state, colors)]}>
      {({ pressed }) => (
        <>
          <View
            style={[
              styles.thumbPaper,
              {
                backgroundColor: colors.paper,
                borderColor: selected
                  ? colors.accent
                  : pressed
                    ? colors.borderStrong
                    : colors.border,
              },
              selected && styles.thumbSelected,
            ]}>
            <Svg width="100%" height="100%" viewBox="-6 -6 112 112">
              <Path
                d={picture.paths.join(' ')}
                fill="none"
                stroke={colors.ink}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>
          <Text variant="caption" tone={selected ? 'accent' : 'secondary'} numberOfLines={1}>
            {picture.name}
          </Text>
        </>
      )}
    </Pressable>
  );
}

// ─── Photo ──────────────────────────────────────────────────────────────────────────────────

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

// Edge detection runs on the JS thread; yield first so the progress state can render.
const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 50));

function PhotoMode({ toolbar }: { toolbar: ReactNode }) {
  const colors = useTheme();
  const { settings } = usePlotterSettings();
  const [photo, setPhoto] = useState<PickedImage | null>(null);
  // The downscaled photo the engine works on.
  const [source, setSource] = useState<RgbaImage | null>(null);
  const [result, setResult] = useState<PhotoSketch | null>(null);
  const [detail, setDetail] = useState<DetailLevel>('medium');
  const [background, setBackground] = useState<BackgroundMode>('remove');
  const [view, setView] = useState<'sketch' | 'photo'>('sketch');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped on every new request so results from an older, slower request are ignored.
  const jobRef = useRef(0);

  async function generate(job: number, image: RgbaImage, level: DetailLevel, mode: BackgroundMode) {
    await nextFrame();
    const next = photoToSketch(image, {
      detail: level,
      removeBackground: mode === 'remove',
      settings,
    });
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
    await run(async (job) => {
      const { uri, width, height } = asset;
      const image = decodeJpegBase64(await preparePhoto(uri, width, height, PHOTO_WORK_SIZE));
      if (job !== jobRef.current) return;
      setSource(image);
      await generate(job, image, detail, background);
    });
  }

  function changeDetail(level: DetailLevel) {
    setDetail(level);
    if (source) run((job) => generate(job, source, level, background));
  }

  function changeBackground(mode: BackgroundMode) {
    setBackground(mode);
    if (source) run((job) => generate(job, source, detail, mode));
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
  fill: {
    flex: 1,
  },
  hidden: {
    display: 'none',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.md,
  },
  thumb: {
    // Three per row in the narrowest column; the gap is 12.
    width: '30.5%',
    flexGrow: 1,
    maxWidth: 160,
    gap: Space.xs,
    borderRadius: Radius.card,
  },
  thumbPaper: {
    aspectRatio: 1,
    borderWidth: 1,
    borderRadius: Radius.card,
    padding: Space.xs,
  },
  thumbSelected: {
    borderWidth: 2,
    padding: Space.xs - 1,
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
