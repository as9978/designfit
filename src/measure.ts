// src/measure.ts
import { chromium } from "playwright";
import type { MapEntry, MeasureResult, Measurement, RawComputed, Viewport } from "./types";
import { normalizeStyles } from "./normalize";

interface RawMeasurement {
  figmaNodeId: string;
  found: boolean;
  box?: { x: number; y: number; w: number; h: number };
  rawStyles?: RawComputed;
}

export interface MeasureOptions {
  timeoutMs?: number;
}

export async function measure(
  url: string,
  viewport: Viewport,
  componentMap: MapEntry[],
  opts: MeasureOptions = {},
): Promise<MeasureResult> {
  const timeout = opts.timeoutMs ?? 15000;
  const selectors = componentMap.map((e) => ({
    id: e.figmaNodeId,
    selector: e.selector ?? `[data-plumb-id="${e.figmaNodeId}"]`,
  }));

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    // "load" (not "networkidle") so live dev servers with a persistent HMR/SSE
    // connection don't keep a request in-flight forever and time out.
    await page.goto(url, { waitUntil: "load", timeout });
    // Wait for web fonts so text-driven box geometry is stable. Bounded so a
    // never-settling font load can't hang the measurement; a no-op on font-less pages.
    await page
      .evaluate(
        () =>
          Promise.race([
            document.fonts ? document.fonts.ready : Promise.resolve(),
            new Promise((resolve) => setTimeout(resolve, 2000)),
          ]).then(() => true),
      )
      .catch(() => undefined);

    const raw = await page.evaluate((sels) => {
      const read = (el: Element) => {
        const cs = getComputedStyle(el as HTMLElement);
        const r = el.getBoundingClientRect();
        return {
          box: { x: r.x, y: r.y, w: r.width, h: r.height },
          rawStyles: {
            backgroundColor: cs.backgroundColor,
            color: cs.color,
            fontFamily: cs.fontFamily,
            fontSize: cs.fontSize,
            fontWeight: cs.fontWeight,
            lineHeight: cs.lineHeight,
            letterSpacing: cs.letterSpacing,
            borderTopLeftRadius: cs.borderTopLeftRadius,
            borderTopColor: cs.borderTopColor,
            borderTopWidth: cs.borderTopWidth,
            opacity: cs.opacity,
          },
        };
      };

      const measurements = sels.map((s) => {
        const el = document.querySelector(s.selector);
        if (!el) return { figmaNodeId: s.id, found: false };
        const m = read(el);
        return { figmaNodeId: s.id, found: true, box: m.box, rawStyles: m.rawStyles };
      });

      const domIds = Array.from(document.querySelectorAll("[data-plumb-id]"))
        .map((el) => el.getAttribute("data-plumb-id"))
        .filter((v): v is string => v !== null);

      return { measurements, domIds };
    }, selectors);

    const measurements: Measurement[] = (raw.measurements as RawMeasurement[]).map((m) =>
      m.found && m.box && m.rawStyles
        ? { figmaNodeId: m.figmaNodeId, found: true, box: m.box, styles: normalizeStyles(m.rawStyles) }
        : { figmaNodeId: m.figmaNodeId, found: false },
    );

    return { measurements, domIds: raw.domIds };
  } finally {
    await browser.close();
  }
}
