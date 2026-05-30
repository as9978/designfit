// test/compare/tokens.test.ts
import { describe, it, expect } from "vitest";
import { compareTokens } from "../../src/compare/tokens";
import { DEFAULT_TOLERANCES } from "../../src/defaults";
import type { DesignNode, ResolvedStyles } from "../../src/types";

const node = (tokens: DesignNode["tokens"], sources?: DesignNode["tokenSources"]): DesignNode => ({
  id: "n1",
  name: "Button/Primary",
  frame: { x: 0, y: 0, w: 100, h: 40 },
  tokens,
  tokenSources: sources,
  children: [],
});

describe("compareTokens", () => {
  it("passes when every declared token is within tolerance", () => {
    const styles: ResolvedStyles = { fill: "#1d4ed8", fontSize: 16 };
    const out = compareTokens(node({ fill: "#1d4ed8", fontSize: 16 }), styles, DEFAULT_TOLERANCES);
    expect(out.violations).toEqual([]);
    expect(out.checks).toBe(2);
  });

  it("flags a color past the ΔE tolerance and carries the token source", () => {
    const styles: ResolvedStyles = { fill: "#ff0000" };
    const out = compareTokens(node({ fill: "#1d4ed8" }, { fill: "color/primary" }), styles, DEFAULT_TOLERANCES);
    expect(out.violations).toHaveLength(1);
    const v = out.violations[0]!;
    expect(v.check).toBe("token");
    expect(v.property).toBe("fill");
    expect(v.expected.source).toBe("color/primary");
    expect(v.severity).toBe("error");
    expect(v.fixHint).toContain("color/primary");
  });

  it("flags a numeric token past tolerance with a signed delta", () => {
    const styles: ResolvedStyles = { fontSize: 20 };
    const out = compareTokens(node({ fontSize: 16 }), styles, DEFAULT_TOLERANCES);
    expect(out.violations).toHaveLength(1);
    expect(out.violations[0]!.property).toBe("fontSize");
    expect(out.violations[0]!.delta).toContain("+4");
  });

  it("flags a missing actual value", () => {
    const out = compareTokens(node({ fill: "#1d4ed8" }), {}, DEFAULT_TOLERANCES);
    expect(out.violations).toHaveLength(1);
    expect(out.violations[0]!.actual.value).toBe("none");
  });

  it("only counts checks for declared tokens", () => {
    const out = compareTokens(node({ fontWeight: 700 }), { fontWeight: 700 }, DEFAULT_TOLERANCES);
    expect(out.checks).toBe(1);
    expect(out.violations).toEqual([]);
  });

  it("flags a color whose alpha differs even when the hue matches (no silent transparent pass)", () => {
    // #1d4ed880 = the design blue at ~50% alpha; CIEDE2000 ignores alpha, so without
    // the alpha check this would pass at ΔE 0 despite being visibly half-transparent.
    const out = compareTokens(node({ fill: "#1d4ed8" }), { fill: "#1d4ed880" }, DEFAULT_TOLERANCES);
    expect(out.violations).toHaveLength(1);
    expect(out.violations[0]!.property).toBe("fill");
    expect(out.violations[0]!.delta).toContain("alpha");
  });

  it("rounds numeric deltas so sub-pixel float noise never reaches the output string", () => {
    const out = compareTokens(node({ fontSize: 16 }), { fontSize: 18.6 }, DEFAULT_TOLERANCES);
    expect(out.violations).toHaveLength(1);
    expect(out.violations[0]!.delta).toContain("+2.6");
    expect(out.violations[0]!.delta).not.toMatch(/\d{6,}/); // no "2.6000000000000014" noise
    expect(out.violations[0]!.actual.value).toBe("18.6px");
  });

  it("downgrades a hardcoded (no tokenSources) mismatch to a warn, not an error", () => {
    const out = compareTokens(node({ fill: "#1d4ed8" }), { fill: "#ff0000" }, DEFAULT_TOLERANCES);
    expect(out.violations).toHaveLength(1);
    expect(out.violations[0]!.severity).toBe("warn");
    expect(out.violations[0]!.fixHint).toContain("hardcoded");
  });

  it("keeps a token-bound (has tokenSources) mismatch as a hard error", () => {
    const out = compareTokens(node({ fontSize: 16 }, { fontSize: "size/body" }), { fontSize: 20 }, DEFAULT_TOLERANCES);
    expect(out.violations[0]!.severity).toBe("error");
    expect(out.violations[0]!.fixHint).not.toContain("hardcoded");
  });
});
