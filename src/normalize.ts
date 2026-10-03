// src/normalize.ts
import type { RawComputed, ResolvedStyles } from "./types";
import { normalizeColor } from "./color";

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
  return normalizeColor(value);
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
    // CSS `normal` letter-spacing adds no space: it is 0px, unlike `normal` line-height, which depends on the font.
    letterSpacing: raw.letterSpacing === "normal" ? 0 : parsePx(raw.letterSpacing),
    borderRadius: parsePx(raw.borderTopLeftRadius),
    borderColor: hasBorder ? colorOrUndefined(raw.borderTopColor) : undefined,
    borderWidth,
    opacity: parsePx(raw.opacity),
  };
}
