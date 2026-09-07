// test/extract/toSpec.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { paintToHex, nodeTokens, nodeTokenSources, toSpec } from "../../src/extract/toSpec";
import type { FigmaNode, FigmaNodesResponse } from "../../src/extract/figmaTypes";

const fixture: FigmaNodesResponse = JSON.parse(
  readFileSync(new URL("../fixtures/figma-button-row.json", import.meta.url), "utf8"),
);
const root = fixture.nodes["1:2"]!.document;
const styles = fixture.nodes["1:2"]!.styles!;
const byId = (id: string): FigmaNode => {
  const found = root.children!.find((c) => c.id === id);
  if (!found) throw new Error(`fixture has no ${id}`);
  return found;
};

describe("paintToHex", () => {
  it("converts Figma floats to lowercase 6-digit hex", () => {
    expect(paintToHex({ type: "SOLID", color: { r: 0.1137, g: 0.3059, b: 0.8471, a: 1 } })).toBe("#1d4ed8");
  });
  it("emits 8-digit hex when paint opacity or alpha is below 1", () => {
    expect(paintToHex({ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 0.5 })).toBe("#00000080");
    expect(paintToHex({ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 0.5 } })).toBe("#ffffff80");
  });
  it("returns undefined for hidden, non-solid, or colorless paints", () => {
    expect(paintToHex({ type: "SOLID", visible: false, color: { r: 1, g: 0, b: 0, a: 1 } })).toBeUndefined();
    expect(paintToHex({ type: "GRADIENT_LINEAR" })).toBeUndefined();
  });
});

describe("nodeTokens", () => {
  it("maps a rectangle's fill, stroke, and radius", () => {
    expect(nodeTokens(byId("1:3"))).toEqual({
      fill: "#1d4ed8",
      borderRadius: 8,
      borderColor: "#1e40af",
      borderWidth: 1,
    });
  });
  it("maps a text node's fill to color and its style to typography tokens", () => {
    expect(nodeTokens(byId("1:4"))).toEqual({
      color: "#ffffff",
      fontFamily: "Arial",
      fontSize: 16,
      fontWeight: 700,
      lineHeight: 20,
      letterSpacing: 0.5,
    });
  });
  it("skips gradient fills but keeps a non-1 opacity", () => {
    expect(nodeTokens(byId("1:9"))).toEqual({ opacity: 0.5 });
  });
  it("emits nothing for an unpainted frame", () => {
    expect(nodeTokens(byId("1:5"))).toEqual({});
  });
  it("uses the top-left radius when corners differ", () => {
    expect(nodeTokens({ id: "x", name: "x", type: "RECTANGLE", rectangleCornerRadii: [4, 8, 8, 4] })).toEqual({ borderRadius: 4 });
  });
  it("drops a stroke with zero weight", () => {
    const n: FigmaNode = { ...byId("1:3"), strokeWeight: 0 };
    expect(nodeTokens(n)).toEqual({ fill: "#1d4ed8", borderRadius: 8 });
  });
});

describe("nodeTokenSources", () => {
  it("uses the raw VariableID when no name map is given", () => {
    const n = byId("1:3");
    expect(nodeTokenSources(n, nodeTokens(n), styles, {})).toEqual({ fill: "VariableID:10:1" });
  });
  it("resolves a bound variable to its name", () => {
    const n = byId("1:3");
    expect(nodeTokenSources(n, nodeTokens(n), styles, { "VariableID:10:1": "color/primary" })).toEqual({ fill: "color/primary" });
  });
  it("binds every typography token to a text style's name", () => {
    const n = byId("1:4");
    expect(nodeTokenSources(n, nodeTokens(n), styles, {})).toEqual({
      fontFamily: "text/button",
      fontSize: "text/button",
      fontWeight: "text/button",
      lineHeight: "text/button",
      letterSpacing: "text/button",
    });
  });
  it("lets a bound variable win over a style for the same property", () => {
    const n: FigmaNode = { ...byId("1:3"), styles: { fill: "S:fill" } };
    const s = { ...styles, "S:fill": { key: "f", name: "legacy/fill", styleType: "FILL" } };
    expect(nodeTokenSources(n, nodeTokens(n), s, { "VariableID:10:1": "color/primary" })!.fill).toBe("color/primary");
  });
  it("maps a text node's fill style to color, and drops sources for tokens that were not emitted", () => {
    const n: FigmaNode = { ...byId("1:4"), fills: [], styles: { fill: "S:fill", text: "S:abc" } };
    const s = { ...styles, "S:fill": { key: "f", name: "text/on-primary", styleType: "FILL" } };
    const out = nodeTokenSources(n, nodeTokens(n), s, {})!;
    expect(out.color).toBeUndefined(); // no fill => no color token => no source
    expect(out.fontSize).toBe("text/button");
  });
  it("returns undefined when nothing is bound", () => {
    const n = byId("1:5");
    expect(nodeTokenSources(n, nodeTokens(n), styles, {})).toBeUndefined();
  });
});

describe("toSpec", () => {
  it("emits visible, non-vector nodes in document order and one map entry each", () => {
    const r = toSpec(fixture, "1:2");
    expect(r.componentMap.map((e) => e.figmaNodeId)).toEqual(["1:2", "1:3", "1:4", "1:5", "1:9"]);
    expect(r.design.root.children.map((c) => c.id)).toEqual(["1:3", "1:4", "1:5", "1:9"]);
  });
  it("sets viewport from the root box and keeps absolute frames", () => {
    const r = toSpec(fixture, "1:2");
    expect(r.viewport).toEqual({ width: 400, height: 300 });
    expect(r.design.root.frame).toEqual({ x: 100, y: 200, w: 400, h: 300 });
    expect(r.design.root.children[0]!.frame).toEqual({ x: 124, y: 224, w: 120, h: 40 });
  });
  it("treats a frame whose children are all vectors as a leaf", () => {
    const icon = toSpec(fixture, "1:2").design.root.children.find((c) => c.id === "1:5")!;
    expect(icon.children).toEqual([]);
    expect(icon.tokens).toEqual({});
  });
  it("skips hidden nodes and their subtrees", () => {
    const ids = toSpec(fixture, "1:2").componentMap.map((e) => e.figmaNodeId);
    expect(ids).not.toContain("1:8");
  });
  it("skips nodes without a bounding box", () => {
    const res: FigmaNodesResponse = JSON.parse(JSON.stringify(fixture));
    res.nodes["1:2"]!.document.children![0]!.absoluteBoundingBox = null;
    expect(toSpec(res, "1:2").componentMap.map((e) => e.figmaNodeId)).not.toContain("1:3");
  });
  it("honors maxDepth (0 = root only)", () => {
    const r = toSpec(fixture, "1:2", { maxDepth: 0 });
    expect(r.componentMap).toEqual([{ figmaNodeId: "1:2" }]);
    expect(r.design.root.children).toEqual([]);
  });
  it("attaches tokenSources only where something is bound, resolving names when given", () => {
    const r = toSpec(fixture, "1:2", { variableNames: { "VariableID:10:1": "color/primary" } });
    const [btn, label, icon] = r.design.root.children;
    expect(btn!.tokenSources).toEqual({ fill: "color/primary" });
    expect(label!.tokenSources?.fontSize).toBe("text/button");
    expect(icon!.tokenSources).toBeUndefined();
    expect(r.design.root.tokenSources).toBeUndefined();
  });
  it("defaults to the first node in the response when nodeId is omitted", () => {
    expect(toSpec(fixture, undefined).design.root.id).toBe("1:2");
  });
  it("names the available ids when the requested node is missing", () => {
    expect(() => toSpec(fixture, "9:9")).toThrow(/9:9.*available: 1:2/);
  });
  it("rejects a hidden root", () => {
    const res: FigmaNodesResponse = JSON.parse(JSON.stringify(fixture));
    res.nodes["1:2"]!.document.visible = false;
    expect(() => toSpec(res, "1:2")).toThrow(/hidden or has no bounding box/);
  });
});
