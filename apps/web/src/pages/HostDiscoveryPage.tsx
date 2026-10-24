import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Drawer, Tag, EmptyState } from "@chassix/ui";
import { HOST_CANDIDATES, ILLUSTRATIVE_HOSTS_LABEL } from "../hosts";
import type { HostCandidate } from "../hosts";
import { useSelectionStore } from "../store/selectionStore";
import { BrandBar } from "../components/BrandBar";
import "./hosts.css";

/**
 * Step 2.3 — Host discovery screen (Screen 2, BF-02, PRD §B).
 *
 * Ranked, advisory host cards with evidence coverage, rationale, tradeoffs,
 * explicit conflicting-findings and sparse/unsupported-evidence markers; an
 * expandable citation drawer; selection checkboxes with a visible count; a
 * compare view (≥2 hosts side by side); and a continue action gated on ≥1
 * selected host. Ranking is advisory — nothing is silently selected. Selections
 * persist via the shared selection store. All data is illustrative and labeled.
 */

const EVIDENCE_MARKER: Record<HostCandidate["evidenceQuality"], string | null> = {
  "well-supported": null,
  sparse: "Sparse evidence",
  unsupported: "Unsupported",
};

function scorePercent(score: number) {
  return `${Math.round(score * 100)}`;
}

export function HostDiscoveryPage() {
  const navigate = useNavigate();
  const goalPrompt = useSelectionStore((s) => s.goalPrompt);
  const selectedHostIds = useSelectionStore((s) => s.selectedHostIds);
  const toggleHost = useSelectionStore((s) => s.toggleHost);

  const [drawerHostId, setDrawerHostId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);

  const selectedHosts = HOST_CANDIDATES.filter((h) => selectedHostIds.includes(h.id));
  const selectedCount = selectedHosts.length;
  const canContinue = selectedCount >= 1;
  const canCompare = selectedCount >= 2;
  const drawerHost = HOST_CANDIDATES.find((h) => h.id === drawerHostId) ?? null;

  return (
    <div className="hosts">
      <BrandBar />
      <main className="hosts__main" id="main">
        <div className="hosts__head">
          <div>
            <h1 className="hosts__title">Host discovery</h1>
            <p className="hosts__subtitle">
              {goalPrompt ? (
                <>
                  Ranked for your goal: <q>{goalPrompt}</q>
                </>
              ) : (
                "Ranked host candidates for your drafted goal."
              )}
            </p>
          </div>
          <Tag>illustrative</Tag>
        </div>

        <p className="hosts__illustrative" role="note">
          {ILLUSTRATIVE_HOSTS_LABEL} The suitability estimate is advisory and is not a probability
          of experimental success; no host is selected for you.
        </p>

        <div className="hosts__toolbar" role="toolbar" aria-label="Host selection controls">
          <p className="hosts__count" aria-live="polite" data-testid="selection-count">
            {selectedCount} host{selectedCount === 1 ? "" : "s"} selected
          </p>
          <div className="hosts__toolbar-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setComparing((c) => !c)}
              disabled={!canCompare}
              aria-pressed={comparing}
            >
              {comparing ? "Hide compare" : "Compare selected"}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => navigate("/canvas")}
              disabled={!canContinue}
            >
              Continue with selected hosts
            </Button>
          </div>
        </div>
        {!canContinue && <p className="hosts__gate-note">Select at least one host to continue.</p>}

        {comparing && canCompare && (
          <section
            className="hosts__compare"
            aria-label="Compare selected hosts"
            data-testid="compare-view"
          >
            <h2 className="hosts__section-title">Compare selected hosts</h2>
            <div className="hosts__compare-grid" role="table" aria-label="Host comparison">
              <div className="hosts__compare-row hosts__compare-row--head" role="row">
                <span className="hosts__compare-cell" role="columnheader">
                  Attribute
                </span>
                {selectedHosts.map((h) => (
                  <span key={h.id} className="hosts__compare-cell" role="columnheader">
                    {h.organism}
                  </span>
                ))}
              </div>
              {(
                [
                  [
                    "Suitability",
                    (h: HostCandidate) => `${scorePercent(h.score)}/100 · ${h.suitabilityLabel}`,
                  ],
                  ["Evidence coverage", (h: HostCandidate) => h.evidenceCoverage],
                  ["Supporting sources", (h: HostCandidate) => String(h.supportingSources)],
                  ["Freshness", (h: HostCandidate) => h.freshness],
                  [
                    "Conflicting findings",
                    (h: HostCandidate) =>
                      h.conflictingFindings.length
                        ? `${h.conflictingFindings.length} noted`
                        : "None noted",
                  ],
                ] as const
              ).map(([label, get]) => (
                <div key={label} className="hosts__compare-row" role="row">
                  <span className="hosts__compare-cell hosts__compare-cell--label" role="rowheader">
                    {label}
                  </span>
                  {selectedHosts.map((h) => (
                    <span key={h.id} className="hosts__compare-cell" role="cell">
                      {get(h)}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        <section aria-label="Ranked host candidates" className="hosts__list">
          {HOST_CANDIDATES.length === 0 ? (
            <EmptyState
              icon="∅"
              title="No host candidates found"
              description="Retrieval returned nothing for this goal. No results are fabricated — refine the goal and try again."
            />
          ) : (
            HOST_CANDIDATES.map((host, index) => {
              const checked = selectedHostIds.includes(host.id);
              const marker = EVIDENCE_MARKER[host.evidenceQuality];
              return (
                <Card
                  key={host.id}
                  className="hosts__card"
                  actions={
                    <span className="hosts__rank" aria-label={`Rank ${index + 1}`}>
                      #{index + 1}
                    </span>
                  }
                  title={
                    <label className="hosts__select">
                      <input
                        type="checkbox"
                        className="bf-focusable"
                        checked={checked}
                        onChange={() => toggleHost(host.id)}
                        aria-label={`Select ${host.organism}`}
                      />
                      <span className="hosts__organism">
                        {host.organism} <span className="hosts__strain">{host.strain}</span>
                      </span>
                    </label>
                  }
                >
                  <div className="hosts__score" data-testid={`score-${host.id}`}>
                    <span className="hosts__score-num">{scorePercent(host.score)}</span>
                    <span className="hosts__score-outof">/100</span>
                    <span className="hosts__score-label">{host.suitabilityLabel}</span>
                    <span className="hosts__score-caption">suitability estimate (advisory)</span>
                  </div>

                  <dl className="hosts__meta">
                    <div>
                      <dt>Evidence coverage</dt>
                      <dd>{host.evidenceCoverage}</dd>
                    </div>
                    <div>
                      <dt>Freshness</dt>
                      <dd>{host.freshness}</dd>
                    </div>
                  </dl>

                  <p className="hosts__rationale">{host.rationale}</p>

                  <div className="hosts__sub">
                    <h3 className="hosts__subhead">Tradeoffs</h3>
                    <ul className="hosts__bullets">
                      {host.tradeoffs.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </div>

                  {host.conflictingFindings.length > 0 && (
                    <div className="hosts__conflict" data-testid={`conflict-${host.id}`}>
                      <span className="hosts__conflict-tag">Conflicting findings</span>
                      <ul className="hosts__bullets">
                        {host.conflictingFindings.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="hosts__card-foot">
                    {marker && (
                      <span
                        className="hosts__evidence-marker"
                        data-quality={host.evidenceQuality}
                        data-testid={`evidence-marker-${host.id}`}
                      >
                        {marker}
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setDrawerHostId(host.id)}
                    >
                      View citations ({host.citations.length})
                    </Button>
                  </div>
                </Card>
              );
            })
          )}
        </section>
      </main>

      <Drawer
        open={drawerHost !== null}
        onClose={() => setDrawerHostId(null)}
        title={drawerHost ? `Citations — ${drawerHost.organism}` : "Citations"}
      >
        {drawerHost && (
          <div className="hosts__citations" data-testid="citation-drawer">
            <p className="hosts__illustrative" role="note">
              Illustrative citations. Inaccessible sources are not shown as full-text reads.
            </p>
            {drawerHost.citations.map((c) => (
              <article key={c.id} className="hosts__citation">
                <h3 className="hosts__citation-title">{c.title}</h3>
                <p className="hosts__citation-biblio">
                  {c.authors} · {c.venue} · {c.year}
                </p>
                <p className="hosts__citation-retrieval">
                  <strong>Retrieved:</strong> {c.retrievalDate}
                  {!c.accessible && (
                    <span className="hosts__evidence-marker" data-quality="unsupported">
                      Full text not accessible
                    </span>
                  )}
                </p>
                <blockquote className="hosts__citation-passage">
                  <span className="hosts__citation-passage-label">Source passage</span>
                  {c.passage}
                </blockquote>
                <p className="hosts__citation-link">{c.claimLinkage}</p>
              </article>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}
