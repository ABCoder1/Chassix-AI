import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Tag } from "@chassix/ui";
import { FieldStatus } from "@chassix/shared";
import type { ExtractedField, GoalVersionDraft } from "@chassix/shared";
import { ILLUSTRATIVE_GOAL_DRAFT, ILLUSTRATIVE_GOAL_PROMPT } from "../goalDraft";
import { useSelectionStore } from "../store/selectionStore";
import { BrandBar } from "../components/BrandBar";
import "./goal.css";

/**
 * Step 1.6 — Goal interpretation review (BF-01, PRD §A).
 *
 * Renders an EDITABLE goal summary from an illustrative GoalVersionDraft. The UI
 * is built around the cross-cutting honesty rules:
 *   - every extracted field shows its status (extracted / assumed / unknown) and
 *     is editable before any processing;
 *   - proposed assumptions are shown AND editable, and are never presented as
 *     confirmed facts;
 *   - missing critical details appear as targeted clarifying questions;
 *   - unknowns are marked explicitly and never fabricated.
 * The draft here is a labeled fixture; wiring to the live planner is out of scope.
 */

const FIELD_LABELS: Record<
  keyof Pick<GoalVersionDraft, "organismConstraints" | "desiredPhenotype" | "productContext">,
  string
> = {
  organismConstraints: "Organism constraints",
  desiredPhenotype: "Desired phenotype",
  productContext: "Product context",
};

const STATUS_COPY: Record<FieldStatus, { label: string; hint: string; tone: string }> = {
  [FieldStatus.Extracted]: {
    label: "Extracted",
    hint: "Stated in or directly entailed by your prompt.",
    tone: "extracted",
  },
  [FieldStatus.Assumed]: {
    label: "Assumed",
    hint: "A reasonable assumption — editable, not a fact.",
    tone: "assumed",
  },
  [FieldStatus.Unknown]: {
    label: "Unknown",
    hint: "Not determinable from your prompt — never fabricated.",
    tone: "unknown",
  },
};

const FIELD_KEYS = ["organismConstraints", "desiredPhenotype", "productContext"] as const;

export function GoalReviewPage() {
  const navigate = useNavigate();
  const storedGoal = useSelectionStore((s) => s.goalPrompt);
  const interpretation = useSelectionStore((s) => s.goalInterpretation);

  // Seed from the planner's interpretation (set on the welcome screen); fall back to the labeled
  // illustrative draft when there is none (e.g. API was unreachable, or the page was opened directly).
  const illustrative = interpretation ? interpretation.illustrative : true;
  const originalPrompt = interpretation?.originalPrompt || storedGoal || ILLUSTRATIVE_GOAL_PROMPT;
  const [draft, setDraft] = useState<GoalVersionDraft>(
    interpretation?.draft ?? ILLUSTRATIVE_GOAL_DRAFT,
  );

  const setField = (key: (typeof FIELD_KEYS)[number], patch: Partial<ExtractedField>) =>
    setDraft((d) => ({ ...d, [key]: { ...d[key], ...patch } }));

  const setAssumption = (index: number, text: string) =>
    setDraft((d) => ({
      ...d,
      assumptions: d.assumptions.map((a, i) => (i === index ? { ...a, text } : a)),
    }));

  const removeAssumption = (index: number) =>
    setDraft((d) => ({ ...d, assumptions: d.assumptions.filter((_, i) => i !== index) }));

  return (
    <div className="goal">
      <BrandBar />
      <main className="goal__main" id="main">
        <div className="goal__head">
          <div>
            <h1 className="goal__title">Review interpreted goal</h1>
            <p className="goal__subtitle">
              Check and edit how we understood your goal before any data processing. Nothing here is
              fixed — assumptions and unknowns are yours to correct.
            </p>
          </div>
          <Tag>{illustrative ? "illustrative draft" : "live interpretation"}</Tag>
        </div>

        {illustrative ? (
          <p className="goal__illustrative" role="note">
            Illustrative interpretation — this draft is a labeled fixture (the live planner was not
            used). No value below is a confirmed scientific fact.
          </p>
        ) : (
          <p className="goal__illustrative" role="note">
            Interpreted by the planner from your prompt. Every field is editable — nothing here is a
            confirmed scientific fact, and unknowns were not fabricated.
          </p>
        )}

        <section className="goal__section" aria-labelledby="goal-prompt-h">
          <h2 className="goal__section-title" id="goal-prompt-h">
            Your original prompt
          </h2>
          <Card>
            <p className="goal__prompt">
              <q>{originalPrompt}</q>
            </p>
          </Card>
        </section>

        <section className="goal__section" aria-labelledby="goal-fields-h">
          <h2 className="goal__section-title" id="goal-fields-h">
            Extracted fields
          </h2>
          <div className="goal__fields">
            {FIELD_KEYS.map((key) => {
              const field = draft[key];
              const status = STATUS_COPY[field.status];
              return (
                <Card key={key} title={FIELD_LABELS[key]}>
                  <div className="goal__field" data-status={field.status}>
                    <div className="goal__field-status">
                      <span
                        className="goal__status-badge"
                        data-tone={status.tone}
                        aria-label={`Status: ${status.label}`}
                      >
                        {status.label}
                      </span>
                      <label className="goal__status-select-label">
                        <span className="goal__visually-hidden">
                          Status for {FIELD_LABELS[key]}
                        </span>
                        <select
                          className="goal__status-select bf-focusable"
                          value={field.status}
                          onChange={(e) => setField(key, { status: e.target.value as FieldStatus })}
                          aria-label={`Change status for ${FIELD_LABELS[key]}`}
                        >
                          <option value={FieldStatus.Extracted}>Extracted</option>
                          <option value={FieldStatus.Assumed}>Assumed</option>
                          <option value={FieldStatus.Unknown}>Unknown</option>
                        </select>
                      </label>
                    </div>
                    <p className="goal__status-hint">{status.hint}</p>

                    {field.status === FieldStatus.Unknown ? (
                      <p className="goal__unknown-marker" data-testid={`unknown-${key}`}>
                        Unknown — not determinable from your prompt. We will not fill this in for
                        you.
                      </p>
                    ) : (
                      <label className="goal__field-value-label">
                        <span className="goal__visually-hidden">Value for {FIELD_LABELS[key]}</span>
                        <textarea
                          className="goal__textarea bf-focusable"
                          aria-label={`Edit ${FIELD_LABELS[key]}`}
                          value={field.value ?? ""}
                          rows={2}
                          onChange={(e) => setField(key, { value: e.target.value })}
                        />
                      </label>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="goal__section" aria-labelledby="goal-objectives-h">
          <h2 className="goal__section-title" id="goal-objectives-h">
            Analysis objectives &amp; success measures
          </h2>
          <Card>
            <h3 className="goal__minihead">Objectives</h3>
            <ul className="goal__list">
              {draft.analysisObjectives.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
            <h3 className="goal__minihead">Success measures</h3>
            <ul className="goal__list">
              {draft.successMeasures.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </Card>
        </section>

        <section className="goal__section" aria-labelledby="goal-assumptions-h">
          <h2 className="goal__section-title" id="goal-assumptions-h">
            Proposed assumptions
          </h2>
          <p className="goal__section-note">
            These are assumptions, not facts. Edit or remove any that are wrong before continuing.
          </p>
          <ul className="goal__assumptions" role="list">
            {draft.assumptions.map((a, i) => (
              <li key={i} className="goal__assumption">
                <span className="goal__assumption-tag" aria-hidden="true">
                  Assumption
                </span>
                <label className="goal__assumption-edit">
                  <span className="goal__visually-hidden">Edit assumption {i + 1}</span>
                  <input
                    type="text"
                    className="goal__input bf-focusable"
                    aria-label={`Edit assumption ${i + 1}`}
                    value={a.text}
                    onChange={(e) => setAssumption(i, e.target.value)}
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove assumption ${i + 1}`}
                  onClick={() => removeAssumption(i)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </section>

        <section className="goal__section" aria-labelledby="goal-questions-h">
          <h2 className="goal__section-title" id="goal-questions-h">
            Clarifying questions
          </h2>
          <p className="goal__section-note">
            We need these critical details. We are asking rather than guessing.
          </p>
          <ul className="goal__questions" role="list">
            {draft.clarifyingQuestions.map((q, i) => (
              <li key={i} className="goal__question">
                {q}
              </li>
            ))}
          </ul>
        </section>

        <section className="goal__section" aria-labelledby="goal-unknowns-h">
          <h2 className="goal__section-title" id="goal-unknowns-h">
            Marked unknown
          </h2>
          <p className="goal__section-note">
            These were not stated and have not been filled in. They stay unknown until you provide
            them.
          </p>
          <ul className="goal__unknowns" role="list">
            {draft.unknowns.map((u, i) => (
              <li key={i} className="goal__unknown-item">
                <span className="goal__status-badge" data-tone="unknown">
                  Unknown
                </span>
                <span>{u}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="goal__actions">
          <Button type="button" variant="secondary" onClick={() => navigate("/")}>
            Back to goal
          </Button>
          <Button type="button" variant="primary" onClick={() => navigate("/hosts")}>
            Continue to host discovery
          </Button>
        </div>
      </main>
    </div>
  );
}
