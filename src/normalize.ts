// src/normalize.ts
import type { RawComputed, ResolvedStyles } from "./types";
import { toHex, isTransparent } from "./color";

/** Parse a CSS length like "16px" to a number, or undefined if not numeric (e.g. "normal"). */
export function parsePx(value: string): number | undefined {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

/** First family in a font-family stack, unquoted and lowercased. */
export function normalizeFamily(value: string): string {
  const first = value.split(",")[0] ?? "";
  return first.replace(/['"]/g, "").trim().toLowerCase();
}

function colorOrUndefined(value: string): string | undefined {
  if (isTransparent(value)) return undefined;
  return toHex(value) ?? undefined;
}

export function normalizeStyles(raw: RawComputed): ResolvedStyles {
  const borderWidth = parsePx(raw.borderTopWidth);
  const hasBorder = borderWidth !== undefined && borderWidth > 0;
  return {
    fill: colorOrUndefined(raw.backgroundColor),
    color: colorOrUndefined(raw.color),
    fontFamily: normalizeFamily(raw.fontFamily),
    fontSize: parsePx(raw.fontSize),
    fontWeight: parsePx(raw.fontWeight),
    lineHeight: parsePx(raw.lineHeight),
    letterSpacing: parsePx(raw.letterSpacing),
    borderRadius: parsePx(raw.borderTopLeftRadius),
    borderColor: hasBorder ? colorOrUndefined(raw.borderTopColor) : undefined,
    borderWidth,
    opacity: parsePx(raw.opacity),
  };
}
