// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { measure } from "./measure";
import { validate } from "./compare/engine";
import { mergeTolerances, toolInputShape, type ToolInput } from "./schema";
import type { ValidationResult } from "./types";

const DESCRIPTION =
  "Validate a rendered front-end against its Figma design. Tag each built element with " +
  'data-plumb-id="<figmaNodeId>", pass the design spec (geometry + tokens, relayed from ' +
  "Figma's MCP), the running URL, and the component map. Returns a fidelity score and a " +
  "machine-actionable fix-list of token, geometry, and presence violations.";

/** Testable seam: the full measure → validate pipeline, no MCP plumbing. */
export async function runValidation(args: ToolInput): Promise<ValidationResult> {
  const tol = mergeTolerances(args.tolerances);
  const m = await measure(args.url, args.viewport, args.componentMap);
  return validate(args.design, m, args.componentMap, args.viewport, tol);
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "trueup", version: "0.1.0" });

  server.registerTool(
    "trueup_validate",
    { title: "Validate design fidelity", description: DESCRIPTION, inputSchema: toolInputShape },
    async (args) => {
      try {
        const result = await runValidation(args as ToolInput);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text" as const, text: `trueup_validate failed: ${message}` }],
        };
      }
    },
  );

  return server;
}
