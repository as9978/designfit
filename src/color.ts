// src/color.ts
import { parse, formatHex, differenceCiede2000 } from "culori";

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

/** CIEDE2000 perceptual distance between two colors. Infinity if either is unparseable. */
export function deltaE(a: string, b: string): number {
  const ca = parse(a);
  const cb = parse(b);
  if (!ca || !cb) return Infinity;
  return diff(ca, cb);
}
