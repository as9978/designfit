# Validating a real Figma frame

designfit works as a loop: your coding agent builds a frame, tags what it built, validates it against the Figma design, fixes the named violations, and repeats until it passes. This guide walks through running that loop on a real frame with Claude Code (or any MCP-capable agent).

## Prerequisites

- **designfit installed and registered** as an MCP server in your client. Global install: `npm i -g designfit`, then `{ "mcpServers": { "designfit": { "command": "designfit" } } }`. (Or from a clone: `npm run build`, then point the client at `node dist/index.js`.) Run `npx playwright install chromium` once.
- **Figma's MCP connected** in the same session, so the agent can read the frame's tokens and geometry.
- **A dev server running** for the app you're implementing into — note its URL.
- **The skill discoverable**: copy `skill/SKILL.md` to `.claude/skills/designfit-fidelity-loop/SKILL.md` (skills aren't auto-loaded from an npm dependency).
- **A Figma frame picked.** Start simple — a card or a button row.

## The loop

The `designfit-fidelity-loop` skill drives it; the shape is:

1. **Relay the spec** — pull the frame's geometry + tokens from the Figma MCP into a `DesignSpec` and a `componentMap` (one entry per element: `{ figmaNodeId, selector? }`).
2. **Build** the frame in your dev app.
3. **Tag** each built element with `data-designfit-id="<figmaNodeId>"` so designfit can locate it in the DOM.
4. **Validate** — call `designfit_validate` with `{ url, viewport, design, componentMap }`.
5. **Fix** the reported violations (errors first; `warn`s are advisory — hardcoded values with no Figma token).
6. **Repeat** from step 4 until `pass: true`.

## Copy-paste prompt

> Implement this Figma frame [paste link / make the selection] in our dev app running at
> `<DEV_URL>`. Tag every element with `data-designfit-id` matching its Figma node id. Then use the
> `designfit-fidelity-loop` skill: relay the design spec + component map from the Figma MCP, run
> `designfit_validate` against the running URL, fix the reported violations, and repeat until
> `pass: true`. **Print the full validation result (score + violations) after every iteration**
> so I can watch it converge.

## What good looks like

- **Convergence, not oscillation** — the score should climb toward `pass` and then *stop*. If fixing A re-breaks B round after round, that points to a tolerance or mapping issue (see below), not something to keep retrying.
- **Faithful relay** — the node ids, tokens, and frame sizes coming out of the Figma MCP should be correct and complete.
- **Autonomy** — a well-mapped frame should reach `pass: true` without hand-holding.

Try it on 2–3 frames of increasing complexity (button row → card → small form) to build confidence in the mapping.

## Troubleshooting

- **Element reported missing (`unmapped.inDesignNotFound`)** — the `data-designfit-id` doesn't match the `figmaNodeId`, or a `selector` override is wrong.
- **Persistent geometry errors that look correct** — confirm the `viewport` matches the Figma frame size; boxes are compared relative to the screen root.
- **A mismatch shows as `warn`, not `error`** — that property is hardcoded in the build (no `tokenSources` entry). Bind it to a token to enforce it, or leave it if intentional.
- **Fixes fighting each other** — capture the per-iteration results; if two properties trade blame across rounds, that's worth filing as an issue (with the captures) rather than retrying.
