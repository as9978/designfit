// test/measure.test.ts
import { describe, it, expect } from "vitest";
import { measure } from "../src/measure";

// new URL(...).href yields a valid file:// URL on every platform
// (file:///C:/... on Windows, file:///... on POSIX) — Playwright accepts both.
const fileUrl = (name: string) => new URL(`fixtures/${name}`, import.meta.url).href;

describe("measure (Playwright)", () => {
  it("reads box and normalized styles for tagged elements", async () => {
    const result = await measure(fileUrl("page.perfect.html"), { width: 400, height: 300 }, [
      { figmaNodeId: "root" },
      { figmaNodeId: "btn" },
    ]);

    const btn = result.measurements.find((m) => m.figmaNodeId === "btn")!;
    expect(btn.found).toBe(true);
    expect(btn.box).toMatchObject({ x: 24, y: 24, w: 120, h: 40 });
    expect(btn.styles?.fill).toBe("#1d4ed8");
    expect(btn.styles?.fontSize).toBe(16);
    expect(btn.styles?.borderRadius).toBe(8);
    expect(result.domIds.sort()).toEqual(["btn", "root"]);
  });

  it("marks a selector with no match as not found", async () => {
    const result = await measure(fileUrl("page.perfect.html"), { width: 400, height: 300 }, [
      { figmaNodeId: "ghost" },
    ]);
    expect(result.measurements[0]!.found).toBe(false);
  });
});
