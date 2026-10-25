import { STAGES, type Stage } from "../stages";

interface StageListProps {
  activeStageId: string;
  onSelectStage: (id: string) => void;
}

/**
 * Linear, ordered stage list — the accessible / narrow-screen equivalent of the
 * spatial canvas. It renders from the SAME STAGES source, so canvas and list can
 * never show different state. Always present in the DOM (a numbered <ol>) so
 * keyboard and assistive-technology users get a non-spatial path through the
 * workflow (Step 1.7 DoD).
 */
export function StageList({ activeStageId, onSelectStage }: StageListProps) {
  return (
    <nav className="stagelist" aria-label="Workflow stages (linear)">
      <ol className="stagelist__ol">
        {STAGES.map((stage: Stage) => {
          const active = stage.id === activeStageId;
          return (
            <li key={stage.id} className="stagelist__item">
              <button
                type="button"
                className="stagelist__button bf-focusable"
                data-active={active || undefined}
                aria-current={active ? "step" : undefined}
                onClick={() => onSelectStage(stage.id)}
              >
                <span className="stagelist__num" aria-hidden="true">
                  {stage.order}
                </span>
                <span className="stagelist__body">
                  <span className="stagelist__title">{stage.title}</span>
                  <span className="stagelist__summary">{stage.summary}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
