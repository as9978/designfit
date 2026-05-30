// src/compare/tokens.ts
import type {
  CompareOutput,
  DesignNode,
  ResolvedStyles,
  Tolerances,
  TokenProperty,
  Violation,
} from "../types";
import { deltaE, alphaOf } from "../color";

/** Round to 3 decimals so sub-pixel/float-subtraction noise never reaches the output string. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function label(node: DesignNode): string {
  return `${node.name}#${node.id}`;
}

/**
 * A property is "enforced" when its node declares a tokenSources ENTRY for it — i.e.
 * it is bound to a Figma variable. Keyed on key PRESENCE, not value truthiness, so an
 * explicit (even empty) entry still enforces and an empty token name can't silently
 * downgrade a token-bound property to advisory.
 */
function isEnforced(node: DesignNode, property: string): boolean {
  return node.tokenSources != null && Object.prototype.hasOwnProperty.call(node.tokenSources, property);
}

function base(node: DesignNode, property: string, source: string | undefined): Pick<Violation, "component" | "check" | "property" | "severity"> & { source?: string } {
  // Token-bound properties (bound to a Figma variable via tokenSources) are enforced as
  // errors. A hardcoded literal (no tokenSources entry, no token to anchor a semantic
  // fix to) is advisory: a mismatch is a warn that surfaces but never fails the run —
  // the spec's "hardcoded (non-token) value → emit a warn, don't fail" rule.
  return { component: label(node), check: "token", property, severity: isEnforced(node, property) ? "error" : "warn", source };
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
  const aExp = alphaOf(expected);
  const aAct = alphaOf(actual);
  const alphaMismatch =
    Number.isFinite(aExp) && Number.isFinite(aAct) && Math.abs(aExp - aAct) > 0.01;
  if (d <= tolDeltaE && !alphaMismatch) return null;
  const parts: string[] = [];
  if (d > tolDeltaE) parts.push(`ΔE ${d.toFixed(1)}`);
  if (alphaMismatch) parts.push(`alpha ${aAct.toFixed(2)} vs ${aExp.toFixed(2)}`);
  return {
    ...base(node, property, source),
    expected: { value: expected, source },
    actual: { value: actual },
    delta: `${parts.join(", ")} (${actual} vs ${expected})`,
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
  const signed = round3(actual - expected);
  const shownActual = round3(actual);
  const sign = signed >= 0 ? "+" : "";
  return {
    ...base(node, property, source),
    expected: { value: `${expected}${unit}`, source },
    actual: { value: `${shownActual}${unit}` },
    delta: `${sign}${signed}${unit} (${shownActual} vs ${expected})`,
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

  const push = (property: TokenProperty, v: Violation | null) => {
    // Only enforced (token-bound) properties contribute to the fidelity score. A
    // hardcoded literal's check is "skipped" from scoring per the spec — its mismatch
    // is an advisory warn that surfaces but neither counts toward `checks` nor fails.
    if (isEnforced(node, property)) checks += 1;
    if (v) {
      // A token violation is only `warn` for a hardcoded property (no tokenSources
      // entry) — say so, since its fix can only ever be a magic number.
      if (v.severity === "warn") {
        v.fixHint += " — hardcoded value (no Figma token); bind it to a token to enforce, or omit it if intentional";
      }
      violations.push(v);
    }
  };

  if (t.fill !== undefined) push("fill", colorCheck(node, "fill", t.fill, s.fill, tol.color.deltaE));
  if (t.color !== undefined) push("color", colorCheck(node, "color", t.color, s.color, tol.color.deltaE));
  if (t.borderColor !== undefined) push("borderColor", colorCheck(node, "borderColor", t.borderColor, s.borderColor, tol.color.deltaE));
  if (t.fontSize !== undefined) push("fontSize", numericCheck(node, "fontSize", t.fontSize, s.fontSize, tol.fontSize.px));
  if (t.lineHeight !== undefined) push("lineHeight", numericCheck(node, "lineHeight", t.lineHeight, s.lineHeight, tol.lineHeight.px));
  if (t.letterSpacing !== undefined) push("letterSpacing", numericCheck(node, "letterSpacing", t.letterSpacing, s.letterSpacing, tol.letterSpacing.px));
  if (t.borderWidth !== undefined) push("borderWidth", numericCheck(node, "borderWidth", t.borderWidth, s.borderWidth, tol.borderWidth.px));
  if (t.borderRadius !== undefined) push("borderRadius", numericCheck(node, "borderRadius", t.borderRadius, s.borderRadius, tol.borderRadius.px));
  if (t.fontWeight !== undefined) push("fontWeight", exactCheck(node, "fontWeight", t.fontWeight, s.fontWeight));
  if (t.opacity !== undefined) push("opacity", numericCheck(node, "opacity", t.opacity, s.opacity, 0.01, ""));
  if (t.fontFamily !== undefined) push("fontFamily", familyCheck(node, t.fontFamily, s.fontFamily));

  return { violations, checks };
}
