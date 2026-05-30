// src/compare/geometry.ts
import type { CompareOutput, DesignNode, Measurement, Tolerances, Violation } from "../types";

function label(node: DesignNode): string {
  return `${node.name}#${node.id}`;
}

function dimViolation(node: DesignNode, property: "width" | "height" | "x" | "y", expected: number, actual: number, tolPx: number): Violation | null {
  if (Math.abs(expected - actual) <= tolPx) return null;
  const signed = Math.round(actual - expected);
  const sign = signed >= 0 ? "+" : "";
  const verb = property === "width" || property === "height" ? `set ${property} to ${expected}px` : `move so relative ${property} = ${expected}px`;
  return {
    component: label(node),
    check: "geometry",
    property,
    expected: { value: `${expected}px` },
    actual: { value: `${Math.round(actual)}px` },
    delta: `${sign}${signed}px (${Math.round(actual)} vs ${expected})`,
    severity: "error",
    fixHint: verb,
  };
}

/**
 * Compare each node's geometry to Figma, normalized to the screen root's origin.
 * Position is compared relative to the root, so a globally-shifted (but correctly
 * laid out) screen produces zero violations. Deterministic — no pixel sampling.
 */
export function compareGeometry(
  designById: Map<string, DesignNode>,
  measById: Map<string, Measurement>,
  rootId: string,
  tol: Tolerances,
): CompareOutput {
  const violations: Violation[] = [];
  let checks = 0;

  const designRoot = designById.get(rootId);
  const implRoot = measById.get(rootId);
  if (!designRoot || !implRoot || !implRoot.found || !implRoot.box) {
    return { violations, checks }; // can't anchor geometry; a missing root is reported by presence
  }

  // Root: only size is meaningful (its origin is the anchor).
  checks += 2;
  const wv = dimViolation(designRoot, "width", designRoot.frame.w, implRoot.box.w, tol.geometry.size);
  if (wv) violations.push(wv);
  const hv = dimViolation(designRoot, "height", designRoot.frame.h, implRoot.box.h, tol.geometry.size);
  if (hv) violations.push(hv);

  for (const [id, m] of measById) {
    if (id === rootId) continue;
    if (!m.found || !m.box) continue;
    const node = designById.get(id);
    if (!node) continue;

    const dRelX = node.frame.x - designRoot.frame.x;
    const dRelY = node.frame.y - designRoot.frame.y;
    const iRelX = m.box.x - implRoot.box.x;
    const iRelY = m.box.y - implRoot.box.y;

    checks += 4;
    const vx = dimViolation(node, "x", dRelX, iRelX, tol.geometry.position);
    if (vx) violations.push(vx);
    const vy = dimViolation(node, "y", dRelY, iRelY, tol.geometry.position);
    if (vy) violations.push(vy);
    const vw = dimViolation(node, "width", node.frame.w, m.box.w, tol.geometry.size);
    if (vw) violations.push(vw);
    const vh = dimViolation(node, "height", node.frame.h, m.box.h, tol.geometry.size);
    if (vh) violations.push(vh);
  }

  return { violations, checks };
}
