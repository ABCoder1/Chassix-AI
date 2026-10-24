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
