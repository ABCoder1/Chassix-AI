import { fileURLToPath } from "node:url";
import { buildServer } from "./server.js";
import { createInMemoryRepositories } from "./repositories/memory.js";
import { createDrizzleRepositories } from "./repositories/drizzle.js";
import type { Repositories } from "./repositories/types.js";
import type { DbClient } from "@chassix/db";
import type { ExecutorAdapter } from "@chassix/shared";
import type { BundleSource } from "./runs/bundle.js";

const port = Number(process.env.API_PORT ?? 3001);

/**
 * When GCP is configured (project + region + bucket), wire the live GCP Batch executor (submits the
 * `workflows/<branch>/batch-<branch>.json` jobs) and the GCS bundle source (ingests each run's
 * `bundle.<branch>.json` outputs into `GET …/runs/:id/bundle`). The heavy Google SDKs load only
 * here, only when configured. Credentials come from Application Default Credentials.
 */
async function buildGcp(): Promise<{ executor?: ExecutorAdapter; bundleSource?: BundleSource }> {
  const projectId = process.env.GCP_PROJECT_ID;
  const region = process.env.GCP_REGION;
  const gcsBucket = process.env.GCS_BUCKET;
  if (!projectId || !region || !gcsBucket) return {};

  const { GcpBatchExecutor } = await import("@chassix/executor");
  const { createBatchJobsClient } = await import("@chassix/executor/gcp");
  const { createGcsObjectStore } = await import("./runs/gcs-store.js");
  const { GcsBundleSource } = await import("./runs/gcs-bundle-source.js");

  const workflowsDir = fileURLToPath(new URL("../../../workflows", import.meta.url));
  const executor = new GcpBatchExecutor({
    client: createBatchJobsClient(),
    config: { projectId, region, gcsBucket, workflowsDir },
  });
  const bundleSource = new GcsBundleSource(createGcsObjectStore(gcsBucket));
  console.log(
    `[api] GCP Batch executor + GCS bundle ingest enabled (project=${projectId}, region=${region}, bucket=${gcsBucket}).`,
  );
  return { executor, bundleSource };
}

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

  const { executor, bundleSource } = await buildGcp();
  if (!executor) {
    console.warn(
      "[api] GCP_* not set — run launches use the FakeExecutor (no real jobs submitted).",
    );
  }

  const app = buildServer({
    repos,
    ...(dbClient ? { dbClient } : {}),
    ...(executor ? { executor } : {}),
    ...(bundleSource ? { bundleSource } : {}),
  });
  const address = await app.listen({ port, host: "0.0.0.0" });
  console.log(`[api] listening on ${address}`);
}

main().catch((err) => {
  console.error("[api] failed to start", err);
  process.exit(1);
});
