// src/extract/figmaTypes.ts
// The slice of Figma's REST `GET /v1/files/:key/nodes` response that extract reads.
// Figma omits fields that hold their default (e.g. `visible: true`), hence the optionals.

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FigmaVariableAlias {
  type: "VARIABLE_ALIAS";
  id: string; // "VariableID:10:1"
}

export interface FigmaPaint {
  type: string; // "SOLID" | "GRADIENT_LINEAR" | "IMAGE" | ...
  visible?: boolean;
  opacity?: number; // paint-level opacity, multiplies color.a
  color?: FigmaColor; // SOLID only
  boundVariables?: { color?: FigmaVariableAlias };
}

export interface FigmaTypeStyle {
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: number;
  lineHeightPx?: number;
  letterSpacing?: number; // px
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string; // "FRAME" | "TEXT" | "RECTANGLE" | "VECTOR" | ...
  visible?: boolean;
  children?: FigmaNode[];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null;
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  individualStrokeWeights?: { top: number; right: number; bottom: number; left: number }; // per-side; overrides strokeWeight
  cornerRadius?: number;
  rectangleCornerRadii?: [number, number, number, number]; // [tl, tr, br, bl]
  opacity?: number;
  style?: FigmaTypeStyle; // TEXT only
  styles?: Partial<Record<"fill" | "stroke" | "text" | "effect", string>>; // style ids
  boundVariables?: Record<string, FigmaVariableAlias | FigmaVariableAlias[] | undefined>;
}

export interface FigmaStyleMeta {
  key: string;
  name: string; // "text/button"
  styleType: string;
  description?: string;
}

export interface FigmaNodesResponse {
  name?: string;
  nodes: Record<string, { document: FigmaNode; styles?: Record<string, FigmaStyleMeta> } | null>;
}
