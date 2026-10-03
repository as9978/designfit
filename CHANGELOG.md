# Changelog

All notable changes to designfit. Pre-1.0, minors add features and patches fix bugs; the
`designfit_validate` contract only gains optional fields.

## 0.2.1 - 2026-10-03

### Fixed

- Extract reads Figma's per-side stroke weights (`individualStrokeWeights`). A bottom-only border
  is no longer expected on top, and a 4px top border is no longer expected as 1px.
- CSS `letter-spacing: normal` measures as 0px instead of no value, so Figma text with
  `letterSpacing: 0` no longer raises a warning.

## 0.2.0 - 2026-10-03

### Added

- `designfit_extract` MCP tool: turns a Figma frame into the `{ design, componentMap, viewport }`
  input `designfit_validate` expects. Accepts a Figma link, `fileKey` + `nodeId`, or a pasted
  `GET /v1/files/:key/nodes` body. Fetching needs a Figma personal access token in `FIGMA_TOKEN`.
- Bound Figma variables and published styles become `tokenSources`, so those properties are
  enforced as errors. Variable names resolve on Enterprise plans; other plans keep the raw
  `VariableID`.
- Claude Code plugin (`/plugin install designfit@designfit`), which registers both tools and the
  skill and prompts for the Figma token.
- `server.json` and `mcpName` for the official MCP Registry.

### Changed

- The fidelity-loop skill and docs are extract-first; relaying the spec from Figma's MCP by hand
  is now the fallback.
- A color whose alpha rounds to `00` counts as fully transparent on both the design and the
  measured side.

## 0.1.0 - 2026-07-01

First public release: `designfit_validate` MCP tool (token, geometry, and presence checks against
a rendered page) and the `designfit-fidelity-loop` skill.
