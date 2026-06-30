# Contributing to designfit

Thanks for your interest in improving **designfit**. This guide covers how to get set up, the dev loop, and how we accept changes.

## Prerequisites

- **Node.js >= 18**
- Install dependencies:

  ```bash
  npm install
  ```

- Install the Chromium browser Playwright uses for measurement (one-time):

  ```bash
  npx playwright install chromium
  ```

## Dev loop

Run these locally before pushing — CI runs the same checks (typecheck, test, build):

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run build       # tsup
```

For a quick end-to-end sanity check of the MCP server, run the smoke check:

```bash
npm run smoke       # exercises the designfit_validate tool end-to-end
```

## Project layout

```
src/
  compare/        # the comparison engine
    engine.ts     #   orchestrates token + geometry + presence checks
    tokens.ts     #   design-token comparison (color, etc.)
    geometry.ts   #   element-box geometry comparison
    presence.ts   #   element presence / mapping checks
  measure.ts      # Playwright-driven measurement of the rendered page
  server.ts       # the MCP server exposing the designfit_validate tool
  schema.ts       # zod schemas for tool input/output
  score.ts        # scoring and pass/fail logic
  normalize.ts    # normalization helpers
  color.ts        # color parsing/comparison (culori)
  defaults.ts     # default tolerances
  types.ts        # shared types
  index.ts        # bin entry point

test/             # vitest tests mirroring src/ (plus fixtures/)
skill/            # the Claude Code skill (SKILL.md) that drives the fidelity loop
```

## Contribution workflow

1. Branch off `main`.
2. Keep changes focused — one logical change per PR.
3. Use conventional-commit-style messages (e.g. `fix:`, `feat:`, `docs:`, `chore:`).
4. Add or update tests for any behavior change.
5. Make sure CI is green before requesting review.

## Code style

- **TypeScript**, ESM modules (the package is `"type": "module"`).
- Validate all tool input/output with **zod** schemas.
- Keep comparisons **deterministic**, with **explicit tolerances** — same input, same output. Never introduce nondeterminism (e.g. pixel diffing, time-dependent or order-dependent results) into the comparison path.
- Match the existing structure: comparison logic lives in `src/compare`, measurement in `src/measure.ts`, MCP wiring in `src/server.ts`.

## Scope

designfit v1 is intentionally **one viewport**, **token + geometry + presence** checks. Responsive multi-breakpoint support and a perceptual VLM fallback are on the roadmap, not in v1. Please open an issue to discuss before adding out-of-scope features.
