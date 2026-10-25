import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, StatusBadge, Tag, Table } from "@chassix/ui";
import { BranchState } from "@chassix/shared";
import { ILLUSTRATIVE_PLAN } from "../planData";
import type { PlanDraft } from "../planData";
import { BrandBar } from "../components/BrandBar";
import { LoadingOverlay, useTimedLoading } from "../components/LoadingOverlay";
import "./plan.css";

/**
 * Step 3.2 — Plan review & frozen manifest (Screen 4, BF-05, PRD §D).
 *
 * Shows the selected hosts + datasets + proposed tools + parameters + required
 * references + expected outputs + an estimated-resource note per branch. Advanced
 * parameters are collapsed behind an expander; unresolved assumptions and blocked
 * branches are highlighted. "Start analyses" (illustratively) freezes the manifest
 * and navigates to the run monitor; once launched the manifest is immutable and a
 * note explains that editing creates a new draft.
 *
 * The plan is read from a fixture (`ILLUSTRATIVE_PLAN`) via a prop default, so a
 * later swap to a fetched manifest is a one-line change and the structure already
 * mirrors @chassix/shared's `RunManifest`. All data is illustrative and labeled.
 */

export interface PlanReviewPageProps {
  /** The plan draft to render. Defaults to the illustrative fixture. */
  plan?: PlanDraft;
  /** Invoked when analyses are started (after the manifest is frozen). */
  onLaunch?: (runId: string) => void;
}

export function PlanReviewPage({ plan = ILLUSTRATIVE_PLAN, onLaunch }: PlanReviewPageProps) {
  const navigate = useNavigate();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [launched, setLaunched] = useState(false);

  const blockedBranches = plan.branches.filter((b) => b.blockedReason);
  const hasBlockers = blockedBranches.length > 0 || plan.unresolvedAssumptions.length > 0;
  const basicParams = plan.parameters.filter((p) => !p.advanced);
  const advancedParams = plan.parameters.filter((p) => p.advanced);
  const loading = useTimedLoading(3200);

  function handleLaunch() {
    // Illustratively "freeze" the manifest: mark launched (immutable), then go to
    // the run monitor. Real launch (idempotency key, write-once manifest) is Step 3.3.
    setLaunched(true);
    if (onLaunch) onLaunch(plan.runId);
    else navigate(`/runs/${plan.runId}`);
  }

  if (loading) {
    return (
      <div className="plan">
        <BrandBar />
        <main className="plan__main" id="main">
          <LoadingOverlay
            label="Preparing execution plan…"
            sub="Resolving tools, references and resource estimates for each analysis branch."
          />
        </main>
      </div>
    );
  }

  return (
    <div className="plan">
      <BrandBar />
      <main className="plan__main" id="main">
        <div className="plan__head">
          <div>
            <h1 className="plan__title">Plan review</h1>
          </div>
        </div>

        {/* Immutability contract — always visible so the manifest rules are clear
            before AND after launch (BF-05: write-once, edits create a new draft). */}
        <p className="plan__immutable-note" role="note" data-testid="immutable-note">
          <strong>Manifest is immutable once launched.</strong> Starting analyses freezes this
          manifest (inputs snapshot, parameters, tool and reference versions, command) so the run is
          reproducible. Editing a launched plan does not change it — it{" "}
          <strong>creates a new draft</strong>.
        </p>

        {launched && (
          <p className="plan__launched" role="status" data-testid="launched-banner">
            Manifest frozen. This plan is now read-only; any edits would create a new draft.
          </p>
        )}

        {hasBlockers && (
          <section
            className="plan__alerts"
            aria-label="Unresolved assumptions and blocked branches"
            data-testid="plan-alerts"
          >
            <h2 className="plan__section-title">Needs attention before launch</h2>
            {plan.unresolvedAssumptions.length > 0 && (
              <div className="plan__alert" data-testid="unresolved-assumptions">
                <span className="plan__alert-tag">Unresolved assumptions</span>
                <ul className="plan__bullets">
                  {plan.unresolvedAssumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
            {blockedBranches.length > 0 && (
              <div className="plan__alert" data-testid="blocked-branches">
                <span className="plan__alert-tag">Blocked branches</span>
                <ul className="plan__bullets">
                  {blockedBranches.map((b) => (
                    <li key={b.id}>
                      <strong>{b.title}:</strong> {b.blockedReason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        <section className="plan__summary" aria-label="Selected hosts and datasets">
          <Card title="Hosts" className="plan__summary-card">
            <ul className="plan__chips" data-testid="plan-hosts">
              {plan.hosts.map((h) => (
                <li key={h}>
                  <Tag>{h}</Tag>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Datasets" className="plan__summary-card">
            <ul className="plan__chips" data-testid="plan-datasets">
              {plan.datasets.map((d) => (
                <li key={d}>
                  <Tag>{d}</Tag>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Contrasts" className="plan__summary-card">
            <ul className="plan__bullets" data-testid="plan-contrasts">
              {plan.contrasts.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </Card>
        </section>

        <section className="plan__branches" aria-label="Proposed analysis branches">
          <h2 className="plan__section-title">Proposed analyses</h2>
          {plan.branches.map((b) => (
            <Card
              key={b.id}
              className="plan__branch"
              data-testid={`plan-branch-${b.id}`}
              title={b.title}
              actions={
                b.blockedReason ? (
                  <StatusBadge kind="branch" status={BranchState.NotConfigured} />
                ) : (
                  <StatusBadge kind="branch" status={BranchState.Ready} />
                )
              }
            >
              {b.blockedReason && (
                <p className="plan__branch-blocked" role="note">
                  {b.blockedReason}
                </p>
              )}
              <dl className="plan__branch-grid">
                <div>
                  <dt>Host</dt>
                  <dd>{b.host}</dd>
                </div>
                <div>
                  <dt>Datasets</dt>
                  <dd>{b.datasets.join(", ")}</dd>
                </div>
                <div>
                  <dt>Proposed tools</dt>
                  <dd data-testid={`plan-tools-${b.id}`}>
                    {b.tools.map((t) => `${t.name} ${t.version}`).join(", ")}
                  </dd>
                </div>
                <div>
                  <dt>Required references</dt>
                  <dd>{b.references.map((r) => `${r.name} (${r.version})`).join(", ")}</dd>
                </div>
                <div>
                  <dt>Expected outputs</dt>
                  <dd>{b.expectedOutputs.join(", ")}</dd>
                </div>
                <div>
                  <dt>Compute environment</dt>
                  <dd>{b.environment}</dd>
                </div>
                <div>
                  <dt>Estimated resources</dt>
                  <dd>
                    {b.estimatedResources ?? (
                      <span className="plan__unknown">unknown (no executor estimate yet)</span>
                    )}
                  </dd>
                </div>
              </dl>
            </Card>
          ))}
        </section>

        <section className="plan__params" aria-label="Parameters">
          <h2 className="plan__section-title">Parameters</h2>
          <Table
            caption="Basic parameters"
            rowKey={(r) => r.key}
            columns={[
              { key: "key", header: "Parameter", render: (r) => r.key },
              { key: "value", header: "Value", render: (r) => r.value },
            ]}
            rows={basicParams}
          />
          <div className="plan__advanced">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={showAdvanced}
              aria-controls="plan-advanced-params"
              onClick={() => setShowAdvanced((s) => !s)}
            >
              {showAdvanced ? "Hide advanced parameters" : "Show advanced parameters"}
            </Button>
            {showAdvanced && (
              <div id="plan-advanced-params" data-testid="advanced-params">
                <Table
                  caption="Advanced parameters"
                  rowKey={(r) => r.key}
                  columns={[
                    { key: "key", header: "Parameter", render: (r) => r.key },
                    { key: "value", header: "Value", render: (r) => r.value },
                  ]}
                  rows={advancedParams}
                />
              </div>
            )}
          </div>
        </section>

        <div className="plan__launch" role="group" aria-label="Launch controls">
          <Button type="button" variant="secondary" onClick={() => navigate("/canvas")}>
            Back to canvas
          </Button>
          <Button type="button" variant="primary" onClick={handleLaunch} disabled={launched}>
            {launched ? "Analyses started" : "Start analyses"}
          </Button>
        </div>
      </main>
    </div>
  );
}
