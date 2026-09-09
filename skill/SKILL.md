---
name: designfit-fidelity-loop
description: Use when implementing a Figma design as front-end code with an MCP-connected agent: extracts the design spec with designfit, builds the UI, validates it against the spec, and self-corrects until it passes. Triggers on "implement this Figma frame", "make it match the design", "pixel-perfect from Figma".
---

# designfit — Design-Fidelity Loop

Extract the design spec with `designfit_extract`, implement the Figma screen as code, then **prove** it matches by validating with `designfit_validate` and fixing what it reports. Repeat until `pass: true`, then clean up the tags.

## Prerequisites

- The `designfit` MCP server is connected (exposes `designfit_extract` and `designfit_validate`).
- A dev server is running and the target screen is reachable at a URL.
- Either `FIGMA_TOKEN` is set on the designfit MCP server (the plugin asks for it at enable time), or Figma's MCP server is connected so you can fall back to reading the design by hand.

## The loop

### 1. Extract the design spec

Call `designfit_extract` with the frame's Figma link (the URL you get from "Copy link to selection"; it carries `node-id`):

```json
{ "url": "https://www.figma.com/design/<fileKey>/<name>?node-id=12-34" }
```

You get back `{ design, componentMap, viewport }`. Keep all three: they are the `designfit_validate` input minus `url`. If the frame is large, pass `"maxDepth": 1` first and go deeper once the top level passes.

If extract fails with a `FIGMA_TOKEN` error, do not retry it. Use the fallback below.

### 2. Build the UI, tagging as you go

For every node in `componentMap`, the element you build for it gets `data-designfit-id="<figmaNodeId>"` (the ids look like `12:34`). The screen's root container gets the root node id. Nodes that `designfit_extract` folded into one leaf (icons made of vectors) are one element.

### 3. Fallback: assemble the `DesignSpec` by hand

Only when extract is unavailable. Read the design from Figma's MCP (`get_metadata` for ids, names, and frames; `get_variable_defs` for token names and values) and build the same shape yourself:

- `id`: the Figma node id (same value you used for `data-designfit-id`).
- `name`: the Figma layer name (e.g. `"Button/Primary"`).
- `frame`: `{ x, y, w, h }` from `get_metadata` (rename `width` to `w`, `height` to `h`).
- `tokens`: only the properties the design specifies. Colors as hex (`fill`, `color`, `borderColor`); numbers in px (`fontSize`, `lineHeight`, `letterSpacing`, `borderRadius`, `borderWidth`); `fontWeight` numeric; `fontFamily` the family name; `opacity` 0..1.
- `tokenSources`: map each token property to its Figma variable or style name (e.g. `{ "fill": "color/primary" }`). A property listed here is enforced as an `error` on mismatch; one absent from `tokenSources` is a hardcoded literal and only `warn`s.
- `children`: nested design nodes.
- `componentMap`: one `{ "figmaNodeId": "<id>" }` per node you tagged.

### 4. Validate

Call `designfit_validate` with:

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
- **presence** `exists` → render the missing element (and tag it); `unexpected` → remove the stray `data-designfit-id` or add it to the map.

Re-run `designfit_validate`. **Stop when `pass` is `true`.** If the `score` does not improve across two consecutive runs, stop and report the remaining violations rather than thrashing — designfit is deterministic, so an unchanged score means your last edit had no effect on what it measures.

### 6. Clean up

Once `pass` is `true`, remove every `data-designfit-id` attribute you added, unless the project keeps them on purpose for regression validation (re-running `designfit_validate` later, or the upcoming CI mode). They are measurement hooks, not product markup. If you strip them and later need to re-validate, re-tag from the same `componentMap`.

## Notes

- **Token enforcement follows `tokenSources`:** a property bound to a Figma variable (listed in `tokenSources`) is enforced as an `error` — a mismatch fails the run and lowers the score. A hardcoded value with **no** `tokenSources` entry is advisory: a mismatch is a `warn` that surfaces in the fix-list but does **not** fail `pass` or lower the score. So bind a value to its token when you want designfit to enforce it; leave it hardcoded when it's informational.
- v1 validates **one viewport**. Validate the breakpoint the frame was designed at.
- Geometry is compared relative to the root, so a correctly-built screen that's merely centered or offset still passes.
- Tolerances default to ±2px geometry and ΔE ≤ 2 color. Pass `tolerances` to loosen/tighten per project.
