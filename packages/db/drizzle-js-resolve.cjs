/**
 * drizzle-kit resolver shim.
 *
 * Our monorepo uses NodeNext ESM with explicit `.js` extensions on relative imports
 * (`import { x } from "./y.js"` where the file on disk is `y.ts`). `tsc` and `vitest`
 * remap `.js` -> `.ts` automatically, but drizzle-kit's schema loader `require()`s the
 * literal `.js` path and fails (`Cannot find module './ids.js'`) when it follows the schema
 * into `@chassix/shared`, which is consumed as TypeScript source (no build output).
 *
 * This preload patches CommonJS resolution so that a relative `.js` request that cannot be
 * found falls back to the sibling `.ts` file. It changes nothing else, adds no dependency,
 * and is only used for `drizzle-kit generate/migrate` (see package.json). Preload with:
 *   node -r ./drizzle-js-resolve.cjs ./node_modules/drizzle-kit/bin.cjs generate
 */
/**
 * Load the repo-root `.env` into `process.env` before drizzle-kit reads the config.
 *
 * `drizzle-kit migrate/generate` is a bare `node` process — it does NOT auto-load `.env`, so
 * `process.env.DATABASE_URL` is undefined and the config falls back to localhost (ECONNREFUSED
 * against a remote DB like Supabase). We parse the nearest `.env` (walking up from cwd, then from
 * this file) ourselves — no `dotenv` dependency — and never override an already-set variable.
 */
(function loadDotEnv() {
  const fs = require("node:fs");
  const path = require("node:path");
  const seen = new Set();
  const starts = [process.cwd(), __dirname];
  for (const start of starts) {
    let dir = start;
    for (let i = 0; i < 6; i++) {
      const file = path.join(dir, ".env");
      if (!seen.has(file) && fs.existsSync(file)) {
        seen.add(file);
        try {
          for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
            const line = raw.trim();
            if (!line || line.startsWith("#")) continue;
            const eq = line.indexOf("=");
            if (eq === -1) continue;
            const key = line
              .slice(0, eq)
              .replace(/^export\s+/, "")
              .trim();
            if (!key || process.env[key] !== undefined) continue;
            let value = line.slice(eq + 1).trim();
            // Strip a single pair of surrounding quotes; keep the value otherwise verbatim
            // (connection strings can contain '#', '?', '&', etc.).
            if (
              value.length >= 2 &&
              (value[0] === '"' || value[0] === "'") &&
              value[value.length - 1] === value[0]
            ) {
              value = value.slice(1, -1);
            }
            process.env[key] = value;
          }
        } catch {
          /* ignore an unreadable .env — the config still has its localhost fallback */
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
})();

const Module = require("node:module");
const originalResolve = Module._resolveFilename;

Module._resolveFilename = function patchedResolve(request, parent, ...rest) {
  const isRelativeJs =
    typeof request === "string" &&
    request.endsWith(".js") &&
    (request.startsWith("./") || request.startsWith("../"));
  if (!isRelativeJs) {
    return originalResolve.call(this, request, parent, ...rest);
  }
  try {
    return originalResolve.call(this, request, parent, ...rest);
  } catch (err) {
    try {
      return originalResolve.call(this, request.slice(0, -3) + ".ts", parent, ...rest);
    } catch {
      throw err;
    }
  }
};
