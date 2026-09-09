# Roadmap

This is the direction, not a schedule. There are no dates here on purpose: designfit is
maintained by one person, the order below is driven by what actually breaks for people using
it, and some of what's listed under *Exploring* may never ship. What you can rely on is the
rule at the bottom.

## Where v0.2 stands

designfit does four things today, against **one viewport**: the breakpoint the Figma frame
was designed at.

**Extract** (`designfit_extract`): turns a Figma frame into the `DesignSpec` + `componentMap` +
`viewport` that validate consumes, from a Figma link (REST API, `FIGMA_TOKEN`) or from pasted
`/nodes` JSON. Bound variables and published styles become `tokenSources`, so the enforced set is
the designer's, not the agent's. Deterministic: same node JSON in, same spec out.

**Design tokens** — eleven resolved properties: `fill`, `color`, `fontFamily`, `fontSize`,
`fontWeight`, `lineHeight`, `letterSpacing`, `borderRadius`, `borderColor`, `borderWidth`,
`opacity`. Colors are compared with CIEDE2000 (ΔE) so imperceptible differences don't read as
failures; numeric tokens are compared in pixels.

**Geometry** — each element's `x`, `y`, `width`, `height`, measured relative to the screen root
rather than the viewport, so a correctly built screen that happens to be globally offset still
passes.

**Presence** — whether each element the design expects is in the DOM, and whether anything
tagged isn't in the design.

A mismatch on a property bound to a Figma variable is an `error`. A mismatch on a hardcoded
literal is a `warn` — it appears in the fix-list but doesn't fail the run or affect the score,
because a value with no token behind it can only ever be fixed to a magic number. Geometry is
always an `error`. `pass` is true when there are zero errors.

### Not in v0.2, deliberately

- **Responsive validation.** One viewport per call. Multi-breakpoint is the v1.0 line below.
- **Perceptual judgment.** Nothing fuzzy sits in the pass/fail path. See the rule at the bottom.
- **Spacing as named tokens.** Wrong padding and gaps are caught today, but only as geometry
  deltas — you get `width: +60px`, not `gap: expected 16px (spacing/md), got 24px`.

## Next

Roughly in this order. Each one extends the deterministic core.

1. **Spacing tokens.** `padding*` and `gap`/`itemSpacing` from Figma auto-layout as first-class
   token checks, so spacing violations name the token instead of reading as a box delta. This is
   the largest gap in the current property set.
2. **CLI + CI mode.** A `designfit validate --config` subcommand with exit codes, JSON output,
   and `--baseline` score-regression comparison, plus a published GitHub Action. Turns designfit
   from a build-loop tool into a regression guard on every PR.
3. **Shadows, gradients, per-corner radii.** `box-shadow` against Figma effects, gradient fills
   by stops and angle, and all four corner radii — today only the top-left is compared.

## Exploring

Genuinely uncertain. Listed so you know it's been considered, not so you can plan around it.

- **Tokenless extract**: parse Figma MCP `get_metadata` output so extract works without a REST
  token. Geometry only (that output carries no fills or typography) on an undocumented format;
  worth it only if people cannot get a token.
- **Auto-mapping** — propose the `componentMap` by matching DOM against design nodes on geometry
  and text content, for the agent to confirm. Aimed at the biggest adoption friction: tagging
  every element with `data-designfit-id` by hand.
- **Human-readable output** — an HTML overlay report with design boxes drawn over a screenshot
  and violations annotated, suitable for pasting into a PR. Plus WCAG contrast warnings, which
  are nearly free since colors are already resolved per node.
- **Interaction states** — hover, focus, and disabled driven through Playwright and compared
  against the matching Figma variants.
- **Responsive multi-breakpoint** — viewport and frame pairs in one call, with per-breakpoint
  results. This is the v1.0 line, and it's where the tool contract freezes.
- **Perceptual fallback** — a VLM layer for the visual judgments geometry and tokens can't
  capture. Advisory only, always.
- **Other inputs** — W3C DTCG token files, Penpot as a design source, watch mode, and framework
  helpers that inject tags for you.

## The rule that governs all of it

**Everything in the pass/fail path stays deterministic.** Same input, same output — that's the
whole reason designfit works as an agent feedback loop instead of something to thrash against.
If a check can't be measured deterministically, it doesn't get to fail your build and it doesn't
enter the score. Perceptual checks, if they ever land, only layer on top as advisory.

Pre-1.0, minors add features and patches fix bugs. The `designfit_validate` contract only ever
gains optional fields before 1.0; any breaking schema change gets a minor bump and a loud
CHANGELOG note.

## Moving something up this list

The fastest way: [open an issue](https://github.com/as9978/designfit/issues) with a concrete case
where designfit missed a mismatch a designer would have caught, or flagged one that wasn't real.
Real failures reorder this list faster than feature requests do. PRs are welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md).
