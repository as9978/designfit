# designfit

**Validate AI-built front-ends against their Figma design — without the screenshot-diff thrash.**

https://github.com/user-attachments/assets/01df52c9-90eb-4abc-b56c-fe18b31076cd

A real run on a 360-node Figma frame: `designfit_extract` reads the frame from its link, then `designfit_validate` scores three build iterations, 87 to 89 to 100 `pass`. No screenshot diffing anywhere in it.

`designfit` is an MCP server + Claude Code skill that checks a rendered implementation against its Figma design and hands the coding agent a machine-actionable fix-list. It compares **design tokens** and **geometry** (element boxes relative to the screen root) — not raw pixels — so font-rendering noise never makes the agent oscillate. Deterministic in, deterministic out.

[![CI](https://github.com/as9978/designfit/actions/workflows/ci.yml/badge.svg)](https://github.com/as9978/designfit/actions/workflows/ci.yml)

## Why geometry, not pixels

Screenshot-diffing an AI-built UI against a Figma frame thrashes: anti-aliasing and sub-pixel shifts read as "still wrong," so the agent fixes forever. designfit compares what a designer actually catches — wrong colors, wrong sizes, misalignment, missing elements — as **deterministic measurements with explicit tolerances**. Same input, same output, no oscillation.

The long version: [Why screenshot-diffing AI-built UIs thrashes, and how geometry fixes it](https://dev.to/as9978/why-screenshot-diffing-ai-built-uis-thrashes-and-how-geometry-fixes-it-5967).

## Install

**Claude Code — as a plugin:**

```
/plugin marketplace add as9978/designfit
/plugin install designfit@designfit
```

Then once, to fetch the browser the measurement engine drives:

```bash
npx playwright install chromium
```

The plugin registers the `designfit_extract` and `designfit_validate` MCP tools and the `designfit-fidelity-loop` skill together, and asks once for a Figma personal access token (optional: without it, extract accepts pasted `/nodes` JSON).

**Any other MCP client — manually:**

```bash
npm install -g designfit
npx playwright install chromium
```

```json
{ "mcpServers": { "designfit": { "command": "designfit", "env": { "FIGMA_TOKEN": "<token>" } } } }
```

> **Windows:** some MCP clients can't spawn a bare `designfit` (it resolves to `designfit.cmd`). Use `{ "command": "npx", "args": ["-y", "designfit"] }`, or point at the binary directly with `{ "command": "node", "args": ["<absolute-path>/node_modules/designfit/dist/index.js"] }`. The plugin install above already uses the `npx` form, so it isn't affected.

## Use

Ask your agent to implement a Figma frame and give it the frame's link. The `designfit-fidelity-loop` skill drives: `designfit_extract` → build → tag elements with `data-designfit-id` → `designfit_validate` → fix → repeat until `pass` → strip the tags.

If you installed the plugin, the skill is already registered. On a manual install it isn't: skills aren't auto-loaded from an npm dependency, so copy the one that ships at `skill/SKILL.md` into your agent's skills directory (for Claude Code: `.claude/skills/designfit-fidelity-loop/SKILL.md`) so it can be discovered.

Two tools:

- `designfit_extract` takes a Figma link (`{ url }`), or `{ fileKey, nodeId }`, or a pasted `GET /v1/files/:key/nodes` body (`{ nodes }`), plus optional `maxDepth`, and returns `{ design, componentMap, viewport }`. Fetching needs `FIGMA_TOKEN` in the MCP server's environment. Hidden nodes are skipped and a frame made only of vectors is one leaf.
- `designfit_validate` takes `{ url, viewport, design, componentMap, tolerances? }` and returns `{ pass, score, violations, unmapped }`.

For a full walkthrough on a real Figma frame — the loop, a copy-paste prompt, and troubleshooting — see [docs/validating-a-figma-frame.md](docs/validating-a-figma-frame.md).

## v1 scope

One viewport. Token + geometry + presence checks. Responsive multi-breakpoint and a perceptual VLM fallback are on the roadmap, not in v1.

## License

MIT
