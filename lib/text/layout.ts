import type { Point, Polyline, Sketch } from '../sketch/types';

import { FONT_DATA } from './font-data';
import type { StrokeFont } from './types';

export type FontId = keyof typeof FONT_DATA;

export const FONTS: { id: FontId; label: string }[] = (Object.keys(FONT_DATA) as FontId[]).map(
  (id) => ({ id, label: FONT_DATA[id].label })
);

export type TextLayoutOptions = {
  font: FontId;
  /** Height of a capital letter, in millimetres. */
  letterHeightMm: number;
  /** Multiple of the font's natural line height. */
  lineSpacing: number;
  align: 'left' | 'center';
  /** Small random tilt / size / baseline changes per letter so it looks hand-written. */
  natural: boolean;
};

export type TextLayout = {
  /** Strokes in millimetres, laid out inside a `widthMm` × `heightMm` writing area. */
  sketch: Sketch;
  /** Wrapped lines that didn't fit on the page and were left out. */
  overflowLines: number;
  /** Characters the font has no glyph for (skipped). */
  missingChars: string[];
};

type Word = { chars: string[]; width: number };

/**
 * Lays text out as pen strokes in a writing area measured in millimetres. Words wrap to the
 * area's width (over-long words are split), `\n` starts a new line, and strokes are kept in
 * writing order so the robot writes letter by letter like a person would.
 */
export function layoutText(
  text: string,
  area: { widthMm: number; heightMm: number },
  options: TextLayoutOptions
): TextLayout {
  const font: StrokeFont = FONT_DATA[options.font];
  const { metrics } = font;
  const scale = options.letterHeightMm / metrics.capHeight;
  const lineHeight = (metrics.ascent - metrics.descent) * scale * options.lineSpacing;
  const spaceWidth = (font.glyphs[' ']?.[0] ?? metrics.unitsPerEm * 0.3) * scale;
  const missing = new Set<string>();

  const glyphFor = (char: string) => {
    const glyph = font.glyphs[char];
    if (!glyph) missing.add(char);
    return glyph;
  };
  const charWidth = (char: string) => (glyphFor(char)?.[0] ?? 0) * scale;

  // Wrap each paragraph into lines of words.
  const lines: Word[][] = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line: Word[] = [];
    let lineWidth = 0;
    const pushLine = () => {
      lines.push(line);
      line = [];
      lineWidth = 0;
    };
    for (const word of splitLongWords(paragraph, area.widthMm, charWidth)) {
      const extra = (line.length ? spaceWidth : 0) + word.width;
      if (line.length && lineWidth + extra > area.widthMm) pushLine();
      lineWidth += (line.length ? spaceWidth : 0) + word.width;
      line.push(word);
    }
    pushLine();
  }

  const random = seededRandom(hash(text));
  const strokes: Polyline[] = [];
  let overflowLines = 0;
  lines.forEach((line, index) => {
    const baseline = metrics.ascent * scale + index * lineHeight;
    if (baseline - metrics.descent * scale > area.heightMm + 1e-6) {
      overflowLines++;
      return;
    }
    const width = line.reduce((sum, w, i) => sum + w.width + (i ? spaceWidth : 0), 0);
    let x = options.align === 'center' ? (area.widthMm - width) / 2 : 0;
    // Some letters (j, f, script capitals) reach left of their origin; keep them on the page.
    const first = line[0]?.chars[0];
    const firstStrokes = first ? (font.glyphs[first]?.[1] ?? []) : [];
    const overhang = Math.min(0, ...firstStrokes.flatMap((st) => st.filter((_, i) => i % 2 === 0)));
    x = Math.max(x, -overhang * scale);
    line.forEach((word, i) => {
      if (i) x += spaceWidth;
      for (const char of word.chars) {
        const glyph = glyphFor(char);
        if (!glyph) continue;
        const [advance, glyphStrokes] = glyph;
        // Per-letter variation, pivoting around the letter's centre on the baseline.
        const tilt = options.natural ? (random() - 0.5) * 0.06 : 0;
        const size = options.natural ? 1 + (random() - 0.5) * 0.06 : 1;
        const lift = options.natural ? (random() - 0.5) * 0.05 * options.letterHeightMm : 0;
        const pivotX = x + (advance * scale) / 2;
        const cos = Math.cos(tilt);
        const sin = Math.sin(tilt);
        for (const flat of glyphStrokes) {
          const stroke: Point[] = [];
          for (let p = 0; p < flat.length; p += 2) {
            const dx = (x + flat[p] * scale - pivotX) * size;
            const dy = -flat[p + 1] * scale * size;
            stroke.push({
              x: pivotX + dx * cos - dy * sin,
              y: baseline + lift + dx * sin + dy * cos,
            });
          }
          // A single point is a dot (e.g. a full stop): touch the pen down once.
          strokes.push(stroke.length === 1 ? [stroke[0], stroke[0]] : stroke);
        }
        x += advance * scale;
      }
    });
  });

  return {
    sketch: { width: area.widthMm, height: area.heightMm, strokes },
    overflowLines,
    missingChars: [...missing].filter((c) => c.trim()),
  };
}

/** Splits a paragraph into words, breaking any word wider than the line into pieces. */
function splitLongWords(paragraph: string, maxWidth: number, charWidth: (c: string) => number) {
  const words: Word[] = [];
  for (const raw of paragraph.split(/ +/)) {
    if (!raw) continue;
    let chars: string[] = [];
    let width = 0;
    for (const char of Array.from(raw)) {
      const w = charWidth(char);
      if (chars.length && width + w > maxWidth) {
        words.push({ chars, width });
        chars = [];
        width = 0;
      }
      chars.push(char);
      width += w;
    }
    words.push({ chars, width });
  }
  return words;
}

/** Deterministic PRNG so the same text always gets the same "handwriting" variation. */
function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return Math.abs(h) % 2147483646;
}
