import { buildServer } from "./server.js";
import { createInMemoryRepositories } from "./repositories/memory.js";
import { createDrizzleRepositories } from "./repositories/drizzle.js";
import type { Repositories } from "./repositories/types.js";
import type { DbClient } from "@chassix/db";

const port = Number(process.env.API_PORT ?? 3001);

/**
 * Wire Drizzle/Supabase-backed persistence when `DATABASE_URL` is configured: the auth/workspace
 * repositories AND the run orchestrator (runs/branches/attempts + the append-only event log)
 * persist to Postgres, scoped per workspace. Without a database we fall back to in-memory so the
 * server still boots in a bare dev environment (data is not durable).
 */
async function main(): Promise<void> {
  let dbClient: DbClient | undefined;
  let repos: Repositories;

  if (process.env.DATABASE_URL) {
    const { createDbClient } = await import("@chassix/db");
    dbClient = createDbClient();
    repos = createDrizzleRepositories(dbClient.db);
    console.log("[api] DATABASE_URL set — using Drizzle/Supabase repositories (durable).");
  } else {
    console.warn(
      "[api] DATABASE_URL not set — using in-memory repositories (data is not durable).",
    );
    repos = createInMemoryRepositories();
  }

  const app = buildServer({ repos, ...(dbClient ? { dbClient } : {}) });
  const address = await app.listen({ port, host: "0.0.0.0" });
  console.log(`[api] listening on ${address}`);
}

main().catch((err) => {
  console.error("[api] failed to start", err);
  process.exit(1);
});
