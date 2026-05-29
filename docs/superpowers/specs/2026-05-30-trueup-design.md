# trueup — Design Spec

**Date:** 2026-05-30
**Status:** Design approved in brainstorm; pending spec review → implementation plan.
**Name:** `trueup` (confirmed available on npm 2026-05-30). Working metaphor: to "true up" = bring into precise alignment.

---

## One-liner

An open-source MCP server + Claude Code skill that lets an AI coding agent **validate a front-end implementation against its Figma design inside its own build loop**, returning a deterministic, machine-actionable fix-list — so AI-generated UIs converge to design fidelity **without the screenshot-diff oscillation** that has killed every prior attempt.

---

## Problem & why now

Handing a Figma design to an AI coding agent (Claude Code, Cursor, v0, Lovable, Figma Make) produces UI that is *approximately* right. The last mile to fidelity is manual, slow, and undone by the fact that the agent has no reliable way to check its own work against the design. As AI codegen volume explodes, the volume of "approximately-right" UI explodes with it — so the demand for trustworthy validation is a rising tide.

Prior attempts at automated Figma-vs-implementation checking that use **raw screenshot pixel-diffing** hit font-rendering noise (anti-aliasing, hinting, sub-pixel shifts). In an agent loop this causes **oscillation**: fix → re-diff → "still wrong" → fix → forever. Experienced practitioners (e.g. Vadim's widely-cited writeup, Builder.io's posts) concluded screenshot-diff is the *wrong primitive* for design compliance and abandoned it.

## Goal & success criteria

- **Primary goal:** reputation / adoption. A respected open-source tool with real users. *Not* a monetization play.
- **Success metric:** stars + real users + the project being cited/shared as "the right way to do design-fidelity checking for agents."
- **Constraints:** solo maintainer, ~5–10 hrs/week, day job. Strength: building. Weakness: sustained marketing → so the design front-loads marketing into one launch + an evergreen post, and keeps ongoing work building-adjacent (issues/PRs).

## Competitive landscape (research 2026-05-30) & the wedge

**What already exists:**
- **`figma-console-mcp` → `figma_check_design_parity`** (MIT, ~1.7k★, actively maintained): compares a component's *tokens* (color/type/spacing/border/shadow) against Figma, emits a scored fix-list. **Owns the token-audit half.** But it is *static code-vs-spec only* — no browser render, no visual/geometric diff, no loop.
- **Pix (skobak/pix)** Claude Code skill: runs an agent self-correction loop using `getComputedStyle` numerical deltas. **Owns the agent-loop + computed-style half.** But no rendered geometric/composition diff, not a hardened MCP.
- **Applitools Figma plugin** (commercial, GA): exports a Figma frame as baseline, diffs the live build with mature, noise-tolerant "Visual AI." **Owns the perceptual-pixel approach** — a ~decade moat. Human-in-the-loop QA dashboard, not agent-native.

**The unclaimed wedge:** No OSS tool fuses **deterministic geometric/layout conformance** (rendered DOM bounding boxes vs Figma node frames, scaffolded by the component map) with token conformance, in a **closed agent loop**, shipped as an **MCP**.

**Platform risk:** Figma ships every primitive a validator needs (`get_metadata`, `get_variable_defs`, `get_screenshot`) plus Code Connect; it could absorb this. Treat as a ~18-month window — be early and loud, not permanent.

**Honest success-chance read:** As a generic "hybrid fidelity validator," low — it's a me-too behind an active OSS incumbent + a commercial leader. Narrowed to *the deterministic geometric-conformance loop with the anti-oscillation angle as the headline*, it is a real, finishable, defensible reputation bet — because the difficulty/insight itself is the marketing.

## Core insight — geometry over pixels

The open wedge is open because everyone tried raw pixel-diff and hit noise. The move they missed:

> **Stop diffing pixels. Diff geometry.**

What a designer actually catches that a token-checker misses is never "the anti-aliasing is 2% off." It is *"that's 40px too wide," "those are misaligned," "the gap is wrong," "this overflowed," "that element is missing."* **All geometric — and geometry is deterministic and noise-free.** You get Figma node frames from `get_metadata`, the rendered DOM's `getBoundingClientRect()` from Playwright, align them by the agent-supplied component map, and compare *relative* layout. No glyphs, no anti-aliasing, no oscillation.

This converts the hard part from an **ML research problem** (noise-tolerant pixel AI — Applitools' moat) into an **engineering problem** a strong builder finishes in bursts.

## Architecture

**Division of labor (key decision):**
- The **implementation is measured directly by trueup** via headless Playwright — the hard guarantee: the tool sees the *real rendered result*, not what the agent claims it built.
- The **design spec is relayed by the agent** from Figma's official MCP. Geometry/tokens are objective facts the agent merely reads → trusting the relay is low-risk, and it means **no second Figma auth** (near-zero adoption friction). Direct-Figma-fetch is a v2 power-user option.
- The **comparison is trueup's** — fully deterministic.

**Components:**
```
trueup (MCP server)
├─ Tool surface        → what the agent calls (one tool for v1)
├─ Measurement engine  → Playwright: getBoundingClientRect + getComputedStyle per element
├─ Comparison engine   → 3 deterministic checks (pure functions)
└─ Fix-list formatter  → structured, machine-actionable output
```

**The three checks (v1 = all three deterministic; perceptual VLM = v2):**
1. **Token conformance** — computed color / type-scale / radius / etc. vs Figma tokens.
2. **Geometric conformance** — element bounding boxes vs Figma node frames, compared as *relative* layout (gaps, alignment, relative sizes) + absolute-within-frame (valid at a fixed viewport), scaffolded by the component map. ← the unclaimed core.
3. **Presence** — every mapped component exists; flag missing or unexpected-extra.

## End-to-end flow (one validation run)

```
agent builds screen from Figma  →  dev server running at URL
        │  (agent tags elements with data-plumb-id as it builds)
        ▼
agent calls trueup.validate(design, url, componentMap, viewport)
        ▼
trueup drives Playwright → measures each mapped element
        ▼
trueup runs 3 checks → returns ValidationResult (score + fix-list)
        ▼
agent applies fixes → calls validate again → loop until pass (or budget)
```

**Deployment constraint:** trueup must be able to launch a browser and reach the running app URL from where the MCP server runs (local dev: trivial; sandboxed/remote agents: dev server must be reachable). Documented assumption.

## Tool surface & data contracts

**One tool for v1:**
```ts
trueup_validate({
  url: string;                    // running app URL for the screen
  viewport: { width: number; height: number };
  design: DesignSpec;             // normalized from Figma MCP by the agent
  componentMap: MapEntry[];       // Figma node ↔ DOM element
  tolerances?: Tolerances;        // optional; sensible defaults
}) => ValidationResult
```

**Contract A — `DesignSpec` (input).** trueup defines its own normalized shape; the skill instructs the agent how to populate it from Figma MCP output. Decouples trueup from Figma's raw (changing) format.
```ts
type DesignNode = {
  id: string;            // Figma node id
  name: string;          // "Button/Primary"
  frame: { x: number; y: number; w: number; h: number }; // within the design frame
  tokens: {              // resolved Figma variable values
    fill?: string; color?: string; fontFamily?: string; fontSize?: number;
    fontWeight?: number; lineHeight?: number; letterSpacing?: number;
    borderRadius?: number; borderColor?: string; borderWidth?: number;
    gap?: number; padding?: { t: number; r: number; b: number; l: number };
    // ...extensible
  };
  children: DesignNode[];
};
type DesignSpec = { root: DesignNode };
```

**The component map** — `data-plumb-id` attributes over raw CSS selectors. The agent adds `data-plumb-id="<figmaNodeId>"` to elements as it builds (it knows the mapping then); robust to restyling.
```ts
type MapEntry = { figmaNodeId: string; selector: string }; // selector defaults to [data-plumb-id="<id>"]
```

**Contract B — `ValidationResult` (output, the fix-list):**
```ts
type ValidationResult = {
  pass: boolean;
  score: number;                 // 0–100 fidelity — stop condition + shareable badge
  viewport: { width: number; height: number };
  violations: Violation[];
  unmapped: { inDesignNotFound: string[]; inDomNotMapped: string[] };
};

type Violation = {
  component: string;             // "Button/Primary" + nodeId
  check: "token" | "geometry" | "presence";
  property: string;              // "fill" | "width" | "gap-to-sibling" | "fontSize" | ...
  expected: { value: string; source: string };  // source = Figma token name, e.g. "color/primary"
  actual: { value: string };
  delta: string;                 // "+40px (560 vs 520)" — human + machine readable
  severity: "error" | "warn";
  fixHint: string;               // "use token color/primary (#1D4ED8)" / "reduce width to 520px"
};

type Tolerances = {
  geometry?: { position?: number; size?: number; gap?: number }; // px, defaults ±2
  color?: { deltaE?: number };                                   // default ΔE ≤ 2
  fontSize?: { px?: number };                                    // default ±1
};
```

**Three design decisions & rationale:**
1. **Explicit, tunable `tolerances`** are the deterministic answer to the noise problem: honest documented thresholds instead of an ML model guessing what's "meaningful." Sub-pixel rounding never trips a false positive. This is the anti-oscillation mechanism, made legible.
2. **`expected.source` carries the Figma token name**, not just a hex — makes fixes *semantic* ("use `color/primary`") instead of magic-number whack-a-mole. The thing that actually closes the loop.
3. **`score` (0–100)** gives the loop a clean stop condition and a shareable README badge — a free marketing surface.

## Tech stack

- **TypeScript + Node**, published to **npm**, runnable via `npx`.
- **`@modelcontextprotocol/sdk`** (official MCP TS SDK).
- **Playwright (Chromium)** for measurement — `page.evaluate` → `getBoundingClientRect` + `getComputedStyle`. Single engine = determinism.
- **Zod** for boundary validation (also generates the tool JSON schema).
- **`culori`** (or a small CIEDE2000 fn) for perceptual color distance (ΔE).
- **Vitest** for tests. Single package, no monorepo. `tsup` to build.
- Ships from one codebase as: the **MCP server**, a **Claude Code skill** (teaches the agent the build→tag→validate→fix loop), and the underlying npm CLI.

## Scope — v1 / v2 line (YAGNI)

| Dimension | v1 (ship & launch) | v2+ (deferred) |
|---|---|---|
| Viewport | One fixed breakpoint | Responsive / multi-breakpoint (relative-only geometry) |
| Checks | Token + Geometry + Presence | Perceptual VLM fallback (layer 3) |
| Map | Agent-supplied `data-plumb-id` | Auto-inference (no map needed) |
| Design data | Agent-relayed from Figma MCP | Direct-Figma-fetch mode |
| Surface | MCP + Claude Code skill | GitHub Action (reuse engine) |
| Browser | Chromium only | Multi-engine |

The two most *exciting-sounding* features — **responsive** and the **VLM** — are deliberately v2, to protect the maintainer's quit-window with a shippable artifact early.

## Error handling

Principle: **never crash, always return something actionable.**
- Mapped element not found → a `presence` violation, not an exception.
- Dev server unreachable / page timeout → clear error ("couldn't reach {url}"), bounded configurable timeout.
- Malformed `DesignSpec` → precise Zod error at the boundary.
- Figma node with a hardcoded (non-token) value → skip that property's token check, emit a `warn`, don't fail.
- No Chromium installed → detect at startup, instruct `npx playwright install`.
- trueup is **stateless per call** and deterministic (same input → identical output), which is what lets the agent detect "score not improving → stop."

## Testing strategy

- **Comparison engine = pure deterministic functions → built test-first (TDD).** Fixture `DesignSpec` + fixture measurements → asserted fix-list.
- **Integration:** a tiny static HTML fixture page measured by real Playwright → asserted violations (proves measurement engine).
- **Golden tests:** a "perfect" impl → score 100, zero violations; a "deliberately-off" impl → exact expected violations. These double as launch demo material.
- **Determinism test:** same input twice → byte-identical output. This test *is* the anti-oscillation guarantee, encoded.

## Distribution & launch

- The launch artifact **is the demo**: a repo with a sample Figma frame + an intentionally-wrong implementation + a short recording of the loop converging cleanly — headlined on "no oscillation."
- One evergreen blog post: *"Why screenshot-diffing AI-built UIs thrashes — and how geometry fixes it."* The shareable thing that does the marketing.
- Seed: Show HN, MCP directories (mcp.so, glama, smithery, awesome-mcp-servers), dev-X. README carries a fidelity-score badge.

## Risks & open questions

- **Responsive makes geometry relative, not absolute** — v1 sidesteps via fixed viewport; v2 compares layout *relationships*. The real engineering meat is here.
- **Map reliability gates everything** — if the agent maps wrongly, comparisons are meaningless (though a wrong map tends to self-surface as huge deltas).
- **Platform risk (Figma)** — accept it; be early.
- **Adoption still requires the launch burst** — no architecture removes this; it's front-loaded by design.
- **Open question:** exact `DesignSpec` normalization recipe from Figma MCP output (to be specified in the implementation plan).
- **Open question:** how to express "relative geometry" violations precisely (sibling gaps, alignment groups) in the v1 algorithm — needs a concrete spec in the plan.

## What this is NOT (anti-scope)

- Not a baseline visual-regression tool (that space is solved/commoditized — Percy, Chromatic, Applitools, BackstopJS).
- Not a code generator (Figma→code generation is owned by builder.io/Anima/Locofy/Kombai).
- Not a perceptual pixel-diff engine (Applitools' moat; v1 explicitly avoids it).
- Not a monetized SaaS.
