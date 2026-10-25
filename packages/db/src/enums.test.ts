import { describe, it, expect } from "vitest";
import { ProjectFlow, BranchState, CriticDisposition, ConnectivityStatus } from "@chassix/shared";
import {
  projectFlowEnum,
  branchStateEnum,
  criticDispositionEnum,
  connectivityStatusEnum,
} from "./enums.js";

describe("pgEnums are derived from @chassix/shared and can never drift", () => {
  it("project_flow matches ProjectFlow (PRD §6) exactly", () => {
    expect(projectFlowEnum.enumValues).toEqual(Object.values(ProjectFlow));
  });

  it("branch_state matches BranchState (PRD §6) exactly", () => {
    expect(branchStateEnum.enumValues).toEqual(Object.values(BranchState));
  });

  it("critic_disposition matches CriticDisposition (PRD §6) exactly", () => {
    expect(criticDispositionEnum.enumValues).toEqual(Object.values(CriticDisposition));
  });

  it("connectivity_status matches ConnectivityStatus (PRD §6 overlay) exactly", () => {
    expect(connectivityStatusEnum.enumValues).toEqual(Object.values(ConnectivityStatus));
  });

  it("carries the expected concrete values (guards against silent reordering)", () => {
    expect(projectFlowEnum.enumValues).toContain("draft_goal");
    expect(branchStateEnum.enumValues).toContain("not_configured");
    expect(criticDispositionEnum.enumValues).toContain("ready_with_caveats");
  });
});
