// test/schema.test.ts
import { describe, it, expect } from "vitest";
import { ToolInputSchema, mergeTolerances } from "../src/schema";
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
