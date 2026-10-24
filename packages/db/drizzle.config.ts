import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config (ADR-D5). Schema + enums live under `src/`; migrations are generated
 * into `./migrations`. Uses `DATABASE_URL` (see root `.env.example`). `generate` needs no
 * live DB; `migrate` is verified against the docker-compose Postgres at integration time.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://chassix:chassix@localhost:5432/chassix",
  },
  strict: true,
  verbose: true,
});
