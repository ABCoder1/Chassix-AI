import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Database,
  ExternalLink,
  FlaskConical,
  Link2,
  ShieldCheck,
} from "lucide-react";
import evidence from "./data/evidence.json";

type Observation = (typeof evidence.studies)[number]["observations"][number];
type Study = (typeof evidence.studies)[number];
const studies = evidence.studies as Study[];
const colors: Record<string, string> = {
  bacterium: "#6ed7b1",
  yeast: "#a9a0ff",
  archaeon: "#edbc67",
};
const positions: Record<string, [number, number]> = {
  rpoS: [12, 24],
  gadE: [36, 24],
  gadX: [64, 24],
  gadW: [88, 24],
  gadA: [13, 76],
  gadB: [32, 76],
  gadC: [51, 76],
  hdeA: [70, 76],
  hdeB: [89, 76],
  HSF1: [50, 29],
  MSN2: [25, 29],
  MSN4: [75, 29],
  HSP104: [18, 73],
  HSP82: [38, 73],
  SSA1: [58, 73],
  TPS1: [78, 73],
  CTT1: [90, 73],
  SKN7: [12, 29],
  PF1883: [18, 48],
  PF1882: [34, 48],
  PF0963: [50, 48],
  PF1974: [66, 48],
  PF0380: [82, 48],
};

function signed(value: number, digits = 2) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

export function EvidenceExplorer({ chassisId }: { chassisId: "yeast" | "bacterium" | "archaeon" }) {
  const [selected, setSelected] = useState(
    () => studies.find((study) => study.chassisId === chassisId)?.id ?? studies[0].id,
  );
  const [geneId, setGeneId] = useState("");
  useEffect(() => {
    setSelected(studies.find((study) => study.chassisId === chassisId)?.id ?? studies[0].id);
    setGeneId("");
  }, [chassisId]);
  const study = studies.find((item) => item.id === selected) ?? studies[0];
  const observations = study.observations as Observation[];
  const byId = useMemo(
    () => Object.fromEntries(observations.map((item) => [item.id, item])),
    [observations],
  );
  const active = byId[geneId] ?? observations[0];
  const maxAbs = Math.max(1, ...observations.map((item) => Math.abs(item.value)));
  const edgePairs = study.edges.filter((edge) => byId[edge.from] && byId[edge.to]);
  const regulatorIds = new Set(edgePairs.map((edge) => edge.from));
  const nodePositions = Object.fromEntries(
    observations.map((item, index) => [
      item.id,
      positions[item.id] ?? [12 + (index % 5) * 19, 50 + Math.floor(index / 5) * 20],
    ]),
  ) as Record<string, [number, number]>;
  const accent = colors[study.chassisId];

  return (
    <div className="evidence-explorer">
      <div className="evidence-topline">
        <span>
          <span className="live-dot" />
          EVIDENCE WORKSPACE / PROOF OF CONCEPT
        </span>
        <span>READ-ONLY · SOURCED STUDIES</span>
      </div>
      <div className="evidence-intro">
        <div>
          <span className="section-label">FROM PUBLIC DATA TO AN INSPECTABLE DIGITAL TWIN</span>
          <h2>Evidence, before prediction.</h2>
          <p>
            Explore measured microbial responses from the Chassix-AI data audit. Each study keeps
            its organism, strain, conditions, assay, samples, and source attached.
          </p>
        </div>
        <div className="evidence-summary">
          <strong>03</strong>
          <span>curated studies</span>
          <strong>23</strong>
          <span>gene-level observations</span>
        </div>
      </div>
      <div className="evidence-study-tabs" role="tablist" aria-label="Published data studies">
        {studies.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={selected === item.id}
            className={selected === item.id ? "active" : ""}
            onClick={() => {
              setSelected(item.id);
              setGeneId("");
            }}
            style={{ "--study-color": colors[item.chassisId] } as React.CSSProperties}
          >
            <span>{item.organism}</span>
            <small>{item.shortTitle}</small>
          </button>
        ))}
      </div>
      <section
        className="evidence-study-header"
        style={{ "--study-color": accent } as React.CSSProperties}
      >
        <div className="evidence-study-title">
          <span className="evidence-measured">
            <ShieldCheck size={13} />
            PUBLISHED MEASUREMENTS
          </span>
          <h3>{study.title}</h3>
          <p>
            <em>{study.organism}</em> · {study.strain}
          </p>
        </div>
        <div className="evidence-conditions">
          <span>CONTRAST</span>
          <strong>
            {study.reference} <i>→</i> {study.condition}
          </strong>
          <small>{study.context}</small>
        </div>
        <div className="evidence-assay">
          <span>ASSAY / MEASURE</span>
          <strong>{study.assay}</strong>
          <small>{study.unit}</small>
        </div>
      </section>
      <div className={`evidence-grid ${edgePairs.length ? "has-network" : ""}`}>
        <section className="evidence-panel evidence-measurements">
          <div className="evidence-panel-heading">
            <div>
              <span className="section-label">OBSERVED GENE RESPONSE</span>
              <h3>Replicate values and derived contrast</h3>
            </div>
            <span className="evidence-unit">{study.unit}</span>
          </div>
          <div className="evidence-chart-axis">
            <span>Gene</span>
            <span>{study.unit}</span>
            <span>Reference → condition</span>
          </div>
          <div className="evidence-observation-list">
            {observations.map((item) => (
              <button
                key={item.id}
                className={`evidence-observation ${active.id === item.id ? "selected" : ""}`}
                onClick={() => setGeneId(item.id)}
                aria-pressed={active.id === item.id}
              >
                <span className="evidence-gene-id">
                  {item.id}
                  <small>
                    {item.locus}
                    {item.probe ? ` · ${item.probe}` : ""}
                  </small>
                </span>
                <span className="evidence-bar-cell">
                  <i
                    className={item.value < 0 ? "negative" : "positive"}
                    style={
                      {
                        "--bar-width": `${Math.max(2, (Math.abs(item.value) / maxAbs) * 47)}%`,
                        "--bar-sign": item.value < 0 ? "-1" : "1",
                      } as React.CSSProperties
                    }
                  />
                  <b className={item.value < 0 ? "negative-text" : "positive-text"}>
                    {signed(item.value)}
                  </b>
                </span>
                <span className="evidence-raw-values">
                  {item.referenceValues.length
                    ? `${item.referenceValues.map((value) => value.toFixed(2)).join(" · ")} → `
                    : ""}
                  {item.conditionValues.map((value) => value.toFixed(2)).join(" · ")}
                </span>
              </button>
            ))}
          </div>
          <div className="evidence-method">
            <FlaskConical size={15} />
            <p>{study.method}</p>
          </div>
        </section>
        <section className="evidence-panel evidence-detail">
          <div className="evidence-panel-heading">
            <div>
              <span className="section-label">SELECTED OBSERVATION</span>
              <h3>
                {active.id} <small>{active.label}</small>
              </h3>
            </div>
            <strong
              className={`evidence-delta ${active.value < 0 ? "negative-text" : "positive-text"}`}
            >
              {signed(active.value)}
            </strong>
          </div>
          <div className="evidence-means">
            <div>
              <span>Reference replicates</span>
              <strong>
                {active.referenceValues.length
                  ? active.referenceValues.map((value) => value.toFixed(3)).join(" · ")
                  : "Not reported"}
              </strong>
            </div>
            <div>
              <span>Condition replicates</span>
              <strong>{active.conditionValues.map((value) => value.toFixed(3)).join(" · ")}</strong>
            </div>
            {active.reportedSd && (
              <div>
                <span>Reported SDs</span>
                <strong>{active.reportedSd.join(" · ")}</strong>
              </div>
            )}
          </div>
          <div className="evidence-samples">
            <span className="section-label">SAMPLE TRACE</span>
            <div>
              {study.samples.length ? (
                study.samples.map((sample) => (
                  <span
                    key={sample.id}
                    className={`sample-chip ${sample.group === "Condition" ? "condition" : ""}`}
                  >
                    {sample.group === "Reference" ? "REF" : "COND"} ·{" "}
                    {sample.id.replace("p1k_", "P1K-")}
                  </span>
                ))
              ) : (
                <p>{study.sampleNote}</p>
              )}
            </div>
          </div>
          <div className="evidence-limitation">
            <strong>Interpretation boundary</strong>
            <p>{study.limitation}</p>
          </div>
        </section>
        {edgePairs.length > 0 && (
          <section className="evidence-panel evidence-network">
            <div className="evidence-panel-heading">
              <div>
                <span className="section-label">REGULATORY CONTEXT</span>
                <h3>Measured expression + curated links</h3>
              </div>
              <span className="evidence-link-key">
                <i />
                curated edge
              </span>
            </div>
            <div
              className="evidence-network-canvas"
              aria-label="Curated E. coli regulatory links with measured expression changes"
            >
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <marker
                    id="evidence-arrow"
                    viewBox="0 0 8 8"
                    refX="7"
                    refY="4"
                    markerWidth="4"
                    markerHeight="4"
                    orient="auto-start-reverse"
                  >
                    <path d="M0 0L8 4L0 8Z" fill="#82a19a" />
                  </marker>
                </defs>
                {edgePairs.map((edge, index) => {
                  const from = nodePositions[edge.from];
                  const to = nodePositions[edge.to];
                  return (
                    <g key={`${edge.from}-${edge.to}-${index}`}>
                      <line
                        x1={`${from[0]}%`}
                        y1={`${from[1]}%`}
                        x2={`${to[0]}%`}
                        y2={`${to[1]}%`}
                        markerEnd="url(#evidence-arrow)"
                        className={
                          active.id === edge.from || active.id === edge.to ? "highlighted" : ""
                        }
                      />
                      <text x={`${(from[0] + to[0]) / 2}%`} y={`${(from[1] + to[1]) / 2}%`}>
                        {edge.effect}
                      </text>
                    </g>
                  );
                })}
              </svg>
              {observations.map((item) => {
                const [x, y] = nodePositions[item.id];
                const isRegulator = regulatorIds.has(item.id);
                return (
                  <button
                    key={item.id}
                    className={`evidence-network-node ${isRegulator ? "regulator" : ""} ${active.id === item.id ? "active" : ""}`}
                    style={
                      {
                        left: `${x}%`,
                        top: `${y}%`,
                        "--node-color": isRegulator ? "#e5bc70" : accent,
                      } as React.CSSProperties
                    }
                    onClick={() => setGeneId(item.id)}
                  >
                    <strong>{item.id}</strong>
                    <small>{signed(item.value)}</small>
                  </button>
                );
              })}
            </div>
            <p className="evidence-edge-note">
              {study.edgeNote} Edge sign is from the reference annotation. It does not imply that
              the regulator’s activity was measured in this contrast.
            </p>
          </section>
        )}
      </div>
      <section className="evidence-source-row">
        <div className="evidence-source-card">
          <BookOpen size={15} />
          <div>
            <span className="section-label">PRIMARY LITERATURE</span>
            <a key={`${study.id}-paper`} href={study.sourceUrl} target="_blank" rel="noreferrer">
              {study.sourceTitle} <ExternalLink size={11} />
            </a>
            <small>
              {study.citation} · {study.accession} · {study.sourceLocator}
            </small>
          </div>
        </div>
        <div className="evidence-source-card">
          <Database size={15} />
          <div>
            <span className="section-label">DATA PROVENANCE</span>
            <a key={`${study.id}-dataset`} href={study.dataUrl} target="_blank" rel="noreferrer">
              Open source dataset <ExternalLink size={11} />
            </a>
            <small>{study.sampleNote}</small>
          </div>
        </div>
        <div className="evidence-source-card">
          <Link2 size={15} />
          <div>
            <span className="section-label">SOURCE WORKBOOK</span>
            <a href={evidence.sourceWorkbook} target="_blank" rel="noreferrer">
              Chassix multiomics ingestion targets <ExternalLink size={11} />
            </a>
            <small>{study.license}</small>
          </div>
        </div>
      </section>
      <details className="evidence-catalog">
        <summary>
          <span>
            <Database size={14} /> Browse the audited chassis catalog ({evidence.catalog.length})
          </span>
          <span>Training data coverage, held-out organisms, and strain notes</span>
        </summary>
        <div className="evidence-catalog-grid">
          {evidence.catalog.map((item) => (
            <article key={item.id}>
              <div>
                <strong>{item.organism}</strong>
                <span className={item.partition === "Held-out target" ? "held-out" : ""}>
                  {item.partition}
                </span>
              </div>
              <small>
                {item.domain} · {item.strain}
              </small>
              <p>{item.dataDepth}</p>
              <small className="catalog-note">
                {item.note || "No additional strain-specific retrieval note."}
              </small>
            </article>
          ))}
        </div>
        <p className="evidence-edge-note">
          The catalog summarizes candidate data resources from the workbook. It is not a claim that
          all organisms have paired multiomics or have been ingested for model training.
        </p>
      </details>
      <div className="evidence-footer">
        <ShieldCheck size={14} />
        <span>
          Literature observations are shown as data. The digital-twin scenario sliders and heuristic
          estimates remain separate prototype outputs.
        </span>
        <span>
          <ArrowUp size={12} />
          positive <ArrowDown size={12} />
          negative
        </span>
      </div>
    </div>
  );
}
