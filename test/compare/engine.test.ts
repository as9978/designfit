// test/compare/engine.test.ts
import { describe, it, expect } from "vitest";
import { flattenDesign, validate } from "../../src/compare/engine";
import { DEFAULT_TOLERANCES } from "../../src/defaults";
import type { DesignSpec, MapEntry, MeasureResult } from "../../src/types";

const spec: DesignSpec = {
  root: {
    id: "root",
    name: "Screen",
    frame: { x: 0, y: 0, w: 400, h: 300 },
    tokens: {},
    children: [
      {
        id: "btn",
        name: "Button/Primary",
        frame: { x: 24, y: 24, w: 120, h: 40 },
        tokens: { fill: "#1d4ed8", fontSize: 16 },
        tokenSources: { fill: "color/primary" },
        children: [],
      },
    ],
  },
};

const map: MapEntry[] = [{ figmaNodeId: "root" }, { figmaNodeId: "btn" }];

describe("flattenDesign", () => {
  it("indexes every node by id", () => {
    const byId = flattenDesign(spec);
    expect([...byId.keys()].sort()).toEqual(["btn", "root"]);
  });
});

describe("validate", () => {
  it("passes with score 100 when the implementation matches", () => {
    const measure: MeasureResult = {
      measurements: [
        { figmaNodeId: "root", found: true, box: { x: 0, y: 0, w: 400, h: 300 }, styles: {} },
        { figmaNodeId: "btn", found: true, box: { x: 24, y: 24, w: 120, h: 40 }, styles: { fill: "#1d4ed8", fontSize: 16 } },
      ],
      domIds: ["root", "btn"],
    };
    const result = validate(spec, measure, map, { width: 400, height: 300 }, DEFAULT_TOLERANCES);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(100);
    expect(result.violations).toEqual([]);
  });

  it("collects token, geometry, and presence violations together and drops the score", () => {
    const measure: MeasureResult = {
      measurements: [
        { figmaNodeId: "root", found: true, box: { x: 0, y: 0, w: 400, h: 300 }, styles: {} },
        { figmaNodeId: "btn", found: true, box: { x: 24, y: 24, w: 200, h: 40 }, styles: { fill: "#ff0000", fontSize: 16 } },
      ],
      domIds: ["root", "btn"],
    };
    const result = validate(spec, measure, map, { width: 400, height: 300 }, DEFAULT_TOLERANCES);
    expect(result.pass).toBe(false);
    expect(result.violations.some((v) => v.check === "token" && v.property === "fill")).toBe(true);
    expect(result.violations.some((v) => v.check === "geometry" && v.property === "width")).toBe(true);
    expect(result.score).toBeLessThan(100);
  });

  it("reports a missing component and still returns a result", () => {
    const measure: MeasureResult = {
      measurements: [
        { figmaNodeId: "root", found: true, box: { x: 0, y: 0, w: 400, h: 300 }, styles: {} },
        { figmaNodeId: "btn", found: false },
      ],
      domIds: ["root"],
    };
    const result = validate(spec, measure, map, { width: 400, height: 300 }, DEFAULT_TOLERANCES);
    expect(result.pass).toBe(false);
    expect(result.unmapped.inDesignNotFound).toEqual(["btn"]);
    expect(result.violations.some((v) => v.property === "exists")).toBe(true);
  });

  it("does not fail the run for hardcoded (non-token) mismatches — they are warns", () => {
    const hardcodedSpec: DesignSpec = {
      root: {
        id: "root",
        name: "Screen",
        frame: { x: 0, y: 0, w: 400, h: 300 },
        tokens: {},
        children: [
          // fill is declared but NOT in tokenSources -> a hardcoded literal.
          { id: "btn", name: "Button", frame: { x: 24, y: 24, w: 120, h: 40 }, tokens: { fill: "#1d4ed8" }, children: [] },
        ],
      },
    };
    const measure: MeasureResult = {
      measurements: [
        { figmaNodeId: "root", found: true, box: { x: 0, y: 0, w: 400, h: 300 }, styles: {} },
        { figmaNodeId: "btn", found: true, box: { x: 24, y: 24, w: 120, h: 40 }, styles: { fill: "#ff0000" } },
      ],
      domIds: ["root", "btn"],
    };
    const result = validate(hardcodedSpec, measure, [{ figmaNodeId: "root" }, { figmaNodeId: "btn" }], { width: 400, height: 300 }, DEFAULT_TOLERANCES);
    expect(result.violations.some((v) => v.check === "token" && v.severity === "warn")).toBe(true);
    expect(result.violations.every((v) => v.severity !== "error")).toBe(true);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(100);
  });

  it("hardcoded token mismatches are score-neutral — they neither raise nor lower the score", () => {
    // Same measurements; two specs differing only in extra HARDCODED (no-tokenSources)
    // properties that all mismatch. The score must be identical (hardcoded checks are
    // skipped from scoring) — adding broken hardcoded props can't pad the denominator.
    const measure: MeasureResult = {
      measurements: [
        { figmaNodeId: "root", found: true, box: { x: 0, y: 0, w: 400, h: 300 }, styles: {} },
        { figmaNodeId: "btn", found: true, box: { x: 24, y: 24, w: 120, h: 40 }, styles: { fill: "#ff0000", fontSize: 99 } },
      ],
      domIds: ["root", "btn"],
    };
    const map: MapEntry[] = [{ figmaNodeId: "root" }, { figmaNodeId: "btn" }];
    const withHardcoded: DesignSpec = {
      root: {
        id: "root", name: "Screen", frame: { x: 0, y: 0, w: 400, h: 300 }, tokens: {},
        children: [{ id: "btn", name: "Button", frame: { x: 24, y: 24, w: 120, h: 40 }, tokens: { fill: "#1d4ed8", fontSize: 16 }, children: [] }],
      },
    };
    const noTokens: DesignSpec = {
      root: {
        id: "root", name: "Screen", frame: { x: 0, y: 0, w: 400, h: 300 }, tokens: {},
        children: [{ id: "btn", name: "Button", frame: { x: 24, y: 24, w: 120, h: 40 }, tokens: {}, children: [] }],
      },
    };
    const a = validate(withHardcoded, measure, map, { width: 400, height: 300 }, DEFAULT_TOLERANCES);
    const b = validate(noTokens, measure, map, { width: 400, height: 300 }, DEFAULT_TOLERANCES);
    expect(a.score).toBe(b.score);
    expect(a.score).toBe(100); // geometry + presence all pass; the two hardcoded mismatches don't move it
    expect(a.pass).toBe(true);
    expect(a.violations.filter((v) => v.severity === "warn").length).toBe(2); // both surface as advisories
  });

  it("de-duplicates repeated componentMap entries so checks/violations aren't double-counted", () => {
    const measure: MeasureResult = {
      measurements: [
        { figmaNodeId: "root", found: true, box: { x: 0, y: 0, w: 400, h: 300 }, styles: {} },
        { figmaNodeId: "btn", found: true, box: { x: 24, y: 24, w: 120, h: 40 }, styles: { fill: "#ff0000", fontSize: 16 } },
      ],
      domIds: ["root", "btn"],
    };
    const dupMap: MapEntry[] = [{ figmaNodeId: "root" }, { figmaNodeId: "btn" }, { figmaNodeId: "btn" }];
    const result = validate(spec, measure, dupMap, { width: 400, height: 300 }, DEFAULT_TOLERANCES);
    const fillViolations = result.violations.filter((v) => v.check === "token" && v.property === "fill");
    expect(fillViolations).toHaveLength(1);
  });

  it("is deterministic — identical input yields byte-identical output (anti-oscillation guarantee)", () => {
    const measure: MeasureResult = {
      measurements: [
        { figmaNodeId: "root", found: true, box: { x: 0, y: 0, w: 400, h: 300 }, styles: {} },
        { figmaNodeId: "btn", found: true, box: { x: 24, y: 24, w: 200, h: 40 }, styles: { fill: "#ff0000", fontSize: 16 } },
      ],
      domIds: ["root", "btn"],
    };
    const a = validate(spec, measure, map, { width: 400, height: 300 }, DEFAULT_TOLERANCES);
    const b = validate(spec, measure, map, { width: 400, height: 300 }, DEFAULT_TOLERANCES);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
