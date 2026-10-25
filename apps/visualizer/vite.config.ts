import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@chassix/analysis-bundle": r("../../packages/analysis-bundle/src/index.ts"),
    },
  },
  server: { port: 5174 },
});
