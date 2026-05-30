// src/color.ts
import { parse, formatHex, formatHex8, differenceCiede2000 } from "culori";

const diff = differenceCiede2000();

/** Normalize any CSS color string to lowercase hex, or null if unparseable. */
export function toHex(input: string): string | null {
  const c = parse(input);
  if (!c) return null;
  return formatHex(c).toLowerCase();
}

/** True if the color parses and is fully transparent (alpha === 0). */
export function isTransparent(input: string): boolean {
  const c = parse(input);
  return !!c && c.alpha === 0;
}

/**
 * Normalize a CSS color for comparison: undefined if unparseable or fully
 * transparent; an 8-digit hex when it carries partial alpha (so transparency
 * is never silently dropped — CIEDE2000 ignores alpha); else 6-digit hex.
 */
export function normalizeColor(input: string): string | undefined {
  const c = parse(input);
  if (!c || c.alpha === 0) return undefined;
  if (c.alpha !== undefined && c.alpha < 1) return formatHex8(c).toLowerCase();
  return formatHex(c).toLowerCase();
}

/** Alpha channel 0..1 (1 when opaque/unspecified), or NaN if unparseable. */
export function alphaOf(input: string): number {
  const c = parse(input);
  if (!c) return NaN;
  return c.alpha ?? 1;
}

/** CIEDE2000 perceptual distance between two colors. Infinity if either is unparseable. */
export function deltaE(a: string, b: string): number {
  const ca = parse(a);
  const cb = parse(b);
  if (!ca || !cb) return Infinity;
  return diff(ca, cb);
}
