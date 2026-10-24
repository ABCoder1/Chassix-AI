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

export const createDbClient = (
  connectionString: string | undefined = process.env.DATABASE_URL,
): DbClient => {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — cannot create the Chassix db client.");
  }
  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { db, pool };
};
