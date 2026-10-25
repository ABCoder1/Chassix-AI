import { ProjectFlow } from "@chassix/shared";

/**
 * Single source of truth for the Phase-1 workflow stages.
 *
 * Both the spatial canvas (Screen 2) and the linear accessible stage list render
 * from this one array, so the two views can never disagree. Each stage maps to a
 * PRD §6 ProjectFlow state; `dependsOn` expresses the left-to-right dependency
 * graph drawn as edges on the canvas.
 *
 * All copy here is illustrative product chrome — no fabricated scientific
 * results (cross-cutting "unknown stays unknown" rule).
 */
export type StageKind = "milestone" | "selection" | "barrier";

export interface Stage {
  /** Stable identifier used as React key, DOM id and edge target. */
  id: string;
  /** 1-based position in the linear ordering. */
  order: number;
  /** Short node/list heading. */
  title: string;
  /** One-line description shown in the stage overview. */
  summary: string;
  /** The PRD §6 project-flow state this stage represents. */
  flow: ProjectFlow;
  /** What kind of node this is (drives which selection controls appear). */
  kind: StageKind;
  /** Ids of stages this one depends on (drawn as incoming edges). */
  dependsOn: string[];
}

export const STAGES: readonly Stage[] = [
  {
    id: "welcome",
    order: 1,
    title: "Welcome",
    summary: "Describe your end goal in plain language to begin a draft.",
    flow: ProjectFlow.DraftGoal,
    kind: "milestone",
    dependsOn: [],
  },
  {
    id: "discovery",
    order: 2,
    title: "Host discovery",
    summary: "Review ranked host candidates and select hosts to carry forward.",
    flow: ProjectFlow.SelectingHosts,
    kind: "selection",
    dependsOn: ["welcome"],
  },
  {
    id: "datasets",
    order: 3,
    title: "Datasets",
    summary: "Choose compatible public datasets or private uploads.",
    flow: ProjectFlow.SelectingInputs,
    kind: "selection",
    dependsOn: ["discovery"],
  },
  {
    id: "plan",
    order: 4,
    title: "Plan review",
    summary: "Confirm hosts, inputs, tools and parameters before launch.",
    flow: ProjectFlow.PlanReady,
    kind: "milestone",
    dependsOn: ["datasets"],
  },
  {
    id: "running",
    order: 5,
    title: "Running",
    summary: "Parallel analyses execute remotely with per-branch status.",
    flow: ProjectFlow.Running,
    kind: "milestone",
    dependsOn: ["plan"],
  },
  {
    id: "barrier",
    order: 6,
    title: "Integration barrier",
    summary: "Waits for every required branch to reach a terminal state.",
    flow: ProjectFlow.Integrating,
    kind: "barrier",
    dependsOn: ["running"],
  },
  {
    id: "results",
    order: 7,
    title: "Results",
    summary: "Harmonized evidence, critic review and grounded AI chat.",
    flow: ProjectFlow.ResultsReady,
    kind: "milestone",
    dependsOn: ["barrier"],
  },
];

/** Edges of the dependency graph as (from → to) pairs, derived from `dependsOn`. */
export const STAGE_EDGES: ReadonlyArray<{ from: string; to: string }> = STAGES.flatMap((stage) =>
  stage.dependsOn.map((from) => ({ from, to: stage.id })),
);
