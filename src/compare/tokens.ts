// src/compare/tokens.ts
import type {
  CompareOutput,
  DesignNode,
  ResolvedStyles,
  Tolerances,
  TokenProperty,
  Violation,
} from "../types";
import { deltaE } from "../color";

function label(node: DesignNode): string {
  return `${node.name}#${node.id}`;
}

function base(node: DesignNode, property: string, source: string | undefined): Pick<Violation, "component" | "check" | "property" | "severity"> & { source?: string } {
  return { component: label(node), check: "token", property, severity: "error", source };
}

function colorCheck(node: DesignNode, property: TokenProperty, expected: string, actual: string | undefined, tolDeltaE: number): Violation | null {
  const source = node.tokenSources?.[property];
  if (actual === undefined) {
    return {
      ...base(node, property, source),
      expected: { value: expected, source },
      actual: { value: "none" },
      delta: "no value rendered",
      fixHint: `set ${property} to ${source ?? expected}`,
    };
  }
  const d = deltaE(expected, actual);
  if (d <= tolDeltaE) return null;
  return {
    ...base(node, property, source),
    expected: { value: expected, source },
    actual: { value: actual },
    delta: `ΔE ${d.toFixed(1)} (${actual} vs ${expected})`,
    fixHint: `use ${source ?? expected} (${expected})`,
  };
}

function numericCheck(node: DesignNode, property: TokenProperty, expected: number, actual: number | undefined, tolPx: number, unit = "px"): Violation | null {
  const source = node.tokenSources?.[property];
  if (actual === undefined) {
    return {
      ...base(node, property, source),
      expected: { value: `${expected}${unit}`, source },
      actual: { value: "none" },
      delta: "no value rendered",
      fixHint: `set ${property} to ${expected}${unit}`,
    };
  }
  if (Math.abs(expected - actual) <= tolPx) return null;
  const signed = actual - expected;
  const sign = signed >= 0 ? "+" : "";
  return {
    ...base(node, property, source),
    expected: { value: `${expected}${unit}`, source },
    actual: { value: `${actual}${unit}` },
    delta: `${sign}${signed}${unit} (${actual} vs ${expected})`,
    fixHint: `set ${property} to ${expected}${unit}${source ? ` (token ${source})` : ""}`,
  };
}

function exactCheck(node: DesignNode, property: TokenProperty, expected: number, actual: number | undefined): Violation | null {
  const source = node.tokenSources?.[property];
  if (actual === expected) return null;
  return {
    ...base(node, property, source),
    expected: { value: String(expected), source },
    actual: { value: actual === undefined ? "none" : String(actual) },
    delta: `${actual ?? "none"} vs ${expected}`,
    fixHint: `set ${property} to ${expected}`,
  };
}

function familyCheck(node: DesignNode, expected: string, actual: string | undefined): Violation | null {
  const source = node.tokenSources?.fontFamily;
  if (actual !== undefined && actual.toLowerCase() === expected.toLowerCase()) return null;
  return {
    ...base(node, "fontFamily", source),
    expected: { value: expected, source },
    actual: { value: actual ?? "none" },
    delta: `${actual ?? "none"} vs ${expected}`,
    fixHint: `set font-family to ${expected}`,
  };
}

/** Compare a design node's declared tokens against the element's resolved styles. */
export function compareTokens(node: DesignNode, styles: ResolvedStyles | undefined, tol: Tolerances): CompareOutput {
  const s = styles ?? {};
  const t = node.tokens;
  const violations: Violation[] = [];
  let checks = 0;

  const push = (v: Violation | null) => {
    checks += 1;
    if (v) violations.push(v);
  };

  if (t.fill !== undefined) push(colorCheck(node, "fill", t.fill, s.fill, tol.color.deltaE));
  if (t.color !== undefined) push(colorCheck(node, "color", t.color, s.color, tol.color.deltaE));
  if (t.borderColor !== undefined) push(colorCheck(node, "borderColor", t.borderColor, s.borderColor, tol.color.deltaE));
  if (t.fontSize !== undefined) push(numericCheck(node, "fontSize", t.fontSize, s.fontSize, tol.fontSize.px));
  if (t.lineHeight !== undefined) push(numericCheck(node, "lineHeight", t.lineHeight, s.lineHeight, tol.lineHeight.px));
  if (t.letterSpacing !== undefined) push(numericCheck(node, "letterSpacing", t.letterSpacing, s.letterSpacing, tol.letterSpacing.px));
  if (t.borderWidth !== undefined) push(numericCheck(node, "borderWidth", t.borderWidth, s.borderWidth, tol.borderWidth.px));
  if (t.borderRadius !== undefined) push(numericCheck(node, "borderRadius", t.borderRadius, s.borderRadius, tol.borderRadius.px));
  if (t.fontWeight !== undefined) push(exactCheck(node, "fontWeight", t.fontWeight, s.fontWeight));
  if (t.opacity !== undefined) push(numericCheck(node, "opacity", t.opacity, s.opacity, 0.01, ""));
  if (t.fontFamily !== undefined) push(familyCheck(node, t.fontFamily, s.fontFamily));

  return { violations, checks };
}
