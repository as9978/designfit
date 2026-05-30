// src/defaults.ts
import type { Tolerances } from "./types";

export const DEFAULT_TOLERANCES: Tolerances = {
  geometry: { position: 2, size: 2 },
  color: { deltaE: 2 },
  fontSize: { px: 1 },
  lineHeight: { px: 2 },
  letterSpacing: { px: 0.5 },
  borderWidth: { px: 1 },
  borderRadius: { px: 1 },
};
