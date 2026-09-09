# Validating a real Figma frame

designfit works as a loop: your coding agent builds a frame, tags what it built, validates it against the Figma design, fixes the named violations, and repeats until it passes. This guide walks through running that loop on a real frame with Claude Code (or any MCP-capable agent).

## Prerequisites

- **designfit installed.** In Claude Code, install the plugin and you're done: `/plugin marketplace add as9978/designfit`, then `/plugin install designfit@designfit` registers both MCP tools and the skill together, and prompts for a Figma personal access token (paste one so `designfit_extract` can read frames directly; leave it empty to paste `/nodes` JSON instead). For any other MCP client: `npm i -g designfit`, then `{ "mcpServers": { "designfit": { "command": "designfit", "env": { "FIGMA_TOKEN": "<token>" } } } }`. (Or from a clone: `npm run build`, then point the client at `node dist/index.js`.) Either way, run `npx playwright install chromium` once.
- **Figma's MCP connected** (only if you did not set a Figma token): the fallback path reads the frame's ids, frames, and tokens through it by hand.
- **A dev server running** for the app you're implementing into — note its URL.
- **The skill discoverable.** The plugin registers it for you. On a manual install, copy `skill/SKILL.md` to `.claude/skills/designfit-fidelity-loop/SKILL.md` (skills aren't auto-loaded from an npm dependency).
- **A Figma frame picked.** Start simple — a card or a button row.

## The loop

The `designfit-fidelity-loop` skill drives it; the shape is:

1. **Extract the spec** with `designfit_extract` from the frame's Figma link. It returns the `DesignSpec`, the `componentMap`, and the `viewport`. (Without a token, the skill falls back to relaying the spec from the Figma MCP by hand.)
2. **Build** the frame in your dev app.
3. **Tag** each built element with `data-designfit-id="<figmaNodeId>"` so designfit can locate it in the DOM.
4. **Validate** — call `designfit_validate` with `{ url, viewport, design, componentMap }`.
5. **Fix** the reported violations (errors first; `warn`s are advisory — hardcoded values with no Figma token).
6. **Repeat** from step 4 until `pass: true`.

## Copy-paste prompt

> Implement this Figma frame <paste the frame link> in our dev app running at `<DEV_URL>`. Use the
> `designfit-fidelity-loop` skill: call `designfit_extract` with the link to get the design spec, component
> map, and viewport; build the frame, tagging every element with `data-designfit-id` matching its Figma node
> id from the component map; run `designfit_validate` against the running URL; fix the reported violations;
> repeat until `pass: true`. **Print the full validation result (score + violations) after every iteration**
> so I can watch it converge.

## What good looks like

- **Convergence, not oscillation** — the score should climb toward `pass` and then *stop*. If fixing A re-breaks B round after round, that points to a tolerance or mapping issue (see below), not something to keep retrying.
- **Faithful spec**: the node ids, tokens, and frame sizes in the extracted spec should match what you see in Figma. A token missing from the spec usually means the value is a gradient, image, or effect, which extract skips; a token present but only warning means it is not bound to a Figma variable or style.
- **Autonomy** — a well-mapped frame should reach `pass: true` without hand-holding.

Try it on 2–3 frames of increasing complexity (button row → card → small form) to build confidence in the mapping.

## Troubleshooting

- **Element reported missing (`unmapped.inDesignNotFound`)** — the `data-designfit-id` doesn't match the `figmaNodeId`, or a `selector` override is wrong.
- **Persistent geometry errors that look correct** — confirm the `viewport` matches the Figma frame size; boxes are compared relative to the screen root.
- **A mismatch shows as `warn`, not `error`** — that property is hardcoded in the build (no `tokenSources` entry). Bind it to a token to enforce it, or leave it if intentional.
- **Fixes fighting each other** — capture the per-iteration results; if two properties trade blame across rounds, that's worth filing as an issue (with the captures) rather than retrying.
