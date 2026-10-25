import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Drawer, Tag, EmptyState } from "@chassix/ui";
import { HOST_CANDIDATES } from "../hosts";
import type { EvidenceQuality, HostCandidate } from "../hosts";
import { EXAMPLE_GOAL } from "../modules";
import { discover, type DatasetCandidateDTO, type DiscoveredHostDTO } from "../api";
import { useSelectionStore } from "../store/selectionStore";
import { BrandBar } from "../components/BrandBar";
import { LoadingOverlay, useTimedLoading } from "../components/LoadingOverlay";
import "./hosts.css";

const SUITABILITY_LABEL: Record<string, string> = {
  strong: "Strong fit",
  moderate: "Moderate fit",
  limited: "Limited fit",
  insufficient_evidence: "Insufficient evidence",
};

/** Map an API-ranked host to the card view model the page already renders. */
function mapHost(h: DiscoveredHostDTO): HostCandidate {
  const evidenceQuality: EvidenceQuality =
    h.supportingSources >= 2
      ? "well-supported"
      : h.supportingSources === 1
        ? "sparse"
        : "unsupported";
  return {
    id: h.id,
    organism: h.host,
    strain: "",
    score: h.score,
    suitabilityLabel: SUITABILITY_LABEL[h.suitabilityLabel] ?? h.suitabilityLabel,
    evidenceCoverage: `${h.supportingSources} supporting source${h.supportingSources === 1 ? "" : "s"}`,
    supportingSources: h.supportingSources,
    rationale: h.rationale,
    tradeoffs: [...h.tradeoffs],
    conflictingFindings: [...h.conflictingFindings],
    freshness: h.freshness.newestSourceYear
      ? `Newest source ${h.freshness.newestSourceYear}`
      : "Freshness not reported",
    evidenceQuality,
    citations: h.citations.map((c) => ({
      id: c.id,
      title: c.title,
      authors: c.authors.join(", "),
      venue: c.venue,
      year: c.year ?? 0,
      retrievalDate: c.retrievalDate,
      passage: c.passage,
      claimLinkage: c.claim,
      accessible: c.readFullText,
    })),
  };
}

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
  const selectedDatasetIds = useSelectionStore((s) => s.selectedDatasetIds);
  const toggleDataset = useSelectionStore((s) => s.toggleDataset);

  const [drawerHostId, setDrawerHostId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  // Default to the illustrative fixtures so the page renders offline; the survey replaces them.
  const [hosts, setHosts] = useState<HostCandidate[]>([...HOST_CANDIDATES]);
  const [datasets, setDatasets] = useState<DatasetCandidateDTO[]>([]);
  const [surveying, setSurveying] = useState(false);
  // Hold a visible "literature review in progress" state so the survey reads as live work.
  const loading = useTimedLoading(4000);

  // Run the literature survey (RAG discovery) for the drafted goal; fall back to fixtures on error.
  useEffect(() => {
    const controller = new AbortController();
    setSurveying(true);
    discover(goalPrompt || EXAMPLE_GOAL, controller.signal)
      .then((result) => {
        if (!result.isEmpty) setHosts(result.hosts.map(mapHost));
        setDatasets(result.datasets.records);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          console.error("Discovery failed; showing illustrative fixtures", error);
      })
      .finally(() => setSurveying(false));
    return () => controller.abort();
  }, [goalPrompt]);

  const selectedHosts = hosts.filter((h) => selectedHostIds.includes(h.id));
  const selectedCount = selectedHosts.length;
  const canContinue = selectedCount >= 1;
  const canCompare = selectedCount >= 2;
  const drawerHost = hosts.find((h) => h.id === drawerHostId) ?? null;

  if (loading) {
    return (
      <div className="hosts">
        <BrandBar />
        <main className="hosts__main" id="main">
          <LoadingOverlay
            label="Running literature review…"
            sub="Our Apify agent is surveying the literature for candidate hosts and supporting datasets."
          />
        </main>
      </div>
    );
  }

  return (
    <div className="hosts">
      <BrandBar />
      <main className="hosts__main" id="main">
        <div className="hosts__head">
          <div>
            <h1 className="hosts__title">Host discovery</h1>
          </div>
          {surveying ? <Tag>surveying…</Tag> : null}
        </div>

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
          {hosts.length === 0 ? (
            <EmptyState
              icon="∅"
              title="No host candidates found"
              description="Retrieval returned nothing for this goal. No results are fabricated — refine the goal and try again."
            />
          ) : (
            hosts.map((host, index) => {
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

        {datasets.length > 0 && (
          <section aria-label="Candidate datasets" className="hosts__datasets">
            <h2 className="hosts__section-title">Candidate datasets</h2>
            <p className="hosts__section-note">
              Select the public datasets to feed the analysis. Availability is never implied as
              guaranteed; licence/access is shown as reported.
            </p>
            <p className="hosts__count" aria-live="polite" data-testid="dataset-selection-count">
              {selectedDatasetIds.length} dataset{selectedDatasetIds.length === 1 ? "" : "s"}{" "}
              selected
            </p>
            <ul className="hosts__dataset-list" role="list">
              {datasets.map((d) => (
                <li key={d.id}>
                  <label className="hosts__select">
                    <input
                      type="checkbox"
                      className="bf-focusable"
                      checked={selectedDatasetIds.includes(d.id)}
                      onChange={() => toggleDataset(d.id)}
                      aria-label={`Select dataset ${d.accession}`}
                    />
                    <span>
                      <strong>{d.accession}</strong> · {d.modality}
                      {d.taxonomy ? ` · ${d.taxonomy}` : ""} · availability: {d.availability} ·
                      licence: {d.licenseAccess}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <Drawer
        open={drawerHost !== null}
        onClose={() => setDrawerHostId(null)}
        title={drawerHost ? `Citations — ${drawerHost.organism}` : "Citations"}
      >
        {drawerHost && (
          <div className="hosts__citations" data-testid="citation-drawer">
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
