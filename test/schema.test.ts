// test/schema.test.ts
import { describe, it, expect } from "vitest";
import { ToolInputSchema, mergeTolerances, ExtractInputSchema } from "../src/schema";
import { DEFAULT_TOLERANCES } from "../src/defaults";

const validInput = {
  url: "http://localhost:5173/",
  viewport: { width: 1440, height: 900 },
  design: { root: { id: "root", name: "Screen", frame: { x: 0, y: 0, w: 1440, h: 900 }, tokens: {}, children: [] } },
  componentMap: [{ figmaNodeId: "root" }],
};

describe("ToolInputSchema", () => {
  it("accepts a valid input", () => {
    expect(() => ToolInputSchema.parse(validInput)).not.toThrow();
  });
  it("rejects a non-URL url", () => {
    expect(() => ToolInputSchema.parse({ ...validInput, url: "not a url" })).toThrow();
  });
  it("rejects a non-positive viewport", () => {
    expect(() => ToolInputSchema.parse({ ...validInput, viewport: { width: 0, height: 900 } })).toThrow();
  });
  it("rejects a malformed design-token color at the boundary", () => {
    const bad = {
      ...validInput,
      design: {
        root: { id: "root", name: "Screen", frame: { x: 0, y: 0, w: 1440, h: 900 }, tokens: { fill: "blurple" }, children: [] },
      },
    };
    expect(() => ToolInputSchema.parse(bad)).toThrow();
  });
  it("rejects an empty tokenSources entry at the boundary", () => {
    const bad = {
      ...validInput,
      design: {
        root: { id: "root", name: "Screen", frame: { x: 0, y: 0, w: 1440, h: 900 }, tokens: { fill: "#1d4ed8" }, tokenSources: { fill: "" }, children: [] },
      },
    };
    expect(() => ToolInputSchema.parse(bad)).toThrow();
  });
});

describe("mergeTolerances", () => {
  it("returns defaults when nothing is provided", () => {
    expect(mergeTolerances(undefined)).toEqual(DEFAULT_TOLERANCES);
  });
  it("overrides only the provided fields", () => {
    const merged = mergeTolerances({ geometry: { position: 5 } });
    expect(merged.geometry.position).toBe(5);
    expect(merged.geometry.size).toBe(DEFAULT_TOLERANCES.geometry.size);
    expect(merged.color.deltaE).toBe(DEFAULT_TOLERANCES.color.deltaE);
  });
});

describe("ExtractInputSchema", () => {
  const link = "https://www.figma.com/design/AbC123/Demo?node-id=1-2";
  it("accepts exactly one source: url", () => {
    expect(() => ExtractInputSchema.parse({ url: link })).not.toThrow();
  });
  it("accepts fileKey + nodeId", () => {
    expect(() => ExtractInputSchema.parse({ fileKey: "AbC123", nodeId: "1:2", maxDepth: 2 })).not.toThrow();
  });
  it("accepts a pasted nodes response", () => {
    expect(() => ExtractInputSchema.parse({ nodes: { nodes: {} } })).not.toThrow();
  });
  it("rejects no source", () => {
    expect(() => ExtractInputSchema.parse({})).toThrow(/exactly one/);
  });
  it("rejects two sources", () => {
    expect(() => ExtractInputSchema.parse({ url: link, fileKey: "AbC123", nodeId: "1:2" })).toThrow(/exactly one/);
  });
  it("rejects fileKey without nodeId", () => {
    expect(() => ExtractInputSchema.parse({ fileKey: "AbC123" })).toThrow(/nodeId/);
  });
  it("rejects a negative or fractional maxDepth", () => {
    expect(() => ExtractInputSchema.parse({ url: link, maxDepth: -1 })).toThrow();
    expect(() => ExtractInputSchema.parse({ url: link, maxDepth: 1.5 })).toThrow();
  });
});
