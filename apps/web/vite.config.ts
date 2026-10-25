import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Subpath must precede the bare specifier so "@chassix/ui/tokens.css"
      // does not get rewritten as "<index.ts>/tokens.css".
      "@chassix/ui/tokens.css": r("../../packages/ui/src/tokens.css"),
      "@chassix/ui": r("../../packages/ui/src/index.ts"),
      "@chassix/shared": r("../../packages/shared/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    // Proxy API calls to the Fastify server so the browser stays same-origin (no CORS in dev).
    // `/api/goals/interpret` → `http://localhost:3001/goals/interpret`.
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET ?? "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
