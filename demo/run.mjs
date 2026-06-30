// demo/run.mjs
//
// Drives the real designfit measure -> validate pipeline against demo/app and
// captures both the JSON result and a screenshot per iteration. Usage:
//
//   node demo/run.mjs <label>
//
// Reuses the same approach as scripts/smoke.mjs: bundle the exported
// `runValidation` seam from src/server.ts with esbuild (the dist/ build is an
// executable MCP server with no exports), serve demo/app over an ephemeral
// localhost port, validate, then snapshot the page. Writes to demo/captures/.

import { createServer as createHttpServer } from "node:http";
import { readFile, mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const appDir = join(__dirname, "app");
const capturesDir = join(__dirname, "captures");
const seamEntry = join(repoRoot, "src", "server.ts");
const label = process.argv[2] || "run";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

async function loadRunValidation() {
  const outDir = await mkdtemp(join(repoRoot, ".smoke-"));
  const outFile = join(outDir, "seam.mjs");
  await build({
    entryPoints: [seamEntry],
    outfile: outFile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    packages: "external",
    logLevel: "silent",
  });
  const mod = await import(pathToFileURL(outFile).href);
  if (typeof mod.runValidation !== "function") {
    throw new Error("runValidation seam not found in src/server.ts export");
  }
  return { runValidation: mod.runValidation, cleanup: () => rm(outDir, { recursive: true, force: true }) };
}

function serveDir(dir) {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createHttpServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        const rel = urlPath === "/" ? "/index.html" : urlPath;
        const filePath = join(dir, rel.replace(/^\/+/, ""));
        if (!resolve(filePath).startsWith(resolve(dir))) {
          res.writeHead(403).end("Forbidden");
          return;
        }
        const fileBody = await readFile(filePath);
        res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
        res.end(fileBody);
      } catch {
        res.writeHead(404).end("Not Found");
      }
    });
    server.on("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolvePromise({ baseUrl: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

async function main() {
  const spec = JSON.parse(readFileSync(join(__dirname, "design.json"), "utf-8"));
  const { runValidation, cleanup } = await loadRunValidation();
  const { baseUrl, close } = await serveDir(appDir);
  const url = `${baseUrl}/index.html`;
  await mkdir(capturesDir, { recursive: true });

  let result;
  try {
    result = await runValidation({
      url,
      viewport: spec.viewport,
      design: spec.design,
      componentMap: spec.componentMap,
      tolerances: spec.tolerances,
    });

    const browser = await chromium.launch();
    try {
      const ctx = await browser.newContext({ viewport: spec.viewport, deviceScaleFactor: 4 });
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: "load" });
      await page.evaluate(() => (document.fonts ? document.fonts.ready : null)).catch(() => {});
      const cardEl = await page.$("#card");
      await (cardEl ?? page).screenshot({ path: join(capturesDir, `${label}.png`) });
    } finally {
      await browser.close();
    }
  } finally {
    await close();
    await cleanup();
  }

  await writeFile(join(capturesDir, `${label}.json`), JSON.stringify(result, null, 2));

  const errors = result.violations.filter((v) => v.severity === "error");
  const warns = result.violations.filter((v) => v.severity === "warn");
  console.log(`\n[${label}]  pass=${result.pass}  score=${result.score}  errors=${errors.length}  warns=${warns.length}\n`);
  for (const v of result.violations) {
    console.log(`  ${v.severity === "error" ? "✗" : "•"} ${v.check}/${v.property} on ${v.component}  ${v.delta}${v.expected.source ? `  [${v.expected.source}]` : ""}`);
  }
  if (result.unmapped.inDesignNotFound.length || result.unmapped.inDomNotMapped.length) {
    console.log(`  unmapped:`, JSON.stringify(result.unmapped));
  }
  console.log(`\n  capture -> demo/captures/${label}.png`);
  console.log(`  result  -> demo/captures/${label}.json\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
