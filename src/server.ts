// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { measure } from "./measure";
import { validate } from "./compare/engine";
import { mergeTolerances, toolInputShape, extractInputShape, ExtractInputSchema, type ToolInput } from "./schema";
import type { ValidationResult } from "./types";
import { toSpec, type ExtractResult, type ToSpecOptions } from "./extract/toSpec";
import { parseFigmaUrl, fetchNodes, fetchVariableNames } from "./extract/figma";
import type { FigmaNodesResponse } from "./extract/figmaTypes";

const DESCRIPTION =
  "Validate a rendered front-end against its Figma design. Tag each built element with " +
  'data-designfit-id="<figmaNodeId>", pass the design spec (geometry + tokens, from ' +
  "designfit_extract or relayed from Figma's MCP), the running URL, and the component map. Returns a " +
  "fidelity score and a machine-actionable fix-list of token, geometry, and presence violations.";

const EXTRACT_DESCRIPTION =
  "Turn a Figma frame into the design spec designfit_validate expects. Give it a Figma link " +
  "(https://www.figma.com/design/<fileKey>/...?node-id=...), or fileKey + nodeId, and it fetches the " +
  "node via Figma's REST API using the FIGMA_TOKEN env var; or paste the raw GET /v1/files/:key/nodes " +
  "response as `nodes` and nothing is fetched. Returns { design, componentMap, viewport }: add `url` and " +
  "call designfit_validate. Deterministic. Hidden nodes are skipped; a frame made only of vectors is one " +
  "leaf (an icon). `maxDepth` limits how deep to go.";

/** Testable seam: the full measure -> validate pipeline, no MCP plumbing. */
export async function runValidation(args: ToolInput): Promise<ValidationResult> {
  const tol = mergeTolerances(args.tolerances);
  const m = await measure(args.url, args.viewport, args.componentMap);
  return validate(args.design, m, args.componentMap, args.viewport, tol);
}

export interface ExtractDeps {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}

/** Testable seam: parse -> (fetch) -> toSpec. `deps` exist so tests never touch the network. */
export async function runExtract(raw: unknown, deps: ExtractDeps = {}): Promise<ExtractResult> {
  const args = ExtractInputSchema.parse(raw);
  const opts: ToSpecOptions = { maxDepth: args.maxDepth };
  if (args.nodes) return toSpec(args.nodes as FigmaNodesResponse, args.nodeId, opts);

  // Safe: ExtractInputSchema's superRefine guarantees exactly one source and nodeId with fileKey.
  const { fileKey, nodeId } = args.url ? parseFigmaUrl(args.url) : { fileKey: args.fileKey!, nodeId: args.nodeId! };
  const token = (deps.env ?? process.env).FIGMA_TOKEN;
  if (!token?.trim() || token.includes("${")) {
    throw new Error(
      "FIGMA_TOKEN is not set on the designfit MCP server. Set it (a Figma personal access token), " +
        "or fetch GET https://api.figma.com/v1/files/<fileKey>/nodes?ids=<nodeId> yourself and pass the body as `nodes`.",
    );
  }
  const f = deps.fetchImpl ?? fetch;
  const [response, variableNames] = await Promise.all([
    fetchNodes(fileKey, nodeId, token, f, args.maxDepth),
    fetchVariableNames(fileKey, token, f).catch(() => ({}) as Record<string, string>),
  ]);
  return toSpec(response, nodeId, { ...opts, variableNames });
}

/** Wrap a seam call in the MCP result envelope; errors come back as isError text, never as a transport fault. */
async function toolResult(run: () => Promise<unknown>, toolName: string) {
  try {
    const result = await run();
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text" as const, text: `${toolName} failed: ${message}` }] };
  }
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "designfit", version: "0.2.1" });

  server.registerTool(
    "designfit_validate",
    { title: "Validate design fidelity", description: DESCRIPTION, inputSchema: toolInputShape },
    (args) => toolResult(() => runValidation(args as ToolInput), "designfit_validate"),
  );

  server.registerTool(
    "designfit_extract",
    { title: "Extract a design spec from Figma", description: EXTRACT_DESCRIPTION, inputSchema: extractInputShape },
    (args) => toolResult(() => runExtract(args), "designfit_extract"),
  );

  return server;
}
