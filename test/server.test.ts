// test/server.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runValidation, runExtract } from "../src/server";
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

const figmaFixture = JSON.parse(readFileSync(new URL("fixtures/figma-button-row.json", import.meta.url), "utf8"));
const figmaLink = "https://www.figma.com/design/AbC123/Demo?node-id=1-2";

describe("runExtract", () => {
  it("turns a pasted /nodes response into a validate input that passes against the matching page", async () => {
    const extracted = await runExtract({ nodes: figmaFixture });
    expect(extracted.viewport).toEqual({ width: 400, height: 300 });
    const result = await runValidation({ url: url("page.extract.html"), ...extracted });
    expect(result.violations.filter((v) => v.severity === "error")).toEqual([]);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(100);
  });

  it("refuses to fetch without FIGMA_TOKEN and says how to work around it", async () => {
    await expect(runExtract({ url: figmaLink }, { env: {} })).rejects.toThrow(/FIGMA_TOKEN[\s\S]*nodes/);
  });

  it("fetches by link, resolving variable names when the variables endpoint allows it", async () => {
    const fetchImpl = (async (input: string | URL | Request) => {
      const u = String(input);
      if (u.includes("/variables/local")) {
        return new Response(JSON.stringify({ meta: { variables: { "VariableID:10:1": { name: "color/primary" } } } }), { status: 200 });
      }
      expect(u).toBe("https://api.figma.com/v1/files/AbC123/nodes?ids=1%3A2");
      return new Response(JSON.stringify(figmaFixture), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await runExtract({ url: figmaLink }, { env: { FIGMA_TOKEN: "tok" }, fetchImpl });
    expect(r.design.root.children[0]!.tokenSources).toEqual({ fill: "color/primary" });
  });

  it("falls back to raw variable ids when the variables endpoint is forbidden", async () => {
    const fetchImpl = (async (input: string | URL | Request) =>
      String(input).includes("/variables/local")
        ? new Response("{}", { status: 403 })
        : new Response(JSON.stringify(figmaFixture), { status: 200 })) as unknown as typeof fetch;
    const r = await runExtract({ fileKey: "AbC123", nodeId: "1:2" }, { env: { FIGMA_TOKEN: "tok" }, fetchImpl });
    expect(r.design.root.children[0]!.tokenSources).toEqual({ fill: "VariableID:10:1" });
  });

  it("rejects an input with no source before doing any work", async () => {
    await expect(runExtract({})).rejects.toThrow(/exactly one/);
  });
});
