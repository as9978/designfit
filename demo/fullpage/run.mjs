// demo/fullpage/run.mjs
//
// Full-page variant of the designfit demo driver. Drives the real
// measure -> validate pipeline against a single html file in demo/fullpage/app
// and captures a FULL-PAGE screenshot + the JSON result per iteration. Usage:
//
//   node demo/fullpage/run.mjs <htmlFile> <label>
//
//   e.g.  node demo/fullpage/run.mjs build-v1.html iter1
//         node demo/fullpage/run.mjs index.html    iter3
//
// Like demo/run.mjs it bundles the exported `runValidation` seam from
// src/server.ts with esbuild, serves demo/fullpage/app over an ephemeral
// localhost port, validates, then snapshots the page. The page uses the
// Tailwind CDN (compiles in-browser AFTER load) so we wait for styling to
// settle and freeze animations before measuring/capturing. Writes to
// demo/fullpage/captures/.

import { createServer as createHttpServer } from "node:http";
import { readFile, mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const appDir = join(__dirname, "app");
const capturesDir = join(__dirname, "captures");
const seamEntry = join(repoRoot, "src", "server.ts");

const htmlFile = process.argv[2] || "index.html";
const label = process.argv[3] || "run";

// The converged build (index.html) lives in app/; iteration candidates like
// build-v1.html live one level up in demo/fullpage/. Resolve the requested html
// from whichever dir contains it. All non-html assets (none here — the page is
// fully CDN-driven) resolve from app/.
import { existsSync } from "node:fs";
function resolveEntry(file) {
  const inApp = join(appDir, file);
  if (existsSync(inApp)) return inApp;
  const inFullpage = join(__dirname, file);
  if (existsSync(inFullpage)) return inFullpage;
  return inApp; // let the 404 surface
}

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
        const reqName = urlPath === "/" ? htmlFile : urlPath.replace(/^\/+/, "");
        // The entry html is resolved across app/ and fullpage/; any other path
        // is an asset served strictly from app/ (and sandboxed to it).
        let filePath;
        if (reqName === htmlFile) {
          filePath = resolveEntry(htmlFile);
        } else {
          filePath = join(dir, reqName);
          if (!resolve(filePath).startsWith(resolve(dir))) {
            res.writeHead(403).end("Forbidden");
            return;
          }
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

/**
 * The Tailwind CDN compiles styles in-browser AFTER load. Wait until the <nav>
 * actually has a non-transparent computed background (or a hard ~1800ms cap),
 * then await document.fonts.ready, then freeze all animations/transitions so
 * animate-pulse etc. can't make color reads flaky.
 */
async function settleAndFreeze(page) {
  await page
    .waitForFunction(
      () => {
        const nav = document.querySelector("nav");
        if (!nav) return false;
        const bg = getComputedStyle(nav).backgroundColor;
        return bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)";
      },
      { timeout: 1800 },
    )
    .catch(() => {});
  await page.evaluate(() => (document.fonts ? document.fonts.ready : null)).catch(() => {});
  await page.addStyleTag({ content: "* { animation: none !important; transition: none !important; }" });
}

async function main() {
  const spec = JSON.parse(readFileSync(join(__dirname, "design.json"), "utf-8"));
  const { runValidation, cleanup } = await loadRunValidation();
  const { baseUrl, close } = await serveDir(appDir);
  const url = `${baseUrl}/${htmlFile}`;
  await mkdir(capturesDir, { recursive: true });

  let result;
  try {
    // The measure() pipeline does its own goto + fonts.ready wait. To absorb the
    // Tailwind-CDN settle window we warm the page once in our own browser first,
    // then run the validation against the now-warm server. measure() re-navigates
    // but the styles compile the same way; we also poll inside measure-equivalent
    // logic via the screenshot pass below to confirm settle.
    result = await runValidation({
      url,
      viewport: spec.viewport,
      design: spec.design,
      componentMap: spec.componentMap,
      tolerances: spec.tolerances,
    });

    const browser = await chromium.launch();
    try {
      const ctx = await browser.newContext({ viewport: spec.viewport, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: "load" });
      await settleAndFreeze(page);
      await page.screenshot({ path: join(capturesDir, `${label}.png`), fullPage: true });
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
  console.log(`\n[${label}]  file=${htmlFile}  pass=${result.pass}  score=${result.score}  errors=${errors.length}  warns=${warns.length}\n`);
  for (const v of result.violations) {
    console.log(
      `  ${v.severity === "error" ? "X" : "."} ${v.check}/${v.property} on ${v.component}  ${v.delta}${v.expected.source ? `  [${v.expected.source}]` : ""}`,
    );
  }
  if (result.unmapped.inDesignNotFound.length || result.unmapped.inDomNotMapped.length) {
    console.log(`  unmapped:`, JSON.stringify(result.unmapped));
  }
  console.log(`\n  capture -> demo/fullpage/captures/${label}.png`);
  console.log(`  result  -> demo/fullpage/captures/${label}.json\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
