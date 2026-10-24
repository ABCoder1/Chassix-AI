import { STAGES, STAGE_EDGES, type Stage } from "../stages";

const NODE_W = 184;
const NODE_H = 104;
const COL_GAP = 76;
const PAD = 28;
const ROW_OFFSET = 60;
const STEP = NODE_W + COL_GAP;

const xOf = (order: number) => PAD + (order - 1) * STEP;
const yOf = (order: number) => PAD + (order % 2 === 0 ? ROW_OFFSET : 0);

const CONTENT_W = PAD * 2 + STAGES.length * NODE_W + (STAGES.length - 1) * COL_GAP;
const CONTENT_H = PAD * 2 + NODE_H + ROW_OFFSET;

const stageByOrder = new Map(STAGES.map((s) => [s.id, s.order]));

interface CanvasProps {
  activeStageId: string;
  onSelectStage: (id: string) => void;
  zoom: number;
}

/**
 * Navy dotted-whiteboard canvas (Screen 2). Renders the left-to-right dependency
 * graph defined by STAGES/STAGE_EDGES: node cards plus curved SVG edges. Zoom is
 * applied as a transform on the content layer. Every node is a native button, so
 * the whole graph is keyboard-operable; motion is suppressed under
 * prefers-reduced-motion (see canvas.css).
 */
export function Canvas({ activeStageId, onSelectStage, zoom }: CanvasProps) {
  return (
    <div className="canvas" aria-label="Workflow canvas" role="group">
      <div
        className="canvas__scaled"
        style={{
          width: CONTENT_W,
          height: CONTENT_H,
          transform: `scale(${zoom})`,
          transformOrigin: "top left",
        }}
      >
        <svg
          className="canvas__edges"
          width={CONTENT_W}
          height={CONTENT_H}
          viewBox={`0 0 ${CONTENT_W} ${CONTENT_H}`}
          aria-hidden="true"
          focusable="false"
        >
          {STAGE_EDGES.map(({ from, to }) => {
            const fo = stageByOrder.get(from)!;
            const toOrder = stageByOrder.get(to)!;
            const x1 = xOf(fo) + NODE_W;
            const y1 = yOf(fo) + NODE_H / 2;
            const x2 = xOf(toOrder);
            const y2 = yOf(toOrder) + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
            return <path key={`${from}-${to}`} className="canvas__edge" d={d} />;
          })}
        </svg>

        {STAGES.map((stage: Stage) => {
          const active = stage.id === activeStageId;
          return (
            <button
              key={stage.id}
              type="button"
              className="canvas__node bf-focusable"
              data-active={active || undefined}
              data-kind={stage.kind}
              aria-pressed={active}
              style={{
                left: xOf(stage.order),
                top: yOf(stage.order),
                width: NODE_W,
                height: NODE_H,
              }}
              onClick={() => onSelectStage(stage.id)}
            >
              <span className="canvas__node-order">Stage {stage.order}</span>
              <span className="canvas__node-title">{stage.title}</span>
              <span className="canvas__node-flow">{stage.flow.replace(/_/g, " ")}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
