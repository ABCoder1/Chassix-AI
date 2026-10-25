import {
  Activity,
  AlertTriangle,
  Atom,
  CheckCircle2,
  Cpu,
  Dna,
  Flame,
  Layers3,
  Shield,
  Zap,
} from "lucide-react";
import type { ChassisId, Response } from "./model";
import {
  getExpressionRows,
  illustrativeIndex,
  networkFor,
  ORGANELLE_NETWORKS,
} from "./pathwayData";
import type { PathwayMode } from "./pathwayData";
import type { SimulationResult } from "./simulation";

const ICONS = {
  stress: Flame,
  aggregates: Layers3,
  envelope: Layers3,
  folding: AlertTriangle,
  catalase: Shield,
  ros: Zap,
  sensors: Activity,
  genome: Dna,
  homeostasis: CheckCircle2,
  mitochondria: Cpu,
};
export type DataViewMode = PathwayMode | "twin" | "evidence";
export const MAP_NODE_LABELS: Record<string, string> = Object.fromEntries(
  Object.values(ORGANELLE_NETWORKS).flatMap((network) =>
    network.nodes.map((node) => [node.id, node.short]),
  ),
);

export function ExpressionMatrix({
  chassisId,
  simulation,
  onSelect,
  selected,
}: {
  chassisId: ChassisId;
  simulation: SimulationResult;
  onSelect: (id: string) => void;
  selected: string;
}) {
  const rows = getExpressionRows(chassisId);
  if (!rows.length)
    return (
      <div className="fixture-empty">
        <Dna size={16} />
        <p>No expression fixture is connected for this chassis.</p>
      </div>
    );
  return (
    <div className="expression-fixture">
      <div className="fixture-provenance">REFERENCE FIXTURE + LIVE DEMO INDEX</div>
      {rows.map((item) => {
        const signal = simulation.genes.find((gene) => gene.id === item.id);
        return (
          <button
            className={`expression-row ${selected === item.id ? "selected" : ""}`}
            key={item.id}
            onClick={() => onSelect(item.id)}
            style={{ "--gene-color": item.color } as React.CSSProperties}
          >
            <span className="expression-name">{item.label}</span>
            <strong className="expression-live">
              {signal?.index ?? item.base}
              <small>/100</small>
            </strong>
            <small className="expression-motif">
              DEMO EXPRESSION INDEX · Ref {item.fixtureValue} · Δ{" "}
              {signal?.delta && signal.delta > 0 ? "+" : ""}
              {signal?.delta ?? 0}
            </small>
          </button>
        );
      })}
      <p className="fixture-footnote">
        The changing index is simulated. Reference values were transcribed from the recording;
        sample and assay details are unavailable.
      </p>
    </div>
  );
}

export function OrganelleMap({
  chassisId,
  response,
  simulation,
  selected,
  onSelect,
  playing,
}: {
  chassisId: ChassisId;
  response: Response;
  simulation: SimulationResult;
  selected: string;
  onSelect: (id: string) => void;
  playing: boolean;
}) {
  const network = networkFor(chassisId, "organelle");
  if (!network)
    return (
      <div className="map-empty">
        <Atom size={28} />
        <span className="section-label">CHASSIS-SPECIFIC MAP UNAVAILABLE</span>
        <h2>Bacterial chassis</h2>
        <p>The interactive response map in this prototype has no bacterial pathway fixture yet.</p>
      </div>
    );
  const nodes = network.nodes.map((node) => ({
    ...node,
    index:
      simulation.pathways.find((item) => item.id === node.id)?.index ??
      illustrativeIndex(node.base, response),
  }));
  const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const active = byId[selected] ?? nodes[2];
  return (
    <div className="map-view">
      <div className="map-topline">
        <span>
          <span className={`live-dot ${playing ? "" : "paused"}`} />
          {playing ? "SCENARIO ANIMATION" : "ANIMATION PAUSED"}
        </span>
        <span>DEMO FLUX PROXY · rFU</span>
      </div>
      <svg
        className="cell-map"
        viewBox="0 0 1000 700"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <pattern id="hex-mesh" width="22" height="19" patternUnits="userSpaceOnUse">
            <path
              d="M5.5 0H16.5L22 9.5 16.5 19H5.5L0 9.5Z"
              fill="none"
              stroke={chassisId === "archaeon" ? "#bc8c45" : "#8060c5"}
              strokeOpacity=".4"
              strokeWidth="1"
            />
          </pattern>
          <clipPath id="cell-clip">
            <ellipse cx="510" cy="360" rx="405" ry="290" />
          </clipPath>
        </defs>
        <ellipse
          cx="510"
          cy="360"
          rx="405"
          ry="290"
          fill="#0a0c20"
          fillOpacity=".63"
          stroke={chassisId === "archaeon" ? "#b97d33" : "#7956c8"}
          strokeWidth="3"
        />
        <g clipPath="url(#cell-clip)">
          <rect x="95" y="68" width="830" height="584" fill="url(#hex-mesh)" />
        </g>
        {network.edges.map(([from, to]) => (
          <line
            key={`${from}-${to}`}
            x1={`${byId[from].x}%`}
            y1={`${byId[from].y}%`}
            x2={`${byId[to].x}%`}
            y2={`${byId[to].y}%`}
            stroke={from === selected || to === selected ? byId[to].color : "#53627b"}
            strokeOpacity={from === selected || to === selected ? ".8" : ".38"}
            strokeWidth={from === selected || to === selected ? "2" : "1.3"}
            strokeDasharray={playing ? "7 7" : "0"}
            className={playing ? "map-edge-flow" : ""}
          />
        ))}
      </svg>
      <div className="map-label">[ {network.title.toUpperCase()} ]</div>
      {nodes.map((node) => {
        const Icon = ICONS[node.id as keyof typeof ICONS] ?? Atom;
        return (
          <button
            key={node.id}
            className={`map-node ${selected === node.id ? "selected" : ""}`}
            onClick={() => onSelect(node.id)}
            aria-pressed={selected === node.id}
            style={
              {
                left: `${node.x}%`,
                top: `${node.y}%`,
                "--node-color": node.color,
              } as React.CSSProperties
            }
          >
            <span className="map-node-icon">
              <Icon size={19} />
            </span>
            <span className="map-node-copy">
              <strong>{node.label}</strong>
              <small>Demo flux proxy: {node.index} rFU</small>
            </span>
          </button>
        );
      })}
      <div className="map-detail" style={{ "--node-color": active.color } as React.CSSProperties}>
        <span className="map-detail-icon">
          <Atom size={17} />
        </span>
        <div>
          <strong>{active.short}</strong>
          <p>{active.description}</p>
        </div>
      </div>
      <div className="map-legend">
        <span className="legend-swatch" />
        Conceptual connection · illustrative fixture
      </div>
    </div>
  );
}

export function GrnView({
  chassisId,
  response,
  simulation,
  selected,
  onSelect,
}: {
  chassisId: ChassisId;
  response: Response;
  simulation: SimulationResult;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const network = networkFor(chassisId, "grn");
  if (!network)
    return (
      <div className="grn-view">
        <div className="grn-heading">
          <div>
            <span className="section-label">GENE REGULATORY NETWORK</span>
            <h2>No fixture for this chassis</h2>
            <p>Curated example rows have not been added for this chassis.</p>
          </div>
          <span className="grn-status">
            <span />
            DATA UNAVAILABLE
          </span>
        </div>
      </div>
    );
  const byId = Object.fromEntries(network.nodes.map((node) => [node.id, node]));
  return (
    <div className="grn-view">
      <div className="grn-heading">
        <div>
          <span className="section-label">GENE REGULATORY NETWORK</span>
          <h2>{network.title}</h2>
          <p>Stress-responsive demo indices · reference values remain unchanged.</p>
        </div>
        <span className="grn-status">
          <span />
          LINKS ILLUSTRATIVE
        </span>
      </div>
      <div className="grn-graph">
        <svg viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
          {network.edges.map(([from, to]) => (
            <line
              key={`${from}-${to}`}
              x1={`${byId[from].x}%`}
              y1={`${byId[from].y}%`}
              x2={`${byId[to].x}%`}
              y2={`${byId[to].y}%`}
              stroke={from === selected || to === selected ? byId[to].color : "#dd9b2d"}
              strokeOpacity={from === selected || to === selected ? ".9" : ".68"}
              strokeWidth={from === selected || to === selected ? 3 : 2}
              strokeDasharray="7 8"
              className="map-edge-flow"
            />
          ))}
        </svg>
        {network.nodes.map((node) => {
          const signal = simulation.genes.find((gene) => gene.id === node.id);
          return (
            <button
              key={node.id}
              onClick={() => onSelect(node.id)}
              className={`grn-node ${selected === node.id ? "selected" : ""} ${node.role ?? ""}`}
              style={
                {
                  left: `${node.x}%`,
                  top: `${node.y}%`,
                  "--gene-color": node.color,
                } as React.CSSProperties
              }
            >
              <span className="grn-node-title">
                <Dna size={14} />
                <strong>{node.label}</strong>
              </span>
              <small>{node.short}</small>
              {node.motif && <code>Motif: {node.motif}</code>}
              <em>
                Demo expression index {signal?.index ?? illustrativeIndex(node.base, response)}/100
                · Δ {signal?.delta && signal.delta > 0 ? "+" : ""}
                {signal?.delta ?? 0}
              </em>
              {node.fixtureValue && (
                <small className="grn-reference">Reference fixture: {node.fixtureValue}</small>
              )}
            </button>
          );
        })}
      </div>
      <div className="grn-caveat">
        <AlertTriangle size={17} />
        <div>
          <strong>Design-reference fixture · not measured</strong>
          <p>
            {network.provenance} Dashed lines are illustrative wiring from the recording. Dynamic
            indices are demo estimates, not assay results.
          </p>
        </div>
      </div>
    </div>
  );
}
