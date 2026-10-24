import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Tag } from "@chassix/ui";
import { MODULES, EXAMPLE_GOAL } from "../modules";
import { useSelectionStore } from "../store/selectionStore";
import { BrandBar } from "../components/BrandBar";
import "./welcome.css";

const PROMPT = "what do you want to build?";
const SUPPORTING_COPY =
  "Describe your end goal out of an experiment in plain language. We'll assemble the tools, parameters and workflow for you.";

/**
 * Screen 1 — Welcome + plain-language goal composer (BF-01).
 * The composer is bound to the persisted selection store so the drafted goal
 * survives navigation to the canvas and reload.
 */
export function WelcomePage() {
  const navigate = useNavigate();
  const storedGoal = useSelectionStore((s) => s.goalPrompt);
  const setGoalPrompt = useSelectionStore((s) => s.setGoalPrompt);
  const [prompt, setPrompt] = useState(storedGoal);

  const trimmed = prompt.trim();
  const canSubmit = trimmed.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    setGoalPrompt(trimmed);
    navigate("/canvas");
  };

  const chooseExample = () => setPrompt(EXAMPLE_GOAL);

  return (
    <div className="welcome">
      <BrandBar />
      <main className="welcome__main" id="main">
        <section className="welcome__hero" aria-labelledby="welcome-prompt">
          <h1 className="welcome__prompt" id="welcome-prompt">
            {PROMPT}
          </h1>
          <p className="welcome__copy">{SUPPORTING_COPY}</p>

          <form
            className="welcome__composer"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label className="welcome__label" htmlFor="goal-composer">
              Your goal
            </label>
            <textarea
              id="goal-composer"
              className="welcome__textarea bf-focusable"
              placeholder="e.g. a more thermotolerant host for an industrial enzyme…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              aria-describedby="composer-help"
            />
            <p className="welcome__hint" id="composer-help">
              Plain language is fine. You can refine the interpreted goal in the next step.
            </p>

            <div className="welcome__actions">
              <Button type="submit" variant="primary" disabled={!canSubmit}>
                Build my workflow
              </Button>
              <Button type="button" variant="ghost" onClick={chooseExample}>
                Choose an example
              </Button>
            </div>
          </form>

          <aside className="welcome__example" aria-label="Example goal">
            <span className="welcome__example-label">Example goal</span>
            <p className="welcome__example-text">
              <q>{EXAMPLE_GOAL}</q>
            </p>
            <Button type="button" variant="secondary" size="sm" onClick={chooseExample}>
              Use this example
            </Button>
          </aside>
        </section>

        <section className="welcome__section" aria-labelledby="modules-heading">
          <h2 className="welcome__section-title" id="modules-heading">
            Supported modules
          </h2>
          <ul className="welcome__modules" role="list">
            {MODULES.map((m) => (
              <li key={m.id}>
                <Card title={m.title}>
                  <p className="welcome__module-desc">{m.description}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section className="welcome__section" aria-labelledby="recent-heading">
          <h2 className="welcome__section-title" id="recent-heading">
            Recent projects
          </h2>
          <ul className="welcome__recent" role="list">
            <li>
              <button
                type="button"
                className="welcome__recent-item bf-focusable"
                onClick={() => navigate("/canvas")}
              >
                <span className="welcome__recent-name">Thermotolerant host draft</span>
                <span className="welcome__recent-meta">
                  <Tag>illustrative</Tag>
                  Draft · open workflow canvas
                </span>
              </button>
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
