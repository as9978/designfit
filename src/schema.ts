// src/schema.ts
import { z } from "zod";
import type { DesignNode, Tolerances } from "./types";
import { DEFAULT_TOLERANCES } from "./defaults";

const FrameSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

const TokensSchema = z
  .object({
    fill: z.string(),
    color: z.string(),
    fontFamily: z.string(),
    fontSize: z.number(),
    fontWeight: z.number(),
    lineHeight: z.number(),
    letterSpacing: z.number(),
    borderRadius: z.number(),
    borderColor: z.string(),
    borderWidth: z.number(),
    opacity: z.number(),
  })
  .partial();

const DesignNodeSchema: z.ZodType<DesignNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    frame: FrameSchema,
    tokens: TokensSchema,
    tokenSources: z.record(z.string()).optional(),
    children: z.array(DesignNodeSchema),
  }),
);

const ViewportSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
});

const MapEntrySchema = z.object({
  figmaNodeId: z.string(),
  selector: z.string().optional(),
});

const TolerancesInputSchema = z
  .object({
    geometry: z.object({ position: z.number(), size: z.number() }).partial(),
    color: z.object({ deltaE: z.number() }).partial(),
    fontSize: z.object({ px: z.number() }).partial(),
    lineHeight: z.object({ px: z.number() }).partial(),
    letterSpacing: z.object({ px: z.number() }).partial(),
    borderWidth: z.object({ px: z.number() }).partial(),
    borderRadius: z.object({ px: z.number() }).partial(),
  })
  .partial();

/** Raw Zod shape — passed to MCP registerTool as inputSchema. */
export const toolInputShape = {
  url: z.string().url(),
  viewport: ViewportSchema,
  design: z.object({ root: DesignNodeSchema }),
  componentMap: z.array(MapEntrySchema),
  tolerances: TolerancesInputSchema.optional(),
};

export const ToolInputSchema = z.object(toolInputShape);
export type ToolInput = z.infer<typeof ToolInputSchema>;
export type PartialTolerances = z.infer<typeof TolerancesInputSchema>;

/** Merge user-supplied tolerance overrides onto the defaults. */
export function mergeTolerances(input?: PartialTolerances): Tolerances {
  const d = DEFAULT_TOLERANCES;
  return {
    geometry: {
      position: input?.geometry?.position ?? d.geometry.position,
      size: input?.geometry?.size ?? d.geometry.size,
    },
    color: { deltaE: input?.color?.deltaE ?? d.color.deltaE },
    fontSize: { px: input?.fontSize?.px ?? d.fontSize.px },
    lineHeight: { px: input?.lineHeight?.px ?? d.lineHeight.px },
    letterSpacing: { px: input?.letterSpacing?.px ?? d.letterSpacing.px },
    borderWidth: { px: input?.borderWidth?.px ?? d.borderWidth.px },
    borderRadius: { px: input?.borderRadius?.px ?? d.borderRadius.px },
  };
}
