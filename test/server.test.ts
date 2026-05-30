// test/server.test.ts
import { describe, it, expect } from "vitest";
import { runValidation } from "../src/server";
import type { ToolInput } from "../src/schema";

// new URL(...).href yields a valid file:// URL on every platform.
const url = (name: string) => new URL(`fixtures/${name}`, import.meta.url).href;

const baseInput = (page: string): ToolInput => ({
  url: url(page),
  viewport: { width: 400, height: 300 },
  design: {
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
          tokens: { fill: "#1d4ed8", fontSize: 16, borderRadius: 8 },
          tokenSources: { fill: "color/primary" },
          children: [],
        },
      ],
    },
  },
  componentMap: [{ figmaNodeId: "root" }, { figmaNodeId: "btn" }],
});

describe("runValidation (end-to-end against a real page)", () => {
  it("passes with score 100 on the matching page", async () => {
    const result = await runValidation(baseInput("page.perfect.html"));
    expect(result.pass).toBe(true);
    expect(result.score).toBe(100);
  });

  it("fails with token + geometry violations on the off page", async () => {
    const result = await runValidation(baseInput("page.off.html"));
    expect(result.pass).toBe(false);
    expect(result.violations.some((v) => v.check === "token" && v.property === "fill")).toBe(true);
    expect(result.violations.some((v) => v.check === "geometry" && v.property === "width")).toBe(true);
  });
});
