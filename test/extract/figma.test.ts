// test/extract/figma.test.ts
import { describe, it, expect, vi } from "vitest";
import { parseFigmaUrl, fetchNodes, fetchVariableNames } from "../../src/extract/figma";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
type Fetch = typeof fetch;
/** A vi.fn fake with the (url, init) shape the client calls, castable to `typeof fetch`. */
const fakeFetch = (respond: () => Response) => vi.fn(async (_url: string, _init?: RequestInit) => respond());

describe("parseFigmaUrl", () => {
  it("reads fileKey and node-id from a design link, converting 1-2 to 1:2", () => {
    expect(parseFigmaUrl("https://www.figma.com/design/AbC123/Demo?node-id=12-34&m=dev")).toEqual({
      fileKey: "AbC123",
      nodeId: "12:34",
    });
  });
  it("accepts the legacy /file/ path", () => {
    expect(parseFigmaUrl("https://www.figma.com/file/AbC123/Demo?node-id=1-2").fileKey).toBe("AbC123");
  });
  it("rejects a link without node-id", () => {
    expect(() => parseFigmaUrl("https://www.figma.com/design/AbC123/Demo")).toThrow(/node-id/);
  });
  it("rejects a non-Figma link", () => {
    expect(() => parseFigmaUrl("https://example.com/design/AbC123?node-id=1-2")).toThrow(/Figma/);
  });
  it("rejects a look-alike host", () => {
    expect(() => parseFigmaUrl("https://evilfigma.com/design/AbC123/Demo?node-id=1-2")).toThrow(/Figma/);
  });
  it("accepts a figma.com subdomain", () => {
    expect(parseFigmaUrl("https://www.figma.com/design/AbC123/Demo?node-id=1-2").nodeId).toBe("1:2");
  });
});

describe("fetchNodes", () => {
  it("calls the nodes endpoint with the token header and returns the body", async () => {
    const f = fakeFetch(() => json({ nodes: { "1:2": null } }));
    const body = await fetchNodes("AbC123", "1:2", "tok", f as unknown as Fetch);
    expect(body).toEqual({ nodes: { "1:2": null } });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://api.figma.com/v1/files/AbC123/nodes?ids=1%3A2");
    expect((init!.headers as Record<string, string>)["X-Figma-Token"]).toBe("tok");
  });
  it("throws with the status and file key on a non-200", async () => {
    const f = fakeFetch(() => json({ err: "nope" }, 404));
    await expect(fetchNodes("AbC123", "1:2", "tok", f as unknown as Fetch)).rejects.toThrow(/404.*AbC123/);
  });
  it("explains a 403 as a token that cannot read the file", async () => {
    const f = fakeFetch(() => json({ err: "forbidden" }, 403));
    await expect(fetchNodes("AbC123", "1:2", "tok", f as unknown as Fetch)).rejects.toThrow(/403.*cannot read this file.*not retrying/);
  });
});

describe("fetchVariableNames", () => {
  it("maps variable ids to names", async () => {
    const f = fakeFetch(() => json({ meta: { variables: { "VariableID:10:1": { name: "color/primary" } } } }));
    expect(await fetchVariableNames("AbC123", "tok", f as unknown as Fetch)).toEqual({ "VariableID:10:1": "color/primary" });
  });
  it("returns {} on 403 (non-Enterprise plans) instead of failing the extract", async () => {
    const f = fakeFetch(() => json({ err: "forbidden" }, 403));
    expect(await fetchVariableNames("AbC123", "tok", f as unknown as Fetch)).toEqual({});
  });
});
