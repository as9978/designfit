// test/compare/geometry.test.ts
import { describe, it, expect } from "vitest";
import { compareGeometry } from "../../src/compare/geometry";
import { DEFAULT_TOLERANCES } from "../../src/defaults";
import type { DesignNode, Measurement } from "../../src/types";

const dn = (id: string, frame: DesignNode["frame"]): DesignNode => ({
  id,
  name: id,
  frame,
  tokens: {},
  children: [],
});

const meas = (id: string, box: Measurement["box"]): Measurement => ({
  figmaNodeId: id,
  found: true,
  box,
});

function maps(nodes: DesignNode[], measurements: Measurement[]) {
  return {
    designById: new Map(nodes.map((n) => [n.id, n])),
    measById: new Map(measurements.map((m) => [m.figmaNodeId, m])),
  };
}

describe("compareGeometry", () => {
  it("passes when relative layout matches within tolerance", () => {
    const nodes = [dn("root", { x: 0, y: 0, w: 400, h: 300 }), dn("a", { x: 24, y: 24, w: 100, h: 40 })];
    // impl root is offset in the viewport, but child offset relative to root matches
    const measurements = [meas("root", { x: 50, y: 50, w: 400, h: 300 }), meas("a", { x: 74, y: 74, w: 100, h: 40 })];
    const { designById, measById } = maps(nodes, measurements);
    const out = compareGeometry(designById, measById, "root", DEFAULT_TOLERANCES);
    expect(out.violations).toEqual([]);
    expect(out.checks).toBe(6); // 2 root size + 4 child dims
  });

  it("flags a child that is too wide", () => {
    const nodes = [dn("root", { x: 0, y: 0, w: 400, h: 300 }), dn("a", { x: 24, y: 24, w: 100, h: 40 })];
    const measurements = [meas("root", { x: 0, y: 0, w: 400, h: 300 }), meas("a", { x: 24, y: 24, w: 160, h: 40 })];
    const { designById, measById } = maps(nodes, measurements);
    const out = compareGeometry(designById, measById, "root", DEFAULT_TOLERANCES);
    const widths = out.violations.filter((v) => v.property === "width");
    expect(widths).toHaveLength(1);
    expect(widths[0]!.check).toBe("geometry");
    expect(widths[0]!.delta).toContain("+60");
  });

  it("flags a misplaced child via relative position", () => {
    const nodes = [dn("root", { x: 0, y: 0, w: 400, h: 300 }), dn("a", { x: 24, y: 24, w: 100, h: 40 })];
    const measurements = [meas("root", { x: 0, y: 0, w: 400, h: 300 }), meas("a", { x: 90, y: 24, w: 100, h: 40 })];
    const { designById, measById } = maps(nodes, measurements);
    const out = compareGeometry(designById, measById, "root", DEFAULT_TOLERANCES);
    const xs = out.violations.filter((v) => v.property === "x");
    expect(xs).toHaveLength(1);
    expect(xs[0]!.delta).toContain("+66");
  });

  it("flags a wrong root size", () => {
    const nodes = [dn("root", { x: 0, y: 0, w: 400, h: 300 })];
    const measurements = [meas("root", { x: 0, y: 0, w: 360, h: 300 })];
    const { designById, measById } = maps(nodes, measurements);
    const out = compareGeometry(designById, measById, "root", DEFAULT_TOLERANCES);
    expect(out.violations.filter((v) => v.property === "width")).toHaveLength(1);
  });

  it("returns no violations and no checks when the root box is missing", () => {
    const nodes = [dn("root", { x: 0, y: 0, w: 400, h: 300 })];
    const measurements: Measurement[] = [{ figmaNodeId: "root", found: false }];
    const { designById, measById } = maps(nodes, measurements);
    const out = compareGeometry(designById, measById, "root", DEFAULT_TOLERANCES);
    expect(out).toEqual({ violations: [], checks: 0 });
  });
});
