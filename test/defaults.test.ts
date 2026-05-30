// test/defaults.test.ts
import { describe, it, expect } from "vitest";
import { DEFAULT_TOLERANCES } from "../src/defaults";

describe("DEFAULT_TOLERANCES", () => {
  it("uses ±2px geometry tolerance and ΔE ≤ 2 color tolerance", () => {
    expect(DEFAULT_TOLERANCES.geometry.position).toBe(2);
    expect(DEFAULT_TOLERANCES.geometry.size).toBe(2);
    expect(DEFAULT_TOLERANCES.color.deltaE).toBe(2);
  });

  it("defines a px tolerance for every numeric token property", () => {
    expect(DEFAULT_TOLERANCES.fontSize.px).toBe(1);
    expect(DEFAULT_TOLERANCES.lineHeight.px).toBe(2);
    expect(DEFAULT_TOLERANCES.letterSpacing.px).toBe(0.5);
    expect(DEFAULT_TOLERANCES.borderWidth.px).toBe(1);
    expect(DEFAULT_TOLERANCES.borderRadius.px).toBe(1);
  });
});
