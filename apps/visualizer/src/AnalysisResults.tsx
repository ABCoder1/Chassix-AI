import type { ReactNode } from "react";
import {
  AlertTriangle,
  Database,
  Dna,
  FlaskConical,
  GitBranch,
  Link2,
  Microscope,
} from "lucide-react";
import type { AnalysisBundle, AnalysisStatus, Artifact } from "@chassix/analysis-bundle";
import { resolveArtifacts } from "./bundle/provider";
import { ReasoningPanel } from "./ReasoningPanel";
import {
  STATUS_LABEL,
  YIELD_KIND_LABEL,
  conditionLine,
  countSignificant,
  formatLog2Fc,
  formatP,
  formatUncertainty,
  formatValue,
  organismLine,
} from "./bundle/format";
import "./analysis.css";

function StatusChip({ status }: { status: AnalysisStatus }) {
  const s = STATUS_LABEL[status];
  return <span className={`ar-status ar-status-${s.tone}`}>{s.label}</span>;
}

function ArtifactLinks({ artifacts }: { artifacts: Artifact[] }) {
  if (!artifacts.length) return null;
  return (
    <div className="ar-artifacts">
      <Link2 size={12} />
      {artifacts.map((a) => (
        <a key={a.id} href={a.uri} title={`${a.role} · ${a.uri}`} target="_blank" rel="noreferrer">
          {a.role}
        </a>
      ))}
    </div>
  );
}

/** Shared section frame: title, status, method, and a missing-data message when absent. */
function Section(props: {
  icon: ReactNode;
  title: string;
  status: AnalysisStatus;
  method?: string | null;
  reason?: string | null;
  artifacts: Artifact[];
  children: ReactNode;
}) {
  const showBody = props.status === "available" || props.status === "partial";
  return (
    <article className={`ar-card ${showBody ? "" : "ar-card-empty"}`}>
      <header className="ar-card-head">
        <span className="ar-card-icon">{props.icon}</span>
        <h3>{props.title}</h3>
        <StatusChip status={props.status} />
      </header>
      {props.method && <p className="ar-method">{props.method}</p>}
      {showBody ? (
        props.children
      ) : (
        <p className="ar-empty-reason">
          <AlertTriangle size={13} />
          {props.reason ?? "No result was produced for this analysis."}
        </p>
      )}
      <ArtifactLinks artifacts={props.artifacts} />
    </article>
  );
}

/**
 * Real-data dashboard. Renders a validated analysis bundle in NATIVE units with
 * provenance, and shows explicit status for missing/failed analyses. It never
 * rescales values and never fabricates a result — the opposite of the demo twin.
 */
export function AnalysisResults({ bundle }: { bundle: AnalysisBundle }) {
  const { run, organism, condition, analyses } = bundle;
  const ge = analyses.geneExpression;
  const flux = analyses.flux;
  const metab = analyses.metabolomics;
  const yld = analyses.yield;
  const interactions = analyses.interactions;

  const geneRows = ge
    ? [...ge.results].sort(
        (a, b) => Math.abs(b.log2FoldChange ?? 0) - Math.abs(a.log2FoldChange ?? 0),
      )
    : [];

  return (
    <section className="analysis-results" aria-label="Workflow-backed analysis results">
      <div className="ar-provenance">
        <div className="ar-prov-main">
          <span className="ar-eyebrow">
            <Database size={13} /> WORKFLOW RESULTS
          </span>
          <h2>{organismLine(organism)}</h2>
          <p>
            {conditionLine(condition)} · chassis <strong>{organism.chassisId}</strong>
            {organism.strainId ? ` · strain ${organism.strainId}` : ""}
          </p>
        </div>
        <div className="ar-prov-meta">
          <div>
            <span>Run</span>
            <strong>{run.id}</strong>
          </div>
          <div>
            <span>Workflow</span>
            <strong>
              {run.workflowId}
              {run.workflowVersion ? ` @ ${run.workflowVersion}` : ""}
            </strong>
          </div>
          <div>
            <span>Status</span>
            <strong className={`ar-run-status ar-run-${run.status}`}>{run.status}</strong>
          </div>
          {run.modelVersions && run.modelVersions.length > 0 && (
            <div>
              <span>Models</span>
              <strong>{run.modelVersions.map((m) => `${m.id} ${m.version}`).join(", ")}</strong>
            </div>
          )}
        </div>
      </div>

      <div className="ar-grid">
        {ge && (
          <Section
            icon={<Dna size={15} />}
            title="Gene expression"
            status={ge.status}
            method={ge.method}
            reason={ge.notAvailableReason}
            artifacts={resolveArtifacts(bundle, ge.artifactIds)}
          >
            <p className="ar-subtle">
              Contrast <strong>{ge.contrastId ?? "—"}</strong> · {countSignificant(geneRows)}{" "}
              significant (padj &lt; 0.05) of {geneRows.length}
            </p>
            <table className="ar-table">
              <thead>
                <tr>
                  <th>Gene</th>
                  <th className="num">log₂FC</th>
                  <th className="num">p</th>
                  <th className="num">padj</th>
                </tr>
              </thead>
              <tbody>
                {geneRows.slice(0, 8).map((r) => (
                  <tr key={r.featureId}>
                    <td>
                      <strong>{r.symbol ?? r.featureId}</strong>
                      {r.symbol && <small> {r.featureId}</small>}
                    </td>
                    <td
                      className={`num ${(r.log2FoldChange ?? 0) > 0 ? "up" : (r.log2FoldChange ?? 0) < 0 ? "down" : ""}`}
                    >
                      {formatLog2Fc(r.log2FoldChange)}
                    </td>
                    <td className="num">{formatP(r.pValue)}</td>
                    <td className="num">{formatP(r.adjustedPValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {flux && (
          <Section
            icon={<GitBranch size={15} />}
            title="Flux (FBA)"
            status={flux.status}
            method={flux.method}
            reason={flux.notAvailableReason}
            artifacts={resolveArtifacts(bundle, flux.artifactIds)}
          >
            <p className="ar-subtle">
              Objective <strong>{flux.objective ?? "—"}</strong>
              {flux.modelId ? ` · model ${flux.modelId}` : ""}
            </p>
            <table className="ar-table">
              <thead>
                <tr>
                  <th>Reaction</th>
                  <th className="num">Flux</th>
                </tr>
              </thead>
              <tbody>
                {flux.results.slice(0, 8).map((r) => {
                  const ci = formatUncertainty(r.uncertainty, r.unit);
                  return (
                    <tr key={r.reactionId}>
                      <td>
                        <strong>{r.reactionName ?? r.reactionId}</strong>
                        {r.reactionName && <small> {r.reactionId}</small>}
                      </td>
                      <td className="num">
                        {formatValue(r.flux, r.unit, { signed: true })}
                        {ci && <small className="ar-ci"> {ci}</small>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {flux.pathwaySummaries && flux.pathwaySummaries.length > 0 && (
              <div className="ar-pathways">
                {flux.pathwaySummaries.map((p) => (
                  <span key={p.pathwayId} className="ar-pill">
                    {p.name}: {formatValue(p.flux, p.unit, { signed: true })}
                  </span>
                ))}
              </div>
            )}
          </Section>
        )}

        {yld && (
          <Section
            icon={<FlaskConical size={15} />}
            title="Yield"
            status={yld.status}
            method={yld.method}
            reason={yld.notAvailableReason}
            artifacts={resolveArtifacts(bundle, yld.artifactIds)}
          >
            <div className="ar-yields">
              {yld.results.map((r) => {
                const ci = formatUncertainty(r.uncertainty, r.unit);
                return (
                  <div key={r.metricId} className="ar-yield">
                    <div className="ar-yield-top">
                      <span>{r.name ?? r.metricId}</span>
                      <span className={`ar-kind ar-kind-${r.kind}`}>
                        {YIELD_KIND_LABEL[r.kind]}
                      </span>
                    </div>
                    <strong>{formatValue(r.value, r.unit)}</strong>
                    {ci && <small className="ar-ci">{ci}</small>}
                    {r.replicateCount && (
                      <small className="ar-subtle"> · n={r.replicateCount}</small>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {metab && (
          <Section
            icon={<Microscope size={15} />}
            title="Metabolomics"
            status={metab.status}
            method={metab.method}
            reason={metab.notAvailableReason}
            artifacts={resolveArtifacts(bundle, metab.artifactIds)}
          >
            <table className="ar-table">
              <thead>
                <tr>
                  <th>Metabolite</th>
                  <th className="num">Value</th>
                  <th className="num">Change</th>
                  <th className="num">padj</th>
                </tr>
              </thead>
              <tbody>
                {metab.results.slice(0, 8).map((r) => (
                  <tr key={r.featureId}>
                    <td>
                      <strong>{r.name ?? r.featureId}</strong>
                    </td>
                    <td className="num">{formatValue(r.value, r.unit)}</td>
                    <td className="num">
                      {r.change !== null && r.change !== undefined
                        ? formatValue(r.change, r.changeUnit ?? "", { signed: true })
                        : "—"}
                    </td>
                    <td className="num">{formatP(r.adjustedPValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {interactions && (
          <Section
            icon={<Link2 size={15} />}
            title="Interactions"
            status={interactions.status}
            method={interactions.method}
            reason={interactions.notAvailableReason}
            artifacts={resolveArtifacts(bundle, interactions.artifactIds)}
          >
            <table className="ar-table">
              <thead>
                <tr>
                  <th>Pair</th>
                  <th>Type</th>
                  <th className="num">Score</th>
                </tr>
              </thead>
              <tbody>
                {interactions.results.slice(0, 8).map((r, i) => (
                  <tr key={`${r.sourceId}-${r.targetId}-${i}`}>
                    <td>
                      <strong>
                        {r.sourceId} → {r.targetId}
                      </strong>
                    </td>
                    <td>
                      {r.interactionType} <small>{r.evidenceType}</small>
                    </td>
                    <td className="num">
                      {r.score !== null && r.score !== undefined ? r.score.toFixed(2) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}
      </div>

      <p className="ar-disclaimer">
        Values are shown in their native units with run, method, model, organism/strain, condition,
        and source-artifact provenance. Missing or failed analyses are marked explicitly and are
        never replaced with a plausible-looking value.
      </p>

      <ReasoningPanel bundle={bundle} />
    </section>
  );
}
