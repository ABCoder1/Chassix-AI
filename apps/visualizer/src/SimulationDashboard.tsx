import { Activity, Atom, Dna, Gauge, Link2, Sparkles, Trophy } from "lucide-react";
import { CHASSIS, type ChassisId } from "./model";
import type { BondState, SimulationResult } from "./simulation";

const BOND_STATES: { id: BondState; label: string; color: string }[] = [
  { id: "forming", label: "Forming", color: "#35d7a5" },
  { id: "stable", label: "Stable", color: "#65b9d1" },
  { id: "rearranging", label: "Rearranging", color: "#f1b15b" },
  { id: "weakening", label: "Weakening", color: "#ed8a4a" },
  { id: "broken", label: "Disrupted", color: "#ef6271" },
];

function Meter({ value, color }: { value: number; color: string }) {
  return (
    <span className="sim-meter">
      <i style={{ width: `${value}%`, background: color }} />
    </span>
  );
}

function BondMap({ simulation }: { simulation: SimulationResult }) {
  const point = (position: [number, number, number]) => ({
    x: 20 + ((position[0] + 0.82) / 1.64) * 200,
    y: 15 + ((0.66 - position[1]) / 1.4) * 90,
  });
  return (
    <svg
      className="bond-map"
      viewBox="0 0 240 120"
      role="img"
      aria-label="Schematic interaction links colored by their current state"
    >
      <defs>
        <radialGradient id="bond-aura">
          <stop stopColor="#7c6ae9" stopOpacity=".23" />
          <stop offset="1" stopColor="#7c6ae9" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="120" cy="60" rx="112" ry="54" fill="url(#bond-aura)" />
      {simulation.bonds.map((bond) => {
        const a = point(bond.start),
          b = point(bond.end),
          middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const gap = bond.state === "broken" ? 11 : bond.state === "forming" ? 5 : 0;
        const dx = ((b.x - a.x) / distance) * gap,
          dy = ((b.y - a.y) / distance) * gap;
        const color = BOND_STATES.find((state) => state.id === bond.state)!.color;
        return (
          <g
            key={bond.id}
            className={`bond-map-link ${bond.state}`}
            style={{ "--bond-color": color } as React.CSSProperties}
          >
            <line x1={a.x} y1={a.y} x2={middle.x - dx} y2={middle.y - dy} />
            <line x1={middle.x + dx} y1={middle.y + dy} x2={b.x} y2={b.y} />
            <circle className="bond-map-node" cx={a.x} cy={a.y} r="3.2" />
            <circle className="bond-map-node" cx={b.x} cy={b.y} r="3.2" />
            {bond.state === "forming" && (
              <circle className="bond-map-pulse" cx={middle.x} cy={middle.y} r="3.2" />
            )}
            {bond.state === "broken" && (
              <circle className="bond-map-break" cx={middle.x} cy={middle.y} r="3" />
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function SimulationDashboard({
  simulation,
  chassisId,
}: {
  simulation: SimulationResult;
  chassisId: ChassisId;
}) {
  const counts = Object.fromEntries(
    BOND_STATES.map(({ id }) => [id, simulation.bonds.filter((bond) => bond.state === id).length]),
  ) as Record<BondState, number>;
  const yieldScore = simulation.yieldComparisons.find((item) => item.chassisId === chassisId)!;
  const bestMatch = simulation.yieldComparisons.reduce(
    (best, item) => (item.index > best.index ? item : best),
    simulation.yieldComparisons[0],
  );
  const strongestPaths = [...simulation.pathways]
    .filter((item) => item.id !== "stress")
    .sort((a, b) => b.index - a.index)
    .slice(0, 3);
  const term = (label: string, value: number) => (
    <span className={`flux-term ${value > 0.05 ? "up" : value < -0.05 ? "down" : ""}`} key={label}>
      <i>{label}</i>
      {value > 0 ? "+" : ""}
      {value.toFixed(1)}
    </span>
  );

  return (
    <section className="simulation-dashboard" aria-label="Live illustrative simulation outputs">
      <div className="sim-dashboard-heading">
        <div>
          <span className="section-label">
            <Activity size={13} /> LIVE MODEL RESPONSE
          </span>
          <p>
            One scenario updates the links, pathway signals, metabolite proxies, and chassis
            comparison.
          </p>
        </div>
        <div className="sim-heading-right">
          <div className="sim-input-pills">
            <span>
              <i className="heat" />
              {simulation.environment.temperature.toFixed(0)}°C
            </span>
            <span>
              <i className="salt" />
              {simulation.environment.salinity.toFixed(2)} M
            </span>
            <span>
              <i className="ph" />
              pH {simulation.environment.ph.toFixed(1)}
            </span>
          </div>
          <span className="sim-provider">
            <Sparkles size={12} /> DEMO · {simulation.provider}
          </span>
        </div>
      </div>
      <div className="sim-grid">
        <article className="sim-card bond-card">
          <div className="sim-card-title">
            <Link2 size={15} />
            <h3>Interaction bonds</h3>
            <span>{simulation.bonds.length} schematic links</span>
          </div>
          <BondMap simulation={simulation} />
          <div className="bond-state-list">
            {BOND_STATES.filter(({ id }) => id !== "stable" || counts.stable > 0).map(
              ({ id, label, color }) => (
                <div
                  className={counts[id] ? "has-count" : ""}
                  key={id}
                  style={{ "--state-color": color } as React.CSSProperties}
                >
                  <i />
                  <span>{label}</span>
                  <strong>{counts[id]}</strong>
                </div>
              ),
            )}
          </div>
          <p className="sim-card-note">
            Conceptual interaction links; not atom-resolved chemistry.
          </p>
        </article>

        <article className="sim-card metabolite-card">
          <div className="sim-card-title">
            <Atom size={15} />
            <h3>Metabolite pools</h3>
            <span>relative indices</span>
          </div>
          <div className="sim-metric-list">
            {simulation.metabolites.map((item, index) => (
              <div className="sim-metric" key={item.id}>
                <div>
                  <span>
                    <i className={`metabolite-mark mark-${index}`} />
                    {item.label}
                  </span>
                  <strong>
                    {item.index}
                    <small>/100</small>
                  </strong>
                </div>
                <Meter
                  value={item.index}
                  color={["#49c4df", "#bc91ff", "#f3b75c", "#3fd1a0"][index]}
                />
                <small
                  className={`sim-delta ${item.delta > 0 ? "positive" : item.delta < 0 ? "negative" : ""}`}
                >
                  {item.delta > 0 ? "↑" : item.delta < 0 ? "↓" : "•"} {Math.abs(item.delta)}{" "}
                  <span>from demo reference</span>
                </small>
              </div>
            ))}
          </div>
          <p className="sim-card-note">
            No concentration units or measured metabolomics are available in this demo.
          </p>
        </article>

        <article className="sim-card pathway-card">
          <div className="sim-card-title">
            <Dna size={15} />
            <h3>Live flux calculation</h3>
            <span>demo · rFU</span>
          </div>
          {strongestPaths.length ? (
            <>
              <div className="flux-formula">
                <span>
                  v<sub>rel</sub>
                </span>
                <code>clamp(base + ΔT + Δsalt + ΔpH + Δstress)</code>
                <b>0–100</b>
              </div>
              <div className="flux-calculations">
                {strongestPaths.map((item, index) => (
                  <div className="flux-calculation" key={item.id}>
                    <div className="flux-result">
                      <span>{item.label}</span>
                      <strong>
                        {item.index}
                        <small> rFU</small>
                      </strong>
                    </div>
                    <Meter value={item.index} color={["#bc91ff", "#45d4ad", "#f3b75c"][index]} />
                    <div className="flux-terms">
                      {term("base", item.calculation.baseline)}
                      {term("T", item.calculation.temperature)}
                      {term("salt", item.calculation.salinity)}
                      {term("pH", item.calculation.ph)}
                      {term("stress", item.calculation.combinedStress)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="generic-flux">
              <div className="flux-result">
                <span>Whole-cell demo throughput</span>
                <strong>
                  {simulation.wholeCellFlux.index}
                  <small> rFU</small>
                </strong>
              </div>
              <div className="flux-formula">
                <span>
                  v<sub>demo</sub>
                </span>
                <code>round(ATP × carbon × redox ÷ 10,000)</code>
                <b>0–100</b>
              </div>
              <div className="generic-flux-inputs">
                <span>
                  ATP <b>{simulation.wholeCellFlux.atp}</b>
                </span>
                <span>
                  Carbon <b>{simulation.wholeCellFlux.carbon}</b>
                </span>
                <span>
                  Redox <b>{simulation.wholeCellFlux.redox}</b>
                </span>
              </div>
              <Meter value={simulation.wholeCellFlux.index} color="#bc91ff" />
              <p>
                No species-specific pathway fixture is connected for this chassis. This generic
                display is only a responsive UI placeholder.
              </p>
            </div>
          )}
          <p className="sim-card-note">
            Demo heuristic in relative flux units, not FBA or measured biochemical flux.
          </p>
        </article>

        <article className="sim-card yield-card">
          <div className="sim-card-title">
            <Gauge size={15} />
            <h3>Yield potential</h3>
            <span>scenario fit</span>
          </div>
          <div className="yield-score">
            <strong>{yieldScore.index}</strong>
            <span>
              /100<small>demo index</small>
            </span>
            {yieldScore.index === bestMatch.index && (
              <span className="yield-leader">
                <Trophy size={11} /> BEST FIT
              </span>
            )}
          </div>
          <Meter value={yieldScore.index} color="#38d6a5" />
          <p className="yield-caption">
            Highest current demo fit: <strong>{bestMatch.label}</strong>
          </p>
          <div className="yield-compare">
            {simulation.yieldComparisons.map((item) => (
              <div
                className={`${item.chassisId === chassisId ? "selected" : ""} ${item.index === bestMatch.index ? "leader" : ""}`}
                key={item.chassisId}
              >
                <span>
                  <i style={{ background: CHASSIS[item.chassisId].color }} />
                  {item.label}
                </span>
                <strong>{item.index}</strong>
                <Meter value={item.index} color={CHASSIS[item.chassisId].color} />
              </div>
            ))}
          </div>
          <p className="sim-card-note">
            Heuristic comparison around demo reference conditions; not a strain-specific yield or
            titer prediction.
          </p>
        </article>
      </div>
      <p className="sim-disclaimer">
        <Sparkles size={12} />
        Simulated estimates for interface development. Connect a validated Chassix-AI model and
        strain-specific data before interpreting biological outcomes.
      </p>
    </section>
  );
}
