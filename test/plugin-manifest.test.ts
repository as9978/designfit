// test/plugin-manifest.test.ts
//
// The Claude Code plugin ships designfit's version in three independent places:
// package.json, the plugin manifest's `version`, and the npx spec the manifest
// uses to launch the MCP server. `version` in plugin.json pins plugin updates,
// so if these drift a user is told they are on one version while running another.
// These tests make that invariant structural instead of a release-checklist note.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(__dirname, "..");
const read = (rel: string) => JSON.parse(readFileSync(join(repoRoot, rel), "utf-8"));

const pkg = read("package.json");
const plugin = read(".claude-plugin/plugin.json");
const marketplace = read(".claude-plugin/marketplace.json");

const minor = (version: string) => version.split(".").slice(0, 2).join(".");

describe("Claude Code plugin manifest", () => {
  it("declares the same version as package.json", () => {
    expect(plugin.version).toBe(pkg.version);
  });

  it("launches the MCP server at a spec that resolves to the shipped version", () => {
    const args: string[] = plugin.mcpServers.designfit.args;
    const spec = args.find((a) => a.startsWith(`${pkg.name}@`));
    expect(spec, `no ${pkg.name}@<range> arg in ${JSON.stringify(args)}`).toBeDefined();

    // The pin is a minor range (e.g. designfit@0.1), so patches flow to plugin
    // users but a minor — which may add tool surface — never arrives unannounced.
    const range = spec!.slice(`${pkg.name}@`.length);
    expect(range).toBe(minor(pkg.version));
  });

  it("points `skills` at a directory that really holds a SKILL.md", () => {
    for (const dir of plugin.skills as string[]) {
      expect(existsSync(join(repoRoot, dir, "SKILL.md")), `${dir}SKILL.md missing`).toBe(true);
    }
  });

  it("feeds the Figma token from userConfig into the MCP server env", () => {
    expect(plugin.userConfig.figma_token.sensitive).toBe(true);
    expect(plugin.userConfig.figma_token.required).toBe(false);
    expect(plugin.mcpServers.designfit.env.FIGMA_TOKEN).toBe("${user_config.figma_token}");
  });

  it("matches the version the MCP server announces on handshake", () => {
    const server = readFileSync(join(repoRoot, "src/server.ts"), "utf-8");
    expect(server).toContain(`version: "${pkg.version}"`);
  });
});

describe("Claude Code marketplace manifest", () => {
  it("lists the plugin under the name the plugin manifest declares", () => {
    const names = marketplace.plugins.map((p: { name: string }) => p.name);
    expect(names).toContain(plugin.name);
  });

  it("points every plugin source at a directory containing a plugin manifest", () => {
    for (const entry of marketplace.plugins as Array<{ source: string }>) {
      const manifest = join(repoRoot, entry.source, ".claude-plugin", "plugin.json");
      expect(existsSync(manifest), `${entry.source} has no .claude-plugin/plugin.json`).toBe(true);
    }
  });
});
