// scripts/smoke.mjs
//
// End-to-end "smoke" harness for designfit.
//
// Exercises the full measure -> validate pipeline against the bundled demo and
// asserts the known-expected result, so a contributor can confirm the engine
// works without setting up an MCP client. Run with:  npm run smoke
//
// Self-sufficient: it serves examples/demo over a local HTTP port (so the run is
// hermetic and does NOT depend on the design.json `url` placeholder), and it
// imports the real exported seam `runValidation` from src/server.ts. The compiled
// `dist/` bundle is an executable MCP server with no exports, so instead of
// importing dist/ we bundle the seam with the already-installed esbuild into a
// temp ESM module and import that. No source files are modified.

import { createServer as createHttpServer } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const demoDir = join(repoRoot, "examples", "demo");
const seamEntry = join(repoRoot, "src", "server.ts");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

/** Bundle src/server.ts (with all node_modules left external) and import runValidation. */
async function loadRunValidation() {
  // Emit the bundle INSIDE the repo so its `external` imports (playwright, zod,
  // culori, @modelcontextprotocol/sdk) resolve against the repo's node_modules
  // via Node's normal upward lookup. A temp dir in the OS tmpdir cannot see them.
  const outDir = await mkdtemp(join(repoRoot, ".smoke-"));
  const outFile = join(outDir, "seam.mjs");
  await build({
    entryPoints: [seamEntry],
    outfile: outFile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    packages: "external", // keep playwright/culori/zod/@modelcontextprotocol external
    logLevel: "silent",
  });
  const mod = await import(pathToFileURL(outFile).href);
  if (typeof mod.runValidation !== "function") {
    throw new Error("runValidation seam not found in src/server.ts export");
  }
  return { runValidation: mod.runValidation, cleanup: () => rm(outDir, { recursive: true, force: true }) };
}

/** Serve examples/demo on an ephemeral localhost port. Returns { baseUrl, close }. */
function serveDemo() {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createHttpServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        const rel = urlPath === "/" ? "/index.html" : urlPath;
        const filePath = join(demoDir, rel.replace(/^\/+/, ""));
        // Prevent path traversal outside the demo dir.
        if (!resolve(filePath).startsWith(resolve(demoDir))) {
          res.writeHead(403).end("Forbidden");
          return;
        }
        const body = await readFile(filePath);
        res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
        res.end(body);
      } catch {
        res.writeHead(404).end("Not Found");
      }
    });
    server.on("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolvePromise({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

function fail(message) {
  console.error(`\nSMOKE FAIL\n  ${message}\n`);
  process.exit(1);
}

function describeViolation(v) {
  return `${v.check}/${v.property} on ${v.component} [${v.severity}] — ${v.delta}`;
}

async function main() {
  // 1. Load the demo case (viewport / design / componentMap). The `url` field is
  //    intentionally ignored; we serve the demo ourselves for a hermetic run.
  const demo = JSON.parse(readFileSync(join(demoDir, "design.json"), "utf-8"));

  // 2. Bundle + import the real pipeline seam.
  const { runValidation, cleanup } = await loadRunValidation();

  // 3. Serve the demo dir and override the url.
  const { baseUrl, close } = await serveDemo();
  const url = `${baseUrl}/index.html`;

  let result;
  try {
    result = await runValidation({
      url,
      viewport: demo.viewport,
      design: demo.design,
      componentMap: demo.componentMap,
      tolerances: demo.tolerances, // undefined -> defaults
    });
  } finally {
    await close();
    await cleanup();
  }

  // 4. Assertions against the known-expected demo result.
  const violations = result.violations ?? [];
  const errors = violations.filter((v) => v.severity === "error");
  const warns = violations.filter((v) => v.severity === "warn");

  const checks = [];
  const assert = (name, ok, detail) => checks.push({ name, ok, detail });

  // (a) The run does not pass.
  assert("pass === false", result.pass === false, `received pass=${JSON.stringify(result.pass)}`);

  // (b) A fill/color token ERROR is present (wrong blue vs token color/primary).
  const fillErr = errors.find((v) => v.check === "token" && v.property === "fill");
  assert(
    "fill/color token error present",
    Boolean(fillErr),
    fillErr ? describeViolation(fillErr) : "no token/fill error found",
  );

  // (c) The WIDTH geometry ERROR is present (180 vs 120).
  const widthErr = errors.find((v) => v.check === "geometry" && v.property === "width");
  assert(
    "width geometry error present",
    Boolean(widthErr),
    widthErr ? describeViolation(widthErr) : "no geometry/width error found",
  );

  // (d) The border-radius appears as a WARN (4 vs 8, hardcoded -> advisory).
  const radiusWarn = warns.find((v) => v.property === "borderRadius");
  assert(
    "border-radius warn present",
    Boolean(radiusWarn),
    radiusWarn ? describeViolation(radiusWarn) : "no borderRadius warn found",
  );

  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    console.error("\nSMOKE FAIL — assertions did not hold\n");
    console.error(`  url:    ${url}`);
    console.error(`  pass:   ${result.pass}`);
    console.error(`  score:  ${result.score}`);
    console.error(`  errors: ${errors.length}, warns: ${warns.length}`);
    console.error("\n  Violations received:");
    for (const v of violations) console.error(`    - ${describeViolation(v)}`);
    console.error("\n  Failed assertions:");
    for (const c of failed) console.error(`    x ${c.name}\n        expected: a match\n        received: ${c.detail}`);
    console.error("");
    process.exit(1);
  }

  // 5. Success summary.
  console.log("\nSMOKE PASS — designfit measure -> validate pipeline verified\n");
  console.log(`  served demo at : ${url}`);
  console.log(`  pass           : ${result.pass}`);
  console.log(`  score          : ${result.score}`);
  console.log(`  errors / warns : ${errors.length} / ${warns.length}`);
  console.log("\n  Assertions:");
  for (const c of checks) console.log(`    ok ${c.name}\n        ${c.detail}`);
  console.log("");
  process.exit(0);
}

main().catch((err) => fail(err instanceof Error ? (err.stack ?? err.message) : String(err)));
