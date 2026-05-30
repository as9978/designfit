// test/color.test.ts
import { describe, it, expect } from "vitest";
import { toHex, isTransparent, deltaE } from "../src/color";

describe("toHex", () => {
  it("converts rgb() to hex", () => {
    expect(toHex("rgb(29, 78, 216)")).toBe("#1d4ed8");
  });
  it("passes hex through (normalized lowercase)", () => {
    expect(toHex("#1D4ED8")).toBe("#1d4ed8");
  });
  it("returns null for unparseable input", () => {
    expect(toHex("not-a-color")).toBeNull();
  });
});

describe("isTransparent", () => {
  it("is true for fully transparent colors", () => {
    expect(isTransparent("rgba(0, 0, 0, 0)")).toBe(true);
  });
  it("is false for opaque colors", () => {
    expect(isTransparent("rgb(0, 0, 0)")).toBe(false);
  });
});

describe("deltaE", () => {
  it("is 0 for identical colors", () => {
    expect(deltaE("#1d4ed8", "#1d4ed8")).toBe(0);
  });
  it("is small for near-identical colors", () => {
    expect(deltaE("#1d4ed8", "#1e4fd9")).toBeLessThan(2);
  });
  it("is large for very different colors", () => {
    expect(deltaE("#1d4ed8", "#ff0000")).toBeGreaterThan(20);
  });
  it("is Infinity when a color cannot be parsed", () => {
    expect(deltaE("#1d4ed8", "nope")).toBe(Infinity);
  });
});
