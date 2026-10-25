/**
 * Run-execution API (Phase 3, Wave 3B — Steps 3.3/3.4/3.5/3.6 surfaces).
 *
 * Thin HTTP shell over the injected `RunOrchestrator` (the single source of job truth, ADR-D3).
 * Routes:
 *   - POST   /workspaces/:workspaceId/runs                              launch (idempotent)      [run.launch]
 *   - GET    /workspaces/:workspaceId/runs/:runId                       authoritative snapshot   [member]
 *   - GET    /workspaces/:workspaceId/runs/:runId/events               SSE replay + live tail   [member]
 *   - POST   /workspaces/:workspaceId/runs/:runId/cancel               audited cancel           [run.retry_cancel]
 *   - GET    /workspaces/:workspaceId/runs/:runId/branches/:id/logs    per-attempt logs         [member]
 *
 * Cross-cutting rules honoured here: idempotency key + plan persisted before the launch is
 * acked (the orchestrator does this), a client disconnect never cancels a run, secrets stay
 * server-side (executor refs are opaque), and every error is the shared ApiError envelope with
 * a correlation id.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { apiError } from "@chassix/shared";
import { asRunId, asBranchId, OrchestratorError } from "@chassix/orchestrator";
import type { AuthGuards } from "../context.js";
import type { RunOrchestratorProvider } from "../runs/service.js";
import { serializeSseEvent, SSE_HEARTBEAT, parseCursor, projectBranchLogs } from "../runs/sse.js";
import { bundleFromSnapshot, emptyBundleSource, type BundleSource } from "../runs/bundle.js";

/** How often to emit an SSE heartbeat comment (ms). */
const HEARTBEAT_INTERVAL_MS = 15_000;

const branchSpecSchema = z.object({
  branchId: z.string().min(1).optional(),
  name: z.string().min(1),
  inputs: z
    .array(z.object({ datasetVersionId: z.string().min(1), checksum: z.string().min(1) }))
    .default([]),
  parameters: z.record(z.unknown()).default({}),
  toolVersions: z.record(z.string()).default({}),
  referenceVersions: z.record(z.string()).default({}),
  command: z.string().min(1),
});

/**
 * Per-run organism + condition (PRD §C/§E). Specified ONCE at the run level and merged into every
 * branch's `parameters` below, so each frozen branch manifest carries them — which is what tags the
 * GCP Batch jobs (executor substitutions) and the analysis-bundle provenance (bundle producer). A
 * branch may still override them via its own `parameters.organism` / `parameters.condition`.
 */
const organismSchema = z.object({
  chassisId: z.enum(["yeast", "bacterium", "archaeon", "other"]).optional(),
  taxonId: z.string().optional(),
  taxonName: z.string().optional(),
  strainId: z.string().optional(),
  strainName: z.string().optional(),
});
const conditionSchema = z.object({
  id: z.string().min(1),
  temperatureC: z.number().optional(),
  pH: z.number().optional(),
  salinityMolL: z.number().optional(),
  media: z.string().optional(),
  oxygenation: z.string().optional(),
});

const launchSchema = z.object({
  /** Client idempotency key — a repeated key returns the SAME run, never a second submission. */
  idempotencyKey: z.string().min(1),
  projectId: z.string().min(1),
  planId: z.string().min(1),
  organism: organismSchema.optional(),
  condition: conditionSchema.optional(),
  branches: z.array(branchSpecSchema).min(1),
});

const cancelSchema = z
  .object({ branchId: z.string().min(1).optional() })
  .optional()
  .default({});

export interface RunRouteDeps {
  guards: AuthGuards;
  /** Supplies a (possibly workspace-scoped) run-orchestrator bundle per request. */
  provider: RunOrchestratorProvider;
  /** Overridable for tests; defaults to a 15s heartbeat. */
  heartbeatIntervalMs?: number;
  /** Supplies ingested analysis fragments for the bundle endpoint; defaults to none ingested. */
  bundleSource?: BundleSource;
}

const notFound = (req: FastifyRequest, reply: FastifyReply, message: string): FastifyReply =>
  reply
    .status(404)
    .send(apiError("RUN_NOT_FOUND", message, { retryable: false, correlationId: req.id }));

export const registerRunRoutes = (
  app: FastifyInstance,
  {
    guards,
    provider,
    heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS,
    bundleSource = emptyBundleSource,
  }: RunRouteDeps,
): void => {
  // The live event transport is shared across requests (SSE fan-out). The orchestrator + repo
  // are obtained per request from the provider so a DB-backed provider can scope them to the
  // caller's workspace (cross-workspace access is then impossible at the query layer).
  const transport = provider.transport;

  /** Resolve a run that belongs to THIS workspace, or null (prevents cross-workspace id probing). */
  const resolveRun = async (workspaceId: string, runId: string) => {
    const { orchestrator } = provider.getBundle(workspaceId);
    try {
      const snap = await orchestrator.snapshot(asRunId(runId));
      if (snap.run.workspaceId !== workspaceId) return null;
      return snap;
    } catch {
      return null;
    }
  };

  // --- POST launch (idempotent) — Step 3.3 ----------------------------------
  app.post(
    "/workspaces/:workspaceId/runs",
    { preHandler: guards.requireWorkspace("run.launch") },
    async (req, reply) => {
      const parsed = launchSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send(
          apiError("VALIDATION", "A launch requires an idempotencyKey, plan ids and branches.", {
            retryable: false,
            correlationId: req.id,
            details: { issues: parsed.error.issues.map((i) => i.path.join(".")) },
          }),
        );
      }
      const workspaceId = req.workspace!.workspaceId;
      const { orchestrator } = provider.getBundle(workspaceId);
      // Run-level organism/condition become per-branch defaults (a branch's own parameters win), so
      // every frozen manifest carries them → Batch jobs + bundle provenance are tagged per run.
      const runParams: Record<string, unknown> = {};
      if (parsed.data.organism) runParams.organism = parsed.data.organism;
      if (parsed.data.condition) runParams.condition = parsed.data.condition;
      // Drop an absent branchId rather than passing `undefined` (exactOptionalPropertyTypes).
      const branches = parsed.data.branches.map((b) => ({
        ...(b.branchId ? { branchId: b.branchId } : {}),
        name: b.name,
        inputs: b.inputs,
        parameters: { ...runParams, ...b.parameters },
        toolVersions: b.toolVersions,
        referenceVersions: b.referenceVersions,
        command: b.command,
      }));
      const result = await orchestrator.launch({
        workspaceId,
        projectId: parsed.data.projectId,
        planId: parsed.data.planId,
        idempotencyKey: parsed.data.idempotencyKey,
        branches,
      });
      // Repeated idempotency key ⇒ same run, no second submission ⇒ 200; a fresh launch ⇒ 201.
      return reply.status(result.deduplicated ? 200 : 201).send({
        runId: result.runId,
        deduplicated: result.deduplicated,
        branchIds: result.branchIds,
      });
    },
  );

  // --- GET snapshot (authoritative current state) — Step 3.4 ----------------
  app.get(
    "/workspaces/:workspaceId/runs/:runId",
    { preHandler: guards.requireWorkspace() },
    async (req, reply) => {
      const { workspaceId, runId } = req.params as { workspaceId: string; runId: string };
      const snap = await resolveRun(workspaceId, runId);
      if (!snap) return notFound(req, reply, "No such run in this workspace.");
      return reply.status(200).send({
        run: snap.run,
        branches: snap.branches,
        lastSequence: snap.lastSequence,
      });
    },
  );

  // --- GET analysis bundle: run results in the digital-twin contract ---------
  // Produces a schema-1.0.0 AnalysisBundle for the visualizer (native units,
  // provenance, explicit per-section status). No fabricated results.
  app.get(
    "/workspaces/:workspaceId/runs/:runId/bundle",
    { preHandler: guards.requireWorkspace() },
    async (req, reply) => {
      const { workspaceId, runId } = req.params as { workspaceId: string; runId: string };
      const snap = await resolveRun(workspaceId, runId);
      if (!snap) return notFound(req, reply, "No such run in this workspace.");
      try {
        const analysisBundle = await bundleFromSnapshot(snap, bundleSource);
        return reply.status(200).send(analysisBundle);
      } catch {
        return reply.status(500).send(
          apiError("BUNDLE_ASSEMBLY_FAILED", "Could not assemble the analysis bundle.", {
            retryable: true,
            correlationId: req.id,
          }),
        );
      }
    },
  );

  // --- GET SSE events: replay-from-cursor + live tail — Step 3.4 -------------
  app.get(
    "/workspaces/:workspaceId/runs/:runId/events",
    { preHandler: guards.requireWorkspace() },
    async (req, reply) => {
      const { workspaceId, runId } = req.params as { workspaceId: string; runId: string };
      const snap = await resolveRun(workspaceId, runId);
      if (!snap) return notFound(req, reply, "No such run in this workspace.");
      const { orchestrator } = provider.getBundle(workspaceId);

      const cursor = parseCursor(
        req.headers["last-event-id"],
        (req.query as { cursor?: unknown } | undefined)?.cursor,
      );

      // Take over the socket: we stream raw SSE and manage the connection lifecycle ourselves.
      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      // Flush headers immediately with an opening comment so a cursor past the tail (no replay
      // events to write) still establishes the stream rather than leaving the client waiting.
      raw.write(": connected\n\n");

      // Replay authoritative, gap-free, ordered events after the cursor (each id: = sequence).
      let lastSent = cursor;
      const replay = await orchestrator.replayFrom(asRunId(runId), cursor);
      for (const event of replay) {
        raw.write(serializeSseEvent(event));
        if (event.sequence > lastSent) lastSent = event.sequence;
      }

      // Then tail live events for THIS run, deduping anything already replayed (at-least-once).
      const unsubscribe = transport.subscribe((event) => {
        if (event.runId !== runId) return;
        if (event.sequence <= lastSent) return;
        lastSent = event.sequence;
        raw.write(serializeSseEvent(event));
      });

      const heartbeat = setInterval(() => raw.write(SSE_HEARTBEAT), heartbeatIntervalMs);
      if (typeof heartbeat.unref === "function") heartbeat.unref();

      // Client disconnect (closed tab) tears down the stream but NEVER cancels the run.
      let torn = false;
      const cleanup = (): void => {
        if (torn) return;
        torn = true;
        clearInterval(heartbeat);
        unsubscribe();
        // End the hijacked socket so the server stops tracking it (clean shutdown); a client
        // disconnect NEVER cancels the run — job state is untouched (PRD §E).
        raw.end();
        void orchestrator.clientDisconnected(asRunId(runId));
      };
      req.raw.once("close", cleanup);
      raw.once("close", cleanup);
      raw.once("error", cleanup);
    },
  );

  // --- POST cancel (audited terminal, not a failure) — Step 3.6 -------------
  app.post(
    "/workspaces/:workspaceId/runs/:runId/cancel",
    { preHandler: guards.requireWorkspace("run.retry_cancel") },
    async (req, reply) => {
      const { workspaceId, runId } = req.params as { workspaceId: string; runId: string };
      const snap = await resolveRun(workspaceId, runId);
      if (!snap) return notFound(req, reply, "No such run in this workspace.");
      const { orchestrator } = provider.getBundle(workspaceId);

      const parsed = cancelSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send(
          apiError("VALIDATION", "branchId, when supplied, must be a non-empty string.", {
            retryable: false,
            correlationId: req.id,
          }),
        );
      }
      try {
        const result = await orchestrator.cancel(asRunId(runId), {
          ...(parsed.data.branchId ? { branchId: asBranchId(parsed.data.branchId) } : {}),
          actorUserId: req.authUser!.id,
        });
        return reply.status(200).send({ cancelledBranchIds: result.cancelledBranchIds });
      } catch (err) {
        if (err instanceof OrchestratorError) {
          return notFound(req, reply, "No such branch in this run.");
        }
        throw err;
      }
    },
  );

  // --- GET per-attempt logs — Step 3.6 surface ------------------------------
  app.get(
    "/workspaces/:workspaceId/runs/:runId/branches/:branchId/logs",
    { preHandler: guards.requireWorkspace() },
    async (req, reply) => {
      const { workspaceId, runId, branchId } = req.params as {
        workspaceId: string;
        runId: string;
        branchId: string;
      };
      const snap = await resolveRun(workspaceId, runId);
      if (!snap) return notFound(req, reply, "No such run in this workspace.");
      if (!snap.branches.some((b) => b.id === branchId)) {
        return notFound(req, reply, "No such branch in this run.");
      }
      const { orchestrator, repo } = provider.getBundle(workspaceId);
      const attempts = await repo.listAttempts(asBranchId(branchId));
      const events = await orchestrator.replayFrom(asRunId(runId), 0);
      return reply
        .status(200)
        .send({ branchId, attempts: projectBranchLogs(attempts, events, branchId) });
    },
  );
};
