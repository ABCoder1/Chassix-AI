import { buildServer } from "./server.js";
import { createInMemoryRepositories } from "./repositories/memory.js";
import { createDrizzleRepositories } from "./repositories/drizzle.js";
import type { Repositories } from "./repositories/types.js";

const port = Number(process.env.API_PORT ?? 3001);

/**
 * Wire Drizzle-backed repositories when a database is configured; otherwise fall back to the
 * in-memory repositories so the server still boots in a bare dev environment. Live credential
 * persistence additionally needs a `password_hash` column on `@chassix/db`'s `users` table
 * (see Step 1.4 report).
 */
async function buildRepositories(): Promise<Repositories> {
  if (process.env.DATABASE_URL) {
    const { createDbClient } = await import("@chassix/db");
    const { db } = createDbClient();
    return createDrizzleRepositories(db);
  }
  console.warn("[api] DATABASE_URL not set — using in-memory repositories (data is not durable).");
  return createInMemoryRepositories();
}

async function main(): Promise<void> {
  const repos = await buildRepositories();
  const app = buildServer({ repos });
  const address = await app.listen({ port, host: "0.0.0.0" });
  console.log(`[api] listening on ${address}`);
}

main().catch((err) => {
  console.error("[api] failed to start", err);
  process.exit(1);
});
