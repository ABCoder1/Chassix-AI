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
  server: {
    port: 5174,
    // Proxy reasoning (and any engine API) to the Fastify server so the dashboard stays same-origin.
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET ?? "http://localhost:3001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
