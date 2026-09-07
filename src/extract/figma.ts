// src/extract/figma.ts
import type { FigmaNodesResponse } from "./figmaTypes";

const API = "https://api.figma.com/v1";

/** https://www.figma.com/design/<fileKey>/<name>?node-id=1-2  ->  { fileKey, nodeId: "1:2" } */
export function parseFigmaUrl(url: string): { fileKey: string; nodeId: string } {
  const u = new URL(url);
  const m = u.hostname.endsWith("figma.com") ? u.pathname.match(/^\/(?:design|file|proto)\/([A-Za-z0-9]+)/) : null;
  if (!m) throw new Error(`not a Figma file link: ${url}`);
  const nodeParam = u.searchParams.get("node-id");
  if (!nodeParam) throw new Error(`Figma link has no node-id query param (select a frame and copy its link): ${url}`);
  return { fileKey: m[1]!, nodeId: nodeParam.replace(/-/g, ":") };
}

function get(path: string, token: string, fetchImpl: typeof fetch): Promise<Response> {
  return fetchImpl(`${API}${path}`, { headers: { "X-Figma-Token": token } });
}

export async function fetchNodes(
  fileKey: string,
  nodeId: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FigmaNodesResponse> {
  const res = await get(`/files/${encodeURIComponent(fileKey)}/nodes?ids=${encodeURIComponent(nodeId)}`, token, fetchImpl);
  if (res.status !== 200) throw new Error(`Figma API returned ${res.status} fetching nodes for file ${fileKey}`);
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
