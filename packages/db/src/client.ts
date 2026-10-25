/**
 * Drizzle (node-postgres) client factory. Reads `DATABASE_URL` (ADR-D5; see `.env.example`).
 * The pg Pool is lazy — it does not open a connection until the first query — so this can
 * be constructed in tests to build/inspect queries (`.toSQL()`) without a live database.
 */
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { schema } from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;

export interface DbClient {
  db: Database;
  pool: pg.Pool;
}

/**
 * Ensure TLS for a remote database, mirroring `drizzle.config.ts`. Managed Postgres
 * (Supabase's Session-mode pooler on port 5432, or a direct connection) requires SSL, and its
 * cert chain is often not in Node's default trust store ("self-signed certificate in certificate
 * chain"). For a remote host with no explicit sslmode we connect with `sslmode=no-verify`
 * (encrypted, certificate not verified). A local host, or a URL that already sets sslmode, is
 * left untouched — put an explicit `?sslmode=require` in DATABASE_URL to enforce verification.
 */
const ensureSsl = (connectionString: string): string => {
  try {
    const url = new URL(connectionString);
    const isLocal =
      url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
    if (isLocal || url.searchParams.has("sslmode")) return connectionString;
    url.searchParams.set("sslmode", "no-verify");
    return url.toString();
  } catch {
    return connectionString; // not a parseable URL — let the driver report it
  }
};

export const createDbClient = (
  connectionString: string | undefined = process.env.DATABASE_URL,
): DbClient => {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — cannot create the Chassix db client.");
  }
  const pool = new pg.Pool({ connectionString: ensureSsl(connectionString) });
  const db = drizzle(pool, { schema });
  return { db, pool };
};
