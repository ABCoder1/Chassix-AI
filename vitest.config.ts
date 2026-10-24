import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    include: ["{apps,packages}/*/src/**/*.{test,spec}.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@bioforge/shared": r("./packages/shared/src/index.ts"),
      "@bioforge/ui": r("./packages/ui/src/index.ts"),
      "@bioforge/fixtures": r("./packages/fixtures/src/index.ts"),
    },
  },
});
