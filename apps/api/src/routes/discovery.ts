/**
 * Discovery API (Step 2.3 / BF-02, PRD §B) — the RAG step behind the host-discovery screen.
 *
 * `POST /discovery` takes the user's objective, runs a citation-first literature survey (cached),
 * ranks candidate hosts from the cited evidence, and lists candidate datasets — the two things the
 * user chooses between to proceed. Advisory only (the UI selects), traceable (every host carries its
 * citations), and never fabricated (empty survey → explicit empty result). Retrieval + datasets are
 * injected so this runs on deterministic fixtures with no key; a live Apify-backed provider (ADR-D9)
 * can replace the retriever behind the same interface. Unauthenticated: this is part of the pre-login
 * flow, like goal interpretation, and only reads public literature/metadata.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiError } from "@chassix/shared";
import { discoverHosts, type RetrievalProvider } from "@chassix/planner";
import { type DatasetService, type DatasetQuery, Modality } from "@chassix/datasets";

const discoverSchema = z
  .object({
    prompt: z.string().max(4000).optional(),
    query: z.string().max(4000).optional(),
    modality: z.string().optional(),
    limit: z.number().int().positive().max(50).optional(),
  })
  .refine((v) => (v.query ?? v.prompt ?? "").trim().length > 0, {
    message: "Provide a non-empty `query` or `prompt`.",
  });

export interface DiscoveryRouteDeps {
  retrieval: RetrievalProvider;
  datasets: DatasetService;
  /** True when the retriever is a live (keyed) provider; drives the `illustrative` flag. */
  live: boolean;
}

const asModality = (m: string | undefined): Modality | undefined =>
  m && (Object.values(Modality) as string[]).includes(m) ? (m as Modality) : undefined;

export const registerDiscoveryRoutes = (
  app: FastifyInstance,
  { retrieval, datasets, live }: DiscoveryRouteDeps,
): void => {
  app.post("/discovery", async (req, reply) => {
    const parsed = discoverSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send(
        apiError("VALIDATION", "A non-empty query or prompt is required.", {
          retryable: false,
          correlationId: req.id,
        }),
      );
    }
    const query = (parsed.data.query ?? parsed.data.prompt ?? "").trim();
    const modality = asModality(parsed.data.modality);

    try {
      const discovery = await discoverHosts(retrieval, {
        query,
        ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {}),
      });

      const datasetQuery: DatasetQuery = { text: query, ...(modality ? { modality } : {}) };
      const outcome = await datasets.discover(datasetQuery);
      const records = "records" in outcome ? outcome.records : [];
      const datasetNote =
        outcome.kind === "cached"
          ? outcome.ageNotice
          : outcome.kind === "error"
            ? outcome.message
            : undefined;

      return reply.status(200).send({
        query: discovery.query,
        retrievalDate: discovery.retrievalDate,
        providerId: retrieval.id,
        illustrative: !live,
        isEmpty: discovery.isEmpty,
        ...(discovery.note ? { note: discovery.note } : {}),
        hosts: discovery.hosts.map((h) => ({
          id: h.host
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, ""),
          host: h.host,
          score: h.score.score,
          suitabilityLabel: h.score.suitabilityLabel,
          isSuitabilityEstimate: true as const,
          advisory: true as const,
          supportingSources: h.score.supportingSourceCount,
          conflictingFindings: h.score.conflictingFindings,
          freshness: h.score.freshness,
          rationale: h.score.rationale,
          tradeoffs: h.score.tradeoffs,
          missingData: h.score.missingData,
          citations: h.citations.map((c) => ({
            id: c.id,
            title: c.metadata.title,
            authors: c.metadata.authors,
            venue: c.metadata.venue,
            year: c.metadata.year,
            doi: c.metadata.doi ?? null,
            url: c.metadata.url ?? null,
            passage: c.passage.text,
            claim: c.claim,
            claimType: c.claimType,
            accessStatus: c.accessStatus,
            readFullText: c.readFullText,
            retrievalDate: c.retrievalDate,
          })),
        })),
        inaccessibleCount: discovery.inaccessible.length,
        datasets: {
          fromCache: "fromCache" in outcome ? Boolean(outcome.fromCache) : false,
          ...(datasetNote ? { note: datasetNote } : {}),
          records: records.map((r) => ({
            id: r.id,
            accession: r.accession,
            modality: r.modality,
            source: r.source,
            repository: r.repository,
            availability: r.availability,
            licenseAccess: r.licenseAccess,
            assay: r.assay,
            taxonomy: r.taxonomy,
            sourceLink: r.sourceLink,
          })),
        },
      });
    } catch {
      return reply.status(502).send(
        apiError("DISCOVERY_FAILED", "Could not run discovery right now. Please retry.", {
          retryable: true,
          correlationId: req.id,
        }),
      );
    }
  });
};
