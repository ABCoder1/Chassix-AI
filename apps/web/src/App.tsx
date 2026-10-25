import { useState } from "react";
import type { ReactNode } from "react";
import {
  Button,
  Card,
  StatusBadge,
  Table,
  Tabs,
  Progress,
  Tag,
  Modal,
  Drawer,
  EmptyState,
} from "@chassix/ui";
import { BranchState, CriticDisposition, ConnectivityStatus } from "@chassix/shared";

/**
 * Component gallery (Step 1.3 DoD: "a component gallery renders every state").
 * Every component is shown in every meaningful state. All data is clearly
 * labeled illustrative per the cross-cutting "no fabricated data" rule.
 */

const BRANCH_STATES: BranchState[] = [
  BranchState.NotConfigured,
  BranchState.Validating,
  BranchState.Ready,
  BranchState.Queued,
  BranchState.Running,
  BranchState.ValidatingOutputs,
  BranchState.Succeeded,
  BranchState.Failed,
  BranchState.Cancelled,
  BranchState.Skipped,
];

const CRITIC_STATES: CriticDisposition[] = [
  CriticDisposition.Ready,
  CriticDisposition.ReadyWithCaveats,
  CriticDisposition.NeedsReview,
];

const CONNECTIVITY_STATES: ConnectivityStatus[] = [
  ConnectivityStatus.Connected,
  ConnectivityStatus.ConnectionUncertain,
];

interface HostRow {
  id: string;
  name: string;
  score: string;
  evidence: string;
}

const HOST_ROWS: HostRow[] = [
  { id: "h1", name: "Host candidate A", score: "0.82", evidence: "12 sources" },
  { id: "h2", name: "Host candidate B", score: "0.74", evidence: "8 sources" },
  { id: "h3", name: "Host candidate C", score: "0.61", evidence: "3 sources" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2 className="section__title">{title}</h2>
      {children}
    </section>
  );
}

export function App() {
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <main className="gallery">
      <header className="gallery__header">
        <h1 className="gallery__title">Chassix AI — Design System</h1>
        <p className="gallery__lede">
          Token-driven, keyboard-operable components for the Chassix AI workspace. All values below
          are illustrative fixtures, not real scientific results.
        </p>
      </header>

      <Section title="Color tokens">
        <div className="swatches">
          {[
            ["Primary / mint", "var(--color-primary)"],
            ["Info / blue", "var(--color-info)"],
            ["Warning / amber", "var(--color-warning)"],
            ["Accent / violet", "var(--color-accent)"],
            ["Danger / red", "var(--color-danger)"],
            ["Surface", "var(--color-surface-2)"],
          ].map(([label, color]) => (
            <div className="swatch" key={label}>
              <div className="swatch__chip" style={{ background: color }} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <div className="row">
          <Button variant="primary">Build my workflow</Button>
          <Button variant="secondary">Review inputs</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Cancel run</Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <Button variant="secondary" size="sm">
            Small
          </Button>
        </div>
      </Section>

      <Section title="Status badges — critic disposition">
        <div className="row">
          {CRITIC_STATES.map((s) => (
            <StatusBadge key={s} kind="critic" status={s} />
          ))}
        </div>
      </Section>

      <Section title="Status badges — branch lifecycle">
        <div className="row">
          {BRANCH_STATES.map((s) => (
            <StatusBadge key={s} kind="branch" status={s} />
          ))}
        </div>
      </Section>

      <Section title="Status badges — connectivity">
        <div className="row">
          {CONNECTIVITY_STATES.map((s) => (
            <StatusBadge key={s} kind="connectivity" status={s} />
          ))}
        </div>
      </Section>

      <Section title="Tags">
        <div className="row">
          <Tag>genomics</Tag>
          <Tag>transcriptomics</Tag>
          <Tag>pathways</Tag>
          <Tag>illustrative</Tag>
        </div>
      </Section>

      <Section title="Cards">
        <div className="grid">
          <Card
            title="Host candidate A"
            subtitle="Suitability estimate (illustrative)"
            actions={<StatusBadge kind="branch" status={BranchState.Ready} />}
          >
            <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
              Evidence coverage, rationale and tradeoffs would appear here.
            </p>
          </Card>
          <Card title="Integration" subtitle="Evidence harmonization">
            <Progress value={40} label="Harmonizing identifiers" />
          </Card>
          <Card title="Critic review">
            <StatusBadge kind="critic" status={CriticDisposition.ReadyWithCaveats} />
          </Card>
        </div>
      </Section>

      <Section title="Progress">
        <div style={{ display: "grid", gap: "var(--space-4)", maxWidth: 420 }}>
          <Progress value={0} label="Queued" />
          <Progress value={65} label="Running branch" />
          <Progress value={100} label="Complete" />
          <Progress label="Working (indeterminate)" />
        </div>
      </Section>

      <Section title="Table">
        <Table
          caption="Ranked hosts (illustrative fixtures)"
          rowKey={(r) => r.id}
          columns={[
            { key: "name", header: "Host", render: (r) => r.name },
            { key: "score", header: "Suitability", numeric: true, render: (r) => r.score },
            { key: "evidence", header: "Evidence", render: (r) => r.evidence },
            {
              key: "state",
              header: "State",
              render: () => <StatusBadge kind="branch" status={BranchState.Succeeded} />,
            },
          ]}
          rows={HOST_ROWS}
        />
      </Section>

      <Section title="Tabs">
        <Tabs
          aria-label="Dataset modalities"
          items={[
            {
              id: "genomics",
              label: "Genomics",
              content: "Genomics datasets panel (illustrative).",
            },
            {
              id: "transcriptomics",
              label: "Transcriptomics",
              content: "Transcriptomics + perturbation panel (illustrative).",
            },
            { id: "pathways", label: "Pathways", content: "Pathways panel (illustrative)." },
            {
              id: "uploads",
              label: "My uploads",
              content: "Private uploads panel (illustrative).",
            },
          ]}
        />
      </Section>

      <Section title="Overlays (focus-trapped)">
        <div className="row">
          <Button onClick={() => setModalOpen(true)}>Open modal</Button>
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
            Open citation drawer
          </Button>
        </div>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Launch remote analysis?"
          footer={
            <>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setModalOpen(false)}>
                Confirm launch
              </Button>
            </>
          }
        >
          <p style={{ color: "var(--color-text-muted)" }}>
            This is a demonstration dialog. Focus is trapped inside; press Esc or Tab to verify
            keyboard behavior. No real job is launched.
          </p>
        </Modal>
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Citation">
          <p style={{ color: "var(--color-text-muted)" }}>
            Bibliographic metadata, source passage, retrieval date and claim linkage would appear
            here. Illustrative only.
          </p>
          <Button variant="secondary" onClick={() => setDrawerOpen(false)}>
            Close
          </Button>
        </Drawer>
      </Section>

      <Section title="Empty state">
        <EmptyState
          icon="∅"
          title="No datasets found"
          description="No public datasets match the current filters. Adjust filters or switch to My uploads."
          action={<Button variant="secondary">Clear filters</Button>}
        />
      </Section>
    </main>
  );
}
