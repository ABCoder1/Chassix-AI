import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { parseAnalysisBundle, type GeneExpression } from "@chassix/analysis-bundle";
import { buildServer } from "../server.js";
import { createInMemoryRepositories } from "../repositories/memory.js";
import { seedWorkspaceWithRoles } from "../testing/harness.js";
import type { BundleSource } from "./bundle.js";

const SECRET = "test-secret-chassix-bundle-abc123-abc123";

let apps: FastifyInstance[] = [];
const track = (a: FastifyInstance): FastifyInstance => (apps.push(a), a);
afterEach(async () => {
  await Promise.all(apps.map((a) => a.close()));
  apps = [];
});

const fluxLaunch = (idempotencyKey: string) => ({
  idempotencyKey,
  projectId: "proj-1",
  planId: "plan-1",
  branches: [
    {
      name: "flux",
      inputs: [{ datasetVersionId: "dsv-1", checksum: "sha256:abc" }],
      parameters: {
        organism: {
          chassisId: "yeast",
          taxonName: "Saccharomyces cerevisiae",
          strainName: "S288C",
        },
        condition: { id: "heat-37c", temperatureC: 37 },
      },
      toolVersions: { cobrapy: "0.29.0" },
      referenceVersions: {},
      command: "fba.py",
    },
  ],
});

async function launch(
  app: FastifyInstance,
  workspaceId: string,
  cookie: string,
  key: string,
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: `/workspaces/${workspaceId}/runs`,
    headers: { cookie },
    payload: fluxLaunch(key),
  });
  return res.json().runId as string;
}

describe("GET run bundle — digital-twin contract", () => {
  it("returns a valid schema-1.0.0 bundle with provenance and explicit section status", async () => {
    const app = track(buildServer({ repos: createInMemoryRepositories(), sessionSecret: SECRET }));
    const { workspaceId, cookies } = await seedWorkspaceWithRoles(app);
    const runId = await launch(app, workspaceId, cookies.computational_biologist, "idem-bundle-1");

    const res = await app.inject({
      method: "GET",
      url: `/workspaces/${workspaceId}/runs/${runId}/bundle`,
      headers: { cookie: cookies.scientist },
    });
    expect(res.statusCode).toBe(200);
    const bundle = parseAnalysisBundle(res.json());
    expect(bundle.run.id).toBe(runId);
    expect(bundle.organism.taxonName).toBe("Saccharomyces cerevisiae");
    expect(bundle.condition.temperatureC).toBe(37);
    // Flux branch maps to flux + yield; with no ingested fragment they carry an explicit status.
    expect(bundle.analyses.flux).toBeDefined();
    expect(bundle.analyses.yield).toBeDefined();
    expect(bundle.analyses.flux?.results).toHaveLength(0);
  });

  it("serves ingested fragments from the bundle source", async () => {
    const fragment: GeneExpression = {
      status: "available",
      method: "DESeq2 1.44.0",
      artifactIds: [],
      results: [
        {
          featureId: "YLL026W",
          symbol: "HSP104",
          featureType: "gene",
          log2FoldChange: 3.4,
          pValue: 1e-10,
          adjustedPValue: 1e-8,
        },
      ],
    };
    const source: BundleSource = {
      async sectionsForRun() {
        return { geneExpression: fragment };
      },
      async artifactsForRun() {
        return [];
      },
    };
    const app = track(
      buildServer({
        repos: createInMemoryRepositories(),
        sessionSecret: SECRET,
        bundleSource: source,
      }),
    );
    const { workspaceId, cookies } = await seedWorkspaceWithRoles(app);
    const runId = await launch(app, workspaceId, cookies.computational_biologist, "idem-bundle-2");

    const res = await app.inject({
      method: "GET",
      url: `/workspaces/${workspaceId}/runs/${runId}/bundle`,
      headers: { cookie: cookies.scientist },
    });
    expect(res.statusCode).toBe(200);
    const bundle = parseAnalysisBundle(res.json());
    expect(bundle.analyses.geneExpression?.status).toBe("available");
    expect(bundle.analyses.geneExpression?.results).toHaveLength(1);
  });

  it("returns 404 for an unknown run (no cross-workspace id probing)", async () => {
    const app = track(buildServer({ repos: createInMemoryRepositories(), sessionSecret: SECRET }));
    const { workspaceId, cookies } = await seedWorkspaceWithRoles(app);
    const res = await app.inject({
      method: "GET",
      url: `/workspaces/${workspaceId}/runs/does-not-exist/bundle`,
      headers: { cookie: cookies.scientist },
    });
    expect(res.statusCode).toBe(404);
  });
});
