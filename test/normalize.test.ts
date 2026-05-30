// test/normalize.test.ts
import { describe, it, expect } from "vitest";
import { parsePx, normalizeFamily, normalizeStyles } from "../src/normalize";
import type { RawComputed } from "../src/types";

describe("parsePx", () => {
  it("parses '16px' to 16", () => {
    expect(parsePx("16px")).toBe(16);
  });
  it("returns undefined for 'normal'", () => {
    expect(parsePx("normal")).toBeUndefined();
  });
});

describe("normalizeFamily", () => {
  it("takes the first family, strips quotes, lowercases", () => {
    expect(normalizeFamily('"Inter", sans-serif')).toBe("inter");
  });
});

describe("normalizeStyles", () => {
  const raw: RawComputed = {
    backgroundColor: "rgb(29, 78, 216)",
    color: "rgb(255, 255, 255)",
    fontFamily: '"Inter", sans-serif',
    fontSize: "16px",
    fontWeight: "700",
    lineHeight: "24px",
    letterSpacing: "normal",
    borderTopLeftRadius: "8px",
    borderTopColor: "rgb(0, 0, 0)",
    borderTopWidth: "0px",
    opacity: "1",
  };

  it("normalizes colors to hex and sizes to numbers", () => {
    const s = normalizeStyles(raw);
    expect(s.fill).toBe("#1d4ed8");
    expect(s.color).toBe("#ffffff");
    expect(s.fontFamily).toBe("inter");
    expect(s.fontSize).toBe(16);
    expect(s.fontWeight).toBe(700);
    expect(s.lineHeight).toBe(24);
    expect(s.borderRadius).toBe(8);
    expect(s.opacity).toBe(1);
  });

  it("treats 'normal' letter-spacing as undefined", () => {
    expect(normalizeStyles(raw).letterSpacing).toBeUndefined();
  });

  it("treats a zero-width border as no border color", () => {
    expect(normalizeStyles(raw).borderColor).toBeUndefined();
    expect(normalizeStyles(raw).borderWidth).toBe(0);
  });

  it("treats a transparent background as undefined fill", () => {
    const s = normalizeStyles({ ...raw, backgroundColor: "rgba(0, 0, 0, 0)" });
    expect(s.fill).toBeUndefined();
  });

  it("preserves partial alpha as an 8-digit hex so transparency is not dropped", () => {
    const s = normalizeStyles({ ...raw, backgroundColor: "rgba(29, 78, 216, 0.5)" });
    expect(s.fill).toMatch(/^#1d4ed8[0-9a-f]{2}$/);
  });
});
