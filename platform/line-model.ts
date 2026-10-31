import type { LineModelRunner } from '@/lib/sources/photo';

/**
 * The learned line-drawing model runs in the browser only for now (see line-model.web.ts).
 * On phones line drawings are traced with the rules alone.
 */
export function getLineModel(): LineModelRunner | undefined {
  return undefined;
}
