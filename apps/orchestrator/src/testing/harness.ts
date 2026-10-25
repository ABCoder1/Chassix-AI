/**
 * Shared test harness (NOT a test file, NOT exported from the barrel): wires the in-memory
 * ports, the fixture validator, and a fake executor into a `RunOrchestrator`. A `store` can be
 * passed in to simulate a process restart (a fresh orchestrator over the same persisted store).
 */
import { RunOrchestrator } from "../orchestrator.js";
import type { LaunchRequest } from "../orchestrator.js";
import {
  InMemoryStore,
  InMemoryRunRepository,
  InMemoryEventLogRepository,
} from "../repository/in-memory.js";
import { InMemoryEventTransport } from "../transport/in-memory.js";
import { FixtureOutputValidator, type BranchOutputSchema } from "../validation.js";
import { FakeExecutor } from "./fake-executor.js";

export const DEFAULT_SCHEMA: BranchOutputSchema = {
  genomics: { requiredKinds: ["qc_report"] },
};

export interface Harness {
  store: InMemoryStore;
  repo: InMemoryRunRepository;
  eventLog: InMemoryEventLogRepository;
  transport: InMemoryEventTransport;
  executor: FakeExecutor;
  orch: RunOrchestrator;
}

export const makeHarness = (opts?: {
  store?: InMemoryStore;
  executor?: FakeExecutor;
  schema?: BranchOutputSchema;
}): Harness => {
  const store = opts?.store ?? new InMemoryStore();
  const repo = new InMemoryRunRepository(store);
  const eventLog = new InMemoryEventLogRepository(store);
  const transport = new InMemoryEventTransport();
  const executor = opts?.executor ?? new FakeExecutor();
  const validator = new FixtureOutputValidator(opts?.schema ?? DEFAULT_SCHEMA);
  const orch = new RunOrchestrator({ repo, eventLog, executor, transport, validator });
  return { store, repo, eventLog, transport, executor, orch };
};

let keyCounter = 0;
export const launchRequest = (over: Partial<LaunchRequest> = {}): LaunchRequest => ({
  workspaceId: "ws_1",
  projectId: "proj_1",
  planId: "plan_1",
  idempotencyKey: `key_${keyCounter++}`,
  branches: [
    {
      name: "genomics",
      inputs: [{ datasetVersionId: "dsv_1", checksum: "sha256:abc" }],
      parameters: { threads: 4 },
      toolVersions: { fastqc: "0.12.1" },
      referenceVersions: { genome: "GRCh38" },
      command: "nextflow run main.nf",
    },
  ],
  ...over,
});
