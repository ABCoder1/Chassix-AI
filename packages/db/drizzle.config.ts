import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config (ADR-D5). Schema + enums live under `src/`; migrations are generated
 * into `./migrations`. Uses `DATABASE_URL` (see root `.env.example`), which the preload
 * `drizzle-js-resolve.cjs` loads from the repo-root `.env` before this file is read.
 * `generate` needs no live DB; `migrate` applies against DATABASE_URL.
 */
const FALLBACK = "postgresql://chassix:chassix@localhost:5432/chassix";

/**
 * Ensure TLS for a remote database. Managed Postgres (e.g. Supabase) requires SSL, and its
 * cert chain is often not in Node's default trust store, which surfaces as
 * "self-signed certificate in certificate chain". For a dev migration we connect with
 * `sslmode=no-verify` (encrypted, certificate not verified) when the URL is remote and does not
 * already specify an sslmode. To enforce verification, put an explicit `?sslmode=require` (or
 * stricter) in your DATABASE_URL and this leaves it untouched.
 */
function withSsl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
    if (isLocal) return url;
    if (parsed.searchParams.has("sslmode")) return url;
    parsed.searchParams.set("sslmode", "no-verify");
    return parsed.toString();
  } catch {
    return url; // not a parseable URL — let the driver report it
  }
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: {
    url: withSsl(process.env.DATABASE_URL ?? FALLBACK),
  },
  strict: true,
  verbose: true,
});
