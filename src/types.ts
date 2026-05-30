// src/types.ts

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Resolved design values for one node. All optional — only declared properties are checked. */
export interface DesignTokens {
  fill?: string; // background color, hex e.g. "#1D4ED8"
  color?: string; // text color, hex
  fontFamily?: string; // primary family name
  fontSize?: number; // px
  fontWeight?: number; // numeric, e.g. 700
  lineHeight?: number; // px
  letterSpacing?: number; // px
  borderRadius?: number; // px
  borderColor?: string; // hex
  borderWidth?: number; // px
  opacity?: number; // 0..1
}

export type TokenProperty = keyof DesignTokens;

export interface DesignNode {
  id: string; // Figma node id; also the data-plumb-id value
  name: string; // "Button/Primary"
  frame: Frame; // absolute coords within the design frame
  tokens: DesignTokens;
  tokenSources?: Partial<Record<TokenProperty, string>>; // property -> Figma variable name, e.g. fill -> "color/primary"
  children: DesignNode[];
}

export interface DesignSpec {
  root: DesignNode;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface MapEntry {
  figmaNodeId: string;
  selector?: string; // defaults to [data-plumb-id="<figmaNodeId>"]
}

export interface Tolerances {
  geometry: { position: number; size: number }; // px
  color: { deltaE: number }; // CIEDE2000 distance
  fontSize: { px: number };
  lineHeight: { px: number };
  letterSpacing: { px: number };
  borderWidth: { px: number };
  borderRadius: { px: number };
}

/** Normalized computed styles, keyed identically to DesignTokens for clean comparison. */
export interface ResolvedStyles {
  fill?: string; // background-color -> hex (undefined if transparent)
  color?: string; // hex
  fontFamily?: string; // primary family, lowercased
  fontSize?: number; // px
  fontWeight?: number;
  lineHeight?: number; // px (undefined if "normal")
  letterSpacing?: number; // px (undefined if "normal")
  borderRadius?: number; // px (top-left as representative)
  borderColor?: string; // hex (undefined if no visible border)
  borderWidth?: number; // px (top as representative)
  opacity?: number;
}

/** Raw computed-style strings as read in the browser, before normalization. */
export interface RawComputed {
  backgroundColor: string;
  color: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  borderTopLeftRadius: string;
  borderTopColor: string;
  borderTopWidth: string;
  opacity: string;
}

export interface Measurement {
  figmaNodeId: string;
  found: boolean;
  box?: Frame;
  styles?: ResolvedStyles;
}

export interface MeasureResult {
  measurements: Measurement[];
  domIds: string[]; // every data-plumb-id value present in the DOM
}

export type CheckKind = "token" | "geometry" | "presence";
export type Severity = "error" | "warn";

export interface Violation {
  component: string; // "name#id"
  check: CheckKind;
  property: string; // "fill" | "width" | "x" | "exists" | ...
  expected: { value: string; source?: string }; // source = Figma token name
  actual: { value: string };
  delta: string; // human + machine readable, e.g. "+40px (560 vs 520)"
  severity: Severity;
  fixHint: string;
}

export interface Unmapped {
  inDesignNotFound: string[]; // map entries whose element was not found in the DOM
  inDomNotMapped: string[]; // data-plumb-ids in the DOM not present in the component map
}

export interface ValidationResult {
  pass: boolean;
  score: number; // 0..100
  viewport: Viewport;
  violations: Violation[];
  unmapped: Unmapped;
}

/** Return shape for the per-check comparison functions. */
export interface CompareOutput {
  violations: Violation[];
  checks: number; // number of comparisons performed (denominator for scoring)
}
