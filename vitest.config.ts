import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    include: ["{apps,packages}/*/src/**/*.{test,spec}.{ts,tsx}"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@chassix/shared": r("./packages/shared/src/index.ts"),
      "@chassix/ui": r("./packages/ui/src/index.ts"),
      "@chassix/db": r("./packages/db/src/index.ts"),
      "@chassix/fixtures": r("./packages/fixtures/src/index.ts"),
    },
  },
});
