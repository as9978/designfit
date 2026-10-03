// src/extract/toSpec.ts
import type { DesignNode, DesignTokens, MapEntry, TokenProperty, Viewport } from "../types";
import type { FigmaNode, FigmaNodesResponse, FigmaPaint, FigmaStyleMeta, FigmaTypeStyle, FigmaVariableAlias } from "./figmaTypes";
import { rgbaToHex } from "../color";

/**
 * Figma {r,g,b,a} floats (times the paint's own opacity) to #rrggbb, or #rrggbbaa when alpha < 1.
 * A fully transparent paint is no paint: the browser reports it as no value.
 */
export function paintToHex(paint: FigmaPaint): string | undefined {
  if (paint.type !== "SOLID" || paint.visible === false || !paint.color) return undefined;
  const { r, g, b, a } = paint.color;
  return rgbaToHex(r, g, b, a * (paint.opacity ?? 1));
}

type BoundValue = NonNullable<FigmaNode["boundVariables"]>[string];

interface PickedPaint {
  hex: string;
  alias?: FigmaVariableAlias;
}

/**
 * The paint a node renders as a CSS color: the top-most visible solid (Figma orders paints
 * bottom to top), with its variable alias from either place Figma puts it.
 */
function topSolid(paints: FigmaPaint[] | undefined, bound: BoundValue): PickedPaint | undefined {
  for (let i = (paints?.length ?? 0) - 1; i >= 0; i--) {
    const paint = paints![i]!;
    const hex = paintToHex(paint);
    if (hex === undefined) continue;
    return { hex, alias: paint.boundVariables?.color ?? (Array.isArray(bound) ? bound[i] : bound) };
  }
  return undefined;
}

/** When ALL of a node's children have one of these types, the node is an icon: emit it, don't descend. */
const VECTOR_TYPES = new Set(["VECTOR", "BOOLEAN_OPERATION", "LINE", "STAR", "REGULAR_POLYGON"]);

/**
 * The fill and stroke a node contributes as CSS colors. Vector shapes other than LINE render
 * their paint as SVG fill/stroke, which `measure` does not read (it reads background and border);
 * a LINE's stroke is commonly built as a CSS border.
 */
function nodePaints(node: FigmaNode): { fill?: PickedPaint; stroke?: PickedPaint } {
  if (VECTOR_TYPES.has(node.type) && node.type !== "LINE") return {};
  const weight = topStrokeWeight(node);
  const stroked = weight !== undefined && weight > 0;
  return {
    fill: topSolid(node.fills, node.boundVariables?.fills),
    stroke: stroked ? topSolid(node.strokes, node.boundVariables?.strokes) : undefined,
  };
}

/** The top border's width, the side `measure` reads (border-top). Per-side weights override the uniform one. */
function topStrokeWeight(node: FigmaNode): number | undefined {
  return node.individualStrokeWeights?.top ?? node.strokeWeight;
}

/** A text node's "fill" is its text color; a box's fill is its background. */
const paintProp = (node: FigmaNode): TokenProperty => (node.type === "TEXT" ? "color" : "fill");

const TEXT_STYLE_KEYS: [keyof FigmaTypeStyle, TokenProperty][] = [
  ["fontFamily", "fontFamily"],
  ["fontSize", "fontSize"],
  ["fontWeight", "fontWeight"],
  ["lineHeightPx", "lineHeight"],
  ["letterSpacing", "letterSpacing"],
];

/** Only the properties the node actually specifies are emitted; absent => not checked. */
export function nodeTokens(node: FigmaNode): DesignTokens {
  const t: Record<string, string | number> = {};
  const { fill, stroke } = nodePaints(node);
  if (fill) t[paintProp(node)] = fill.hex;
  if (node.type === "TEXT" && node.style) {
    for (const [key, prop] of TEXT_STYLE_KEYS) {
      const v = node.style[key];
      if (v !== undefined) t[prop] = v;
    }
  }
  // Top-left only: that is the corner `measure` reads (borderTopLeftRadius).
  const radius = node.cornerRadius ?? node.rectangleCornerRadii?.[0];
  if (radius !== undefined) t.borderRadius = radius;
  if (stroke) {
    t.borderColor = stroke.hex;
    t.borderWidth = topStrokeWeight(node)!;
  }
  if (node.opacity !== undefined && node.opacity !== 1) t.opacity = node.opacity;
  return t as DesignTokens;
}

/** Figma scalar `boundVariables` key -> designfit token property. Paint aliases come from `nodePaints`. */
const VARIABLE_KEYS: [string, TokenProperty][] = [
  ["strokeWeight", "borderWidth"],
  ["strokeTopWeight", "borderWidth"],
  ["cornerRadius", "borderRadius"],
  ["topLeftRadius", "borderRadius"],
  ["opacity", "opacity"],
  ["fontFamily", "fontFamily"],
  ["fontSize", "fontSize"],
  ["fontWeight", "fontWeight"],
  ["lineHeight", "lineHeight"],
  ["letterSpacing", "letterSpacing"],
];

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
  const styleName = (id: string | undefined) => (id ? styles[id]?.name : undefined);
  const name = (id: string) => variableNames[id] ?? id;

  const fillStyle = styleName(node.styles?.fill);
  if (fillStyle) out[paintProp(node)] = fillStyle;
  const strokeStyle = styleName(node.styles?.stroke);
  if (strokeStyle) out.borderColor = strokeStyle;
  const textStyle = styleName(node.styles?.text);
  if (textStyle) for (const [, prop] of TEXT_STYLE_KEYS) out[prop] = textStyle;

  if (node.boundVariables) {
    for (const [key, prop] of VARIABLE_KEYS) {
      const bound = node.boundVariables[key];
      const alias = Array.isArray(bound) ? bound[0] : bound;
      if (alias?.id) out[prop] = name(alias.id);
    }
  }
  const { fill, stroke } = nodePaints(node);
  if (fill?.alias?.id) out[paintProp(node)] = name(fill.alias.id);
  if (stroke?.alias?.id) out.borderColor = name(stroke.alias.id);

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
  const entries = response.nodes ?? {};
  const ids = Object.keys(entries).filter((k) => entries[k] != null);
  const key = nodeId ?? ids[0];
  const entry = key ? entries[key] : undefined;
  if (entry === null) {
    throw new Error(
      `Figma returned no node for ${key}; check the node-id in the link and that the token can read this file`,
    );
  }
  if (!entry) {
    throw new Error(`node ${nodeId ?? "(none)"} not in response; available: ${ids.join(", ") || "none"}`);
  }
  if (!entry.document || typeof entry.document !== "object") {
    throw new Error(
      `entry ${key} has no \`document\`; pass the raw body of GET /v1/files/<fileKey>/nodes?ids=<nodeId> (shape: { nodes: { "<id>": { document, styles } } })`,
    );
  }
  const map: MapEntry[] = [];
  const root = walk(entry.document, 0, opts, entry.styles ?? {}, map);
  if (!root) throw new Error(`root node ${entry.document.id} is hidden or has no bounding box`);
  return {
    design: { root },
    componentMap: map,
    viewport: { width: Math.max(1, Math.round(root.frame.w)), height: Math.max(1, Math.round(root.frame.h)) },
  };
}
