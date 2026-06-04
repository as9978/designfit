# designfit

**Validate AI-built front-ends against their Figma design — without the screenshot-diff thrash.**

`designfit` is an MCP server + Claude Code skill that checks a rendered implementation against its Figma design and hands the coding agent a machine-actionable fix-list. It compares **design tokens** and **geometry** (element boxes relative to the screen root) — not raw pixels — so font-rendering noise never makes the agent oscillate. Deterministic in, deterministic out.

[![CI](https://github.com/as9978/designfit/actions/workflows/ci.yml/badge.svg)](https://github.com/as9978/designfit/actions/workflows/ci.yml)

## Why geometry, not pixels

Screenshot-diffing an AI-built UI against a Figma frame thrashes: anti-aliasing and sub-pixel shifts read as "still wrong," so the agent fixes forever. designfit compares what a designer actually catches — wrong colors, wrong sizes, misalignment, missing elements — as **deterministic measurements with explicit tolerances**. Same input, same output, no oscillation.

## Install

```bash
npm install -g designfit
npx playwright install chromium
```

Add to your MCP client (e.g. Claude Code):

```json
{ "mcpServers": { "designfit": { "command": "designfit" } } }
```

> **Windows:** some MCP clients can't spawn a bare `designfit` (it resolves to `designfit.cmd`). Use `{ "command": "npx", "args": ["-y", "designfit"] }`, or point at the binary directly with `{ "command": "node", "args": ["<absolute-path>/node_modules/designfit/dist/index.js"] }`.

## Use

Connect Figma's MCP too, then ask your agent to implement a frame. The `designfit-fidelity-loop` skill drives: build → tag elements with `data-designfit-id` → `designfit_validate` → fix → repeat until `pass`.

The skill ships in the package at `skill/SKILL.md`. Skills aren't auto-loaded from an npm dependency — copy it into your agent's skills directory (for Claude Code: `.claude/skills/designfit-fidelity-loop/SKILL.md`) so it can be discovered.

The one tool, `designfit_validate`, takes `{ url, viewport, design, componentMap, tolerances? }` and returns `{ pass, score, violations, unmapped }`.

## v1 scope

One viewport. Token + geometry + presence checks. Responsive multi-breakpoint and a perceptual VLM fallback are on the roadmap, not in v1.

## License

MIT
