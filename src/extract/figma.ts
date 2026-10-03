// src/extract/figma.ts
import type { FigmaNodesResponse } from "./figmaTypes";

const API = "https://api.figma.com/v1";
const TIMEOUT_MS = 30_000;

/** Node ids never contain "-"; links write 1:2 as 1-2. */
export const normalizeNodeId = (nodeId: string) => nodeId.replace(/-/g, ":");

/**
 * https://www.figma.com/design/<fileKey>/<name>?node-id=1-2  ->  { fileKey, nodeId: "1:2" }.
 * A branch link (/design/<fileKey>/branch/<branchKey>/...) resolves to the branch key, which is what the REST API reads.
 */
export function parseFigmaUrl(url: string): { fileKey: string; nodeId: string } {
  const u = new URL(url);
  const m = /(^|\.)figma\.com$/.test(u.hostname)
    ? u.pathname.match(/^\/(?:design|file|proto)\/([A-Za-z0-9]+)(?:\/branch\/([A-Za-z0-9]+))?/)
    : null;
  if (!m) throw new Error(`not a Figma file link: ${url}`);
  const nodeParam = u.searchParams.get("node-id");
  if (!nodeParam) throw new Error(`Figma link has no node-id query param (select a frame and copy its link): ${url}`);
  return { fileKey: m[2] ?? m[1]!, nodeId: normalizeNodeId(nodeParam) };
}

function get(path: string, token: string, fetchImpl: typeof fetch): Promise<Response> {
  return fetchImpl(`${API}${path}`, { headers: { "X-Figma-Token": token }, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

export async function fetchNodes(
  fileKey: string,
  nodeId: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
  maxDepth?: number,
): Promise<FigmaNodesResponse> {
  // Figma counts depth from the requested node, so maxDepth levels below it is depth maxDepth + 1 (always >= 1).
  const depth = maxDepth === undefined ? "" : `&depth=${maxDepth + 1}`;
  const res = await get(`/files/${encodeURIComponent(fileKey)}/nodes?ids=${encodeURIComponent(nodeId)}${depth}`, token, fetchImpl);
  if (res.status !== 200) {
    const hint =
      res.status === 403 ? " (the token cannot read this file)" :
      res.status === 404 ? " (no file with this key)" : "";
    throw new Error(`Figma API returned ${res.status} fetching nodes for file ${fileKey}${hint}; not retrying`);
  }
  return (await res.json()) as FigmaNodesResponse;
}

/**
 * VariableID -> name. The /variables/local endpoint is Enterprise-only; any non-200
 * (403 on other plans) yields {} so callers fall back to raw ids rather than fail.
 */
export async function fetchVariableNames(
  fileKey: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, string>> {
  const res = await get(`/files/${encodeURIComponent(fileKey)}/variables/local`, token, fetchImpl);
  if (res.status !== 200) return {};
  const body = (await res.json()) as { meta?: { variables?: Record<string, { name: string }> } };
  const out: Record<string, string> = {};
  for (const [id, v] of Object.entries(body.meta?.variables ?? {})) out[id] = v.name;
  return out;
}
