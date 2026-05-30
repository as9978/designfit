// src/compare/presence.ts
import type { DesignNode, MapEntry, Measurement, Unmapped, Violation } from "../types";

export interface PresenceOutput {
  violations: Violation[];
  checks: number;
  unmapped: Unmapped;
}

export function checkPresence(
  componentMap: MapEntry[],
  measurements: Measurement[],
  domIds: string[],
  designById: Map<string, DesignNode>,
): PresenceOutput {
  const violations: Violation[] = [];
  const measById = new Map(measurements.map((m) => [m.figmaNodeId, m]));
  const mapIds = new Set(componentMap.map((e) => e.figmaNodeId));
  const inDesignNotFound: string[] = [];

  for (const entry of componentMap) {
    const m = measById.get(entry.figmaNodeId);
    if (!m || !m.found) {
      inDesignNotFound.push(entry.figmaNodeId);
      const name = designById.get(entry.figmaNodeId)?.name ?? entry.figmaNodeId;
      violations.push({
        component: `${name}#${entry.figmaNodeId}`,
        check: "presence",
        property: "exists",
        expected: { value: "present" },
        actual: { value: "missing" },
        delta: "element not found in DOM",
        severity: "error",
        fixHint: `render an element with data-designfit-id="${entry.figmaNodeId}"`,
      });
    }
  }

  const inDomNotMapped = domIds.filter((id) => !mapIds.has(id));
  for (const id of inDomNotMapped) {
    violations.push({
      component: id,
      check: "presence",
      property: "unexpected",
      expected: { value: "not in component map" },
      actual: { value: "present in DOM" },
      delta: "extra tagged element",
      severity: "warn",
      fixHint: `remove data-designfit-id="${id}" or add it to the component map`,
    });
  }

  return { violations, checks: componentMap.length, unmapped: { inDesignNotFound, inDomNotMapped } };
}
