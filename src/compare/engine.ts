// src/compare/engine.ts
import type {
  DesignNode,
  DesignSpec,
  MapEntry,
  MeasureResult,
  Tolerances,
  ValidationResult,
  Viewport,
  Violation,
} from "../types";
import { compareTokens } from "./tokens";
import { compareGeometry } from "./geometry";
import { checkPresence } from "./presence";
import { computeScore } from "../score";

/** Index every node in the design tree by id. */
export function flattenDesign(spec: DesignSpec): Map<string, DesignNode> {
  const byId = new Map<string, DesignNode>();
  const walk = (node: DesignNode) => {
    byId.set(node.id, node);
    for (const child of node.children) walk(child);
  };
  walk(spec.root);
  return byId;
}

export function validate(
  spec: DesignSpec,
  measure: MeasureResult,
  componentMap: MapEntry[],
  viewport: Viewport,
  tol: Tolerances,
): ValidationResult {
  const designById = flattenDesign(spec);
  const measById = new Map(measure.measurements.map((m) => [m.figmaNodeId, m]));

  // De-duplicate the component map by figmaNodeId so a repeated entry can't
  // double-count checks/violations (geometry already iterates the deduped measById).
  const seenIds = new Set<string>();
  const uniqueMap = componentMap.filter((e) =>
    seenIds.has(e.figmaNodeId) ? false : (seenIds.add(e.figmaNodeId), true),
  );

  const violations: Violation[] = [];
  let totalChecks = 0;

  const presence = checkPresence(uniqueMap, measure.measurements, measure.domIds, designById);
  violations.push(...presence.violations);
  totalChecks += presence.checks;

  for (const entry of uniqueMap) {
    const node = designById.get(entry.figmaNodeId);
    const m = measById.get(entry.figmaNodeId);
    if (!node || !m || !m.found) continue; // misses are already counted by presence
    const t = compareTokens(node, m.styles, tol);
    violations.push(...t.violations);
    totalChecks += t.checks;
  }

  const geo = compareGeometry(designById, measById, spec.root.id, tol);
  violations.push(...geo.violations);
  totalChecks += geo.checks;

  const errors = violations.filter((v) => v.severity === "error").length;
  const score = computeScore(errors, totalChecks);

  return {
    pass: errors === 0,
    score,
    viewport,
    violations,
    unmapped: presence.unmapped,
  };
}
