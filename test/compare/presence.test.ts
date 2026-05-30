// test/compare/presence.test.ts
import { describe, it, expect } from "vitest";
import { checkPresence } from "../../src/compare/presence";
import type { DesignNode, MapEntry, Measurement } from "../../src/types";

const designById = new Map<string, DesignNode>([
  ["a", { id: "a", name: "Card", frame: { x: 0, y: 0, w: 10, h: 10 }, tokens: {}, children: [] }],
  ["b", { id: "b", name: "Button", frame: { x: 0, y: 0, w: 10, h: 10 }, tokens: {}, children: [] }],
]);

describe("checkPresence", () => {
  it("reports a mapped component that was not found as a missing error", () => {
    const map: MapEntry[] = [{ figmaNodeId: "a" }, { figmaNodeId: "b" }];
    const measurements: Measurement[] = [
      { figmaNodeId: "a", found: true, box: { x: 0, y: 0, w: 10, h: 10 } },
      { figmaNodeId: "b", found: false },
    ];
    const out = checkPresence(map, measurements, ["a"], designById);
    const missing = out.violations.filter((v) => v.property === "exists");
    expect(missing).toHaveLength(1);
    expect(missing[0]!.component).toContain("Button#b");
    expect(missing[0]!.severity).toBe("error");
    expect(out.unmapped.inDesignNotFound).toEqual(["b"]);
    expect(out.checks).toBe(2);
  });

  it("reports an extra tagged DOM element as a warning", () => {
    const map: MapEntry[] = [{ figmaNodeId: "a" }];
    const measurements: Measurement[] = [{ figmaNodeId: "a", found: true, box: { x: 0, y: 0, w: 10, h: 10 } }];
    const out = checkPresence(map, measurements, ["a", "ghost"], designById);
    const extra = out.violations.filter((v) => v.property === "unexpected");
    expect(extra).toHaveLength(1);
    expect(extra[0]!.severity).toBe("warn");
    expect(out.unmapped.inDomNotMapped).toEqual(["ghost"]);
  });
});
