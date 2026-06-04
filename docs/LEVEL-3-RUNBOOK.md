# Level-3 Runbook — real-frame fidelity loop

The make-or-break test: can a coding agent **converge** on a real Figma frame using
`designfit_validate`, without the screenshot-diff thrash? Levels 1–2 (the automated suite
and the isolated MCP call) prove the engine is correct; Level 3 proves the **thesis**.

> This is the go / no-go gate. **Converges cleanly → that recording is the launch demo.
> Oscillates, or the Figma relay is flaky → that's a pre-launch bug, not a launch.**

---

## Prerequisites

- [ ] `npm run build` is current (`dist/index.js` reflects the latest `src/`).
- [ ] **designfit MCP** registered in Claude Code (project `.mcp.json` → `node dist/index.js`).
- [ ] **Figma MCP** connected in the same session.
- [ ] A **dev server running** for the app you're implementing into (note its URL).
- [ ] The skill is discoverable: copy `skill/SKILL.md` to
      `.claude/skills/designfit-fidelity-loop/SKILL.md`.
- [ ] A **real Figma frame** picked. Start simple: a card or a button row.

## The loop

The `designfit-fidelity-loop` skill drives it, but the shape is:

1. **Relay the spec** — pull the frame's geometry + tokens from Figma MCP into a `DesignSpec`
   and a `componentMap` (one entry per element: `{ figmaNodeId, selector? }`).
2. **Build** the frame in the dev app.
3. **Tag** each built element with `data-designfit-id="<figmaNodeId>"` so designfit can locate it.
4. **Validate** — call `designfit_validate` with `{ url, viewport, design, componentMap }`.
5. **Fix** the reported violations (errors first; `warn`s are advisory — hardcoded values
   with no Figma token).
6. **Repeat** from step 4 until `pass: true`.

## Copy-paste prompt

> Implement this Figma frame [paste link / make the selection] in our dev app running at
> `<DEV_URL>`. Tag every element with `data-designfit-id` matching its Figma node id. Then use the
> `designfit-fidelity-loop` skill: relay the design spec + component map from the Figma MCP, run
> `designfit_validate` against the running URL, fix the reported violations, and repeat until
> `pass: true`. **Print the full validation result (score + violations) after every iteration**
> so I can watch it converge.

## What to observe

- **Convergence vs. oscillation** — does the score climb monotonically toward `pass` and then
  *stop*, or does fixing A re-break B in a loop?
- **Relay fidelity** — are the node ids, tokens, and frames coming out of Figma MCP correct and
  complete, or garbled/missing?
- **Autonomy** — does the agent reach `pass: true` on its own, or does it need hand-holding?

Run it on **2–3 frames of increasing complexity** (e.g. button row → card → small form).

## Pass / fail criteria

| Outcome | Meaning | Action |
|---|---|---|
| Converges cleanly on all 2–3 frames | The geometry-over-pixels bet holds in practice | **GO.** Record the loop converging — that's the launch demo. |
| Oscillates (fixes thrash) | Tolerances or comparison logic let fixes fight each other | Pre-launch bug. Diagnose before launch. |
| Relay drops / garbles the spec | Figma → `DesignSpec`/`componentMap` path is unreliable | Pre-launch bug. Harden the relay before launch. |

## Troubleshooting

- **Element reported missing (`unmapped.inDesignNotFound`)** — the `data-designfit-id` doesn't match
  the `figmaNodeId`, or a `selector` override is wrong.
- **Persistent geometry errors that look correct** — confirm the `viewport` matches the Figma
  frame size; boxes are compared relative to the screen root.
- **A mismatch shows as `warn` not `error`** — that property is hardcoded in the build (no
  `tokenSources` entry). Bind it to a token to enforce it, or leave it if intentional.
- **Oscillation** — capture the per-iteration results; if two properties trade blame across
  rounds, that's the bug to file, not something to keep retrying.
