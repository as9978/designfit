// src/extract/toSpec.ts
import type { DesignNode, DesignTokens, MapEntry, TokenProperty, Viewport } from "../types";
import type { FigmaNode, FigmaNodesResponse, FigmaPaint, FigmaStyleMeta } from "./figmaTypes";

const to255 = (c: number) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0");

/** Figma {r,g,b,a} floats (times the paint's own opacity) to #rrggbb, or #rrggbbaa when alpha < 1. */
export function paintToHex(paint: FigmaPaint): string | undefined {
  if (paint.type !== "SOLID" || paint.visible === false || !paint.color) return undefined;
  const { r, g, b, a } = paint.color;
  const alpha = a * (paint.opacity ?? 1);
  const rgb = `#${to255(r)}${to255(g)}${to255(b)}`;
  return alpha < 1 ? `${rgb}${to255(alpha)}` : rgb;
}

function firstSolid(paints: FigmaPaint[] | undefined): FigmaPaint | undefined {
  return paints?.find((p) => p.type === "SOLID" && p.visible !== false);
}

/** Only the properties the node actually specifies are emitted; absent => not checked. */
export function nodeTokens(node: FigmaNode): DesignTokens {
  const t: DesignTokens = {};
  const fill = firstSolid(node.fills);
  const fillHex = fill && paintToHex(fill);
  if (fillHex) {
    // A text node's "fill" is its text color; a box's fill is its background.
    if (node.type === "TEXT") t.color = fillHex;
    else t.fill = fillHex;
  }
  if (node.type === "TEXT" && node.style) {
    const s = node.style;
    if (s.fontFamily !== undefined) t.fontFamily = s.fontFamily;
    if (s.fontSize !== undefined) t.fontSize = s.fontSize;
    if (s.fontWeight !== undefined) t.fontWeight = s.fontWeight;
    if (s.lineHeightPx !== undefined) t.lineHeight = s.lineHeightPx;
    if (s.letterSpacing !== undefined) t.letterSpacing = s.letterSpacing;
  }
  // Top-left only: that is the corner `measure` reads (borderTopLeftRadius).
  const radius = node.cornerRadius ?? node.rectangleCornerRadii?.[0];
  if (radius !== undefined) t.borderRadius = radius;
  const stroke = firstSolid(node.strokes);
  const strokeHex = stroke && paintToHex(stroke);
  if (strokeHex && node.strokeWeight !== undefined && node.strokeWeight > 0) {
    t.borderColor = strokeHex;
    t.borderWidth = node.strokeWeight;
  }
  if (node.opacity !== undefined && node.opacity !== 1) t.opacity = node.opacity;
  return t;
}

const TEXT_STYLE_PROPS: TokenProperty[] = ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing"];

/** Figma `boundVariables` key -> designfit token property. `fills` is remapped to `color` on TEXT nodes. */
const VARIABLE_KEYS: Record<string, TokenProperty> = {
  fills: "fill",
  strokes: "borderColor",
  strokeWeight: "borderWidth",
  cornerRadius: "borderRadius",
  topLeftRadius: "borderRadius",
  opacity: "opacity",
  fontFamily: "fontFamily",
  fontSize: "fontSize",
  fontWeight: "fontWeight",
  lineHeight: "lineHeight",
  letterSpacing: "letterSpacing",
};

/**
 * Which token properties are bound to a named design decision. Published styles resolve
 * through the `styles` map that ships in the /nodes response; bound variables resolve
 * through `variableNames` (from /variables/local, Enterprise-only) and otherwise keep
 * their raw VariableID. Variables win over styles. Only emitted tokens keep a source.
 */
export function nodeTokenSources(
  node: FigmaNode,
  tokens: DesignTokens,
  styles: Record<string, FigmaStyleMeta>,
  variableNames: Record<string, string>,
): Partial<Record<TokenProperty, string>> | undefined {
  const out: Partial<Record<TokenProperty, string>> = {};
  const paintProp: TokenProperty = node.type === "TEXT" ? "color" : "fill";
  const styleName = (id: string | undefined) => (id ? styles[id]?.name : undefined);

  const fillStyle = styleName(node.styles?.fill);
  if (fillStyle) out[paintProp] = fillStyle;
  const strokeStyle = styleName(node.styles?.stroke);
  if (strokeStyle) out.borderColor = strokeStyle;
  const textStyle = styleName(node.styles?.text);
  if (textStyle) for (const p of TEXT_STYLE_PROPS) out[p] = textStyle;

  const name = (id: string) => variableNames[id] ?? id;
  for (const [key, prop] of Object.entries(VARIABLE_KEYS)) {
    const bound = node.boundVariables?.[key];
    const alias = Array.isArray(bound) ? bound[0] : bound;
    if (alias?.id) out[key === "fills" ? paintProp : prop] = name(alias.id);
  }
  // Figma also nests the alias on the paint itself; honor either placement.
  const fillAlias = firstSolid(node.fills)?.boundVariables?.color;
  if (fillAlias?.id) out[paintProp] = name(fillAlias.id);
  const strokeAlias = firstSolid(node.strokes)?.boundVariables?.color;
  if (strokeAlias?.id) out.borderColor = name(strokeAlias.id);

  for (const p of Object.keys(out) as TokenProperty[]) if (tokens[p] === undefined) delete out[p];
  return Object.keys(out).length ? out : undefined;
}

export interface ExtractResult {
  design: { root: DesignNode };
  componentMap: MapEntry[];
  viewport: Viewport;
}

export interface ToSpecOptions {
  /** Levels below the root to emit. undefined = unlimited, 0 = root only. */
  maxDepth?: number;
  /** VariableID -> variable name (from /variables/local). Unresolved ids stay raw. */
  variableNames?: Record<string, string>;
}

/** When ALL of a node's children have one of these types, the node is an icon: emit it, don't descend. */
const VECTOR_TYPES = new Set(["VECTOR", "BOOLEAN_OPERATION", "LINE", "STAR", "REGULAR_POLYGON"]);

function isIconLeaf(node: FigmaNode): boolean {
  return !!node.children && node.children.length > 0 && node.children.every((c) => VECTOR_TYPES.has(c.type));
}

function walk(
  node: FigmaNode,
  depth: number,
  opts: ToSpecOptions,
  styles: Record<string, FigmaStyleMeta>,
  map: MapEntry[],
): DesignNode | undefined {
  if (node.visible === false || !node.absoluteBoundingBox) return undefined;
  const b = node.absoluteBoundingBox;
  const tokens = nodeTokens(node);
  const tokenSources = nodeTokenSources(node, tokens, styles, opts.variableNames ?? {});
  map.push({ figmaNodeId: node.id });

  const descend = !isIconLeaf(node) && (opts.maxDepth === undefined || depth < opts.maxDepth);
  const children: DesignNode[] = [];
  if (descend) {
    for (const c of node.children ?? []) {
      const d = walk(c, depth + 1, opts, styles, map);
      if (d) children.push(d);
    }
  }
  return {
    id: node.id,
    name: node.name,
    frame: { x: b.x, y: b.y, w: b.width, h: b.height },
    tokens,
    ...(tokenSources ? { tokenSources } : {}),
    children,
  };
}

/**
 * Turn a Figma REST /nodes response into a ready designfit_validate input (minus `url`).
 * Deterministic: no network, no heuristics beyond the documented filter rules.
 */
export function toSpec(response: FigmaNodesResponse, nodeId: string | undefined, opts: ToSpecOptions = {}): ExtractResult {
  const ids = Object.keys(response.nodes ?? {});
  const key = nodeId ?? ids[0];
  const entry = key ? response.nodes[key] : undefined;
  if (!entry) {
    throw new Error(`node ${nodeId ?? "(none)"} not in response; available: ${ids.join(", ") || "none"}`);
  }
  const map: MapEntry[] = [];
  const root = walk(entry.document, 0, opts, entry.styles ?? {}, map);
  if (!root) throw new Error(`root node ${entry.document.id} is hidden or has no bounding box`);
  return {
    design: { root },
    componentMap: map,
    viewport: { width: Math.round(root.frame.w), height: Math.round(root.frame.h) },
  };
}
