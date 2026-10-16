/**
 * Built-in cartoon line drawings. Each picture is SVG path data in a 100 × 100 box (y down),
 * drawn as single pen lines so the robot can plot it directly.
 *
 * To add a picture: append an entry, check it in the app, then run `npm run export-catalog`
 * to refresh the ready-made G-code in /catalog.
 */

export type CatalogCategory = 'Animals' | 'Things' | 'Nature';

export type CatalogPicture = {
  id: string;
  name: string;
  category: CatalogCategory;
  /** SVG path data, one entry per part, in drawing order. */
  paths: string[];
};

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0`;

const rect = (x: number, y: number, w: number, h: number, r = 0) =>
  r
    ? `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}` +
      `h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`
    : `M${x} ${y}h${w}v${h}h${-w}z`;

/** A petal shape starting `offset` from (cx, cy) and pointing out at `angle` degrees. */
const petal = (
  cx: number,
  cy: number,
  angleDeg: number,
  offset: number,
  length: number,
  width: number
) => {
  const a = (angleDeg * Math.PI) / 180;
  const x = cx + Math.cos(a) * offset;
  const y = cy + Math.sin(a) * offset;
  const tip = { x: x + Math.cos(a) * length, y: y + Math.sin(a) * length };
  const nx = -Math.sin(a) * width;
  const ny = Math.cos(a) * width;
  const mid = { x: x + Math.cos(a) * length * 0.55, y: y + Math.sin(a) * length * 0.55 };
  const r = (n: number) => Math.round(n * 100) / 100;
  return (
    `M${r(x)} ${r(y)}Q${r(mid.x + nx)} ${r(mid.y + ny)} ${r(tip.x)} ${r(tip.y)}` +
    `Q${r(mid.x - nx)} ${r(mid.y - ny)} ${r(x)} ${r(y)}`
  );
};

/** Diagonal waffle lines inside the ice-cream cone (apex at the bottom). */
const waffle = () => {
  const r = (n: number) => Math.round(n * 100) / 100;
  const left = (t: number) => `${r(36 + 14 * t)} ${r(50 + 42 * t)}`;
  const right = (t: number) => `${r(64 - 14 * t)} ${r(50 + 42 * t)}`;
  return [0, 0.22, 0.44]
    .map((t) => `M${left(t)}L${right(t + 0.32)}M${right(t)}L${left(t + 0.32)}`)
    .join('');
};

/** Straight rays around a centre, e.g. for a sun. */
const rays = (cx: number, cy: number, inner: number, outer: number, count: number) =>
  Array.from({ length: count }, (_, i) => {
    const a = (i / count) * 2 * Math.PI;
    const r = (n: number) => Math.round(n * 100) / 100;
    return `M${r(cx + Math.cos(a) * inner)} ${r(cy + Math.sin(a) * inner)}L${r(cx + Math.cos(a) * outer)} ${r(cy + Math.sin(a) * outer)}`;
  }).join('');

export const CATALOG: CatalogPicture[] = [
  {
    id: 'cat',
    name: 'Cat',
    category: 'Animals',
    paths: [
      // Head with ears
      'M24 48L21 16L41 31Q50 28 59 31L79 16L76 48Q82 78 50 82Q18 78 24 48Z',
      'M26 24L36 32M74 24L64 32',
      ellipse(39, 51, 4, 5.5),
      ellipse(61, 51, 4, 5.5),
      circle(40.5, 49.5, 1.2),
      circle(62.5, 49.5, 1.2),
      'M46 60L54 60L50 64Z',
      'M50 64Q50 69 44 69M50 64Q50 69 56 69',
      'M33 61L12 57M33 65L12 68M67 61L88 57M67 65L88 68',
    ],
  },
  {
    id: 'dog',
    name: 'Dog',
    category: 'Animals',
    paths: [
      'M30 34Q50 18 70 34Q80 58 67 75Q50 87 33 75Q20 58 30 34Z',
      // Floppy ears
      'M31 33Q14 28 13 50Q14 64 25 60Q28 46 31 40',
      'M69 33Q86 28 87 50Q86 64 75 60Q72 46 69 40',
      circle(41, 49, 3.5),
      circle(59, 49, 3.5),
      circle(42, 48, 1),
      circle(60, 48, 1),
      ellipse(50, 61, 5.5, 3.8),
      'M50 64.8L50 70Q44 75 39 70M50 70Q56 75 61 70',
      'M46.5 72.5Q50 82 53.5 72.5',
      // Spot over one eye
      'M53 40Q60 35 67 41Q66 47 60 45',
    ],
  },
  {
    id: 'fish',
    name: 'Fish',
    category: 'Animals',
    paths: [
      'M16 50Q38 22 64 44L82 31L79 50L82 69L64 56Q38 78 16 50Z',
      circle(29, 46, 3.5),
      circle(30, 45.5, 1.2),
      'M40 37Q46 50 40 63',
      'M48 42Q52 46 48 50M48 50Q52 54 48 58M55 44Q59 48 55 52M55 52Q59 56 55 60',
      'M38 35Q47 22 58 38',
      'M22 55Q26 58 31 56',
      circle(89, 24, 3),
      circle(85, 14, 2),
      circle(91, 7, 1.4),
    ],
  },
  {
    id: 'owl',
    name: 'Owl',
    category: 'Animals',
    paths: [
      'M30 30L27 13L40 24Q50 21 60 24L73 13L70 30Q74 70 62 84Q50 92 38 84Q26 70 30 30Z',
      circle(41, 38, 9),
      circle(59, 38, 9),
      circle(42.5, 39, 3.5),
      circle(57.5, 39, 3.5),
      'M46.5 47L50 55L53.5 47Z',
      // Chest feathers
      'M41 62L44 66L47 62M53 62L56 66L59 62M47 70L50 74L53 70',
      'M31 44Q20 62 33 79M69 44Q80 62 67 79',
      'M42 87L40 93M45 88L45 94M55 88L55 94M58 87L60 93',
      'M12 93L88 93',
    ],
  },
  {
    id: 'butterfly',
    name: 'Butterfly',
    category: 'Animals',
    paths: [
      ellipse(50, 52, 3, 18),
      'M49 35Q45 24 39 20M51 35Q55 24 61 20',
      circle(38, 19, 1.8),
      circle(62, 19, 1.8),
      // Wings
      'M47 44Q30 12 15 26Q8 42 30 50Q40 52 47 49',
      'M53 44Q70 12 85 26Q92 42 70 50Q60 52 53 49',
      'M47 55Q30 55 23 68Q24 82 37 76Q45 68 47 60',
      'M53 55Q70 55 77 68Q76 82 63 76Q55 68 53 60',
      // Wing spots
      circle(29, 34, 5),
      circle(71, 34, 5),
      circle(34, 67, 3),
      circle(66, 67, 3),
    ],
  },
  {
    id: 'robot',
    name: 'Robot',
    category: 'Things',
    paths: [
      rect(30, 22, 40, 30, 5),
      'M50 22L50 13',
      circle(50, 10.5, 2.5),
      circle(41, 35, 4.5),
      circle(59, 35, 4.5),
      circle(41, 35, 1.3),
      circle(59, 35, 1.3),
      rect(40, 43, 20, 5, 1.5),
      'M45 43V48M50 43V48M55 43V48',
      'M30 33H26V41H30M70 33H74V41H70',
      'M45 52V56M55 52V56',
      rect(26, 56, 48, 30, 4),
      circle(39, 67, 3.5),
      circle(50, 67, 3.5),
      circle(61, 67, 3.5),
      'M36 78H64',
      'M26 62L15 72L17 80M74 62L85 72L83 80',
      rect(33, 86, 11, 8, 2),
      rect(56, 86, 11, 8, 2),
    ],
  },
  {
    id: 'rocket',
    name: 'Rocket',
    category: 'Things',
    paths: [
      'M50 8Q67 24 64 60L36 60Q33 24 50 8Z',
      circle(50, 33, 7),
      circle(50, 33, 4.5),
      'M37 46L26 61L26 70L37 61M63 46L74 61L74 70L63 61',
      'M42 60L40 66L60 66L58 60',
      'M42 68Q44 80 50 92Q56 80 58 68',
      'M46 69Q48 77 50 83Q52 77 54 69',
      'M50 47V57',
      'M15 20H23M19 16V24M80 40H86M83 37V43M14 80H20M17 77V83',
    ],
  },
  {
    id: 'house',
    name: 'House',
    category: 'Things',
    paths: [
      'M18 50L50 22L82 50',
      'M26 43V86H74V43',
      rect(44, 62, 12, 24),
      circle(53, 75, 1),
      rect(31, 54, 10, 10),
      'M36 54V64M31 59H41',
      rect(59, 54, 10, 10),
      'M64 54V64M59 59H69',
      'M62 34V20H70V41',
      'M66 17Q61 13 66 9Q71 5 66 1',
      'M8 86H92',
      'M14 86Q14 78 19 78Q24 78 24 86M78 86Q78 76 84 76Q90 76 90 86',
    ],
  },
  {
    id: 'car',
    name: 'Car',
    category: 'Things',
    paths: [
      'M10 64V54Q12 49 20 48L32 47L41 35Q43 33 47 33H64Q68 33 70 36L78 47L86 49Q91 51 91 57V64' +
        'H82A10 10 0 0 0 62 64H38A10 10 0 0 0 18 64Z',
      'M43 46L48 37H56V46Z',
      'M60 46V37H66L72 46Z',
      circle(28, 65, 8),
      circle(28, 65, 3),
      circle(72, 65, 8),
      circle(72, 65, 3),
      'M58 50H62',
      'M86 53H90M10 57H14',
      'M5 74H95',
    ],
  },
  {
    id: 'ice-cream',
    name: 'Ice cream',
    category: 'Things',
    paths: [
      'M36 50L50 92L64 50',
      waffle(),
      'M34 52Q26 44 34 36Q34 24 46 24Q50 18 56 23Q68 24 66 36Q74 44 66 52Q62 48 58 52Q54 48 50 52' +
        'Q46 48 42 52Q38 48 34 52Z',
      'M40 36Q44 32 48 36M54 32Q57 29 60 32',
      circle(50, 15, 4),
      'M51 11Q53 6 58 5',
    ],
  },
  {
    id: 'flower',
    name: 'Flower',
    category: 'Nature',
    paths: [
      ...Array.from({ length: 6 }, (_, i) => petal(50, 32, i * 60 - 90, 6, 18, 8)),
      circle(50, 32, 6),
      'M50 56Q47 72 50 92',
      'M49 70Q36 58 30 66Q38 76 49 73',
      'M50 79Q63 68 70 74Q62 84 50 82',
      'M20 92H80',
    ],
  },
  {
    id: 'sun',
    name: 'Sun',
    category: 'Nature',
    paths: [
      circle(50, 50, 19),
      rays(50, 50, 25, 36, 12),
      'M41 45Q43 42 45 45M55 45Q57 42 59 45',
      'M40 54Q50 65 60 54',
      'M38 52Q36 54 38 56M62 52Q64 54 62 56',
    ],
  },
];

export const CATALOG_CATEGORIES: CatalogCategory[] = ['Animals', 'Things', 'Nature'];
