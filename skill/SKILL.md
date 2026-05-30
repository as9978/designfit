---
name: trueup-fidelity-loop
description: Use when implementing a Figma design as front-end code with an MCP-connected agent — builds the UI, then validates it against the design with trueup and self-corrects until it passes. Triggers on "implement this Figma frame", "make it match the design", "pixel-perfect from Figma".
---

# trueup — Design-Fidelity Loop

Implement a Figma screen as code, then **prove** it matches by validating with the `trueup_validate` MCP tool and fixing what it reports. Repeat until `pass: true`.

## Prerequisites

- The `trueup` MCP server is connected (exposes `trueup_validate`).
- Figma's MCP server is connected (`get_metadata`, `get_variable_defs`, `get_screenshot`).
- A dev server is running and the target screen is reachable at a URL.

## The loop

### 1. Read the design from Figma

- `get_metadata` on the target frame → node tree with ids, names, and frames (`x`, `y`, `width`, `height`).
- `get_variable_defs` → resolved token values and their variable names.

### 2. Build the UI, tagging as you go

For every Figma node you implement as a distinct element, add `data-plumb-id="<figmaNodeId>"` to that element. The screen's root container gets the **root** node id. You know the mapping because you are the one building it — record it.

### 3. Assemble the `DesignSpec`

Transform the Figma data into trueup's shape (one `root` node, nested `children`). For each node:

- `id` — the Figma node id (same value you used for `data-plumb-id`).
- `name` — the Figma layer name (e.g. `"Button/Primary"`).
- `frame` — `{ x, y, w, h }` from `get_metadata` (rename `width`→`w`, `height`→`h`).
- `tokens` — only the properties the design actually specifies. Colors as hex (`fill`, `color`, `borderColor`); numbers in px (`fontSize`, `lineHeight`, `letterSpacing`, `borderRadius`, `borderWidth`); `fontWeight` numeric; `fontFamily` the family name; `opacity` 0..1.
- `tokenSources` — map each token property to its Figma variable name (e.g. `{ "fill": "color/primary" }`). This makes fix hints semantic **and** marks the property as enforced: token-bound properties are hard `error`s on mismatch, while properties absent from `tokenSources` are treated as hardcoded literals and downgraded to advisory `warn`s.
- `children` — nested design nodes.

### 4. Validate

Call `trueup_validate` with:

```json
{
  "url": "<running screen URL>",
  "viewport": { "width": <frame width>, "height": <frame height> },
  "design": { "root": { /* DesignSpec */ } },
  "componentMap": [{ "figmaNodeId": "root" }, { "figmaNodeId": "btn" }, ...]
}
```

Set `viewport` to the Figma frame's intended size. List every tagged node in `componentMap`.

### 5. Fix and repeat

Read `violations`. Each has a `component`, `check` (`token` | `geometry` | `presence`), `property`, `expected` (with the token `source` when known), `actual`, `delta`, and a `fixHint`. Apply the fixes:

- **token** → use the named token / set the property to `expected`.
- **geometry** → adjust size or position; `x`/`y` are *relative to the screen root*.
- **presence** `exists` → render the missing element (and tag it); `unexpected` → remove the stray `data-plumb-id` or add it to the map.

Re-run `trueup_validate`. **Stop when `pass` is `true`.** If the `score` does not improve across two consecutive runs, stop and report the remaining violations rather than thrashing — trueup is deterministic, so an unchanged score means your last edit had no effect on what it measures.

## Notes

- **Token enforcement follows `tokenSources`:** a property bound to a Figma variable (listed in `tokenSources`) is enforced as an `error` — a mismatch fails the run and lowers the score. A hardcoded value with **no** `tokenSources` entry is advisory: a mismatch is a `warn` that surfaces in the fix-list but does **not** fail `pass` or lower the score. So bind a value to its token when you want trueup to enforce it; leave it hardcoded when it's informational.
- v1 validates **one viewport**. Validate the breakpoint the frame was designed at.
- Geometry is compared relative to the root, so a correctly-built screen that's merely centered or offset still passes.
- Tolerances default to ±2px geometry and ΔE ≤ 2 color. Pass `tolerances` to loosen/tighten per project.
