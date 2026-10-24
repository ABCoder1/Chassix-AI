import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Tag } from "@chassix/ui";
import { ProjectFlow } from "@chassix/shared";
import { STAGES } from "../stages";
import { HOST_OPTIONS, DATASET_OPTIONS } from "../modules";
import { useSelectionStore } from "../store/selectionStore";
import { Canvas } from "../components/Canvas";
import { StageList } from "../components/StageList";
import { BrandBar } from "../components/BrandBar";
import "./canvas.css";

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.4;
const ZOOM_STEP = 0.2;
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));

/**
 * Screen 2 — Canvas + linear navigation + selection state (Phase 1 exit).
 * Canvas and linear list are two renderings of the same STAGES source and the
 * same `activeStageId`. The stage overview panel reflects the selected stage and,
 * for selection stages, exposes host/dataset controls bound to the persisted
 * selection store so choices survive navigation and reload.
 */
export function CanvasPage() {
  const navigate = useNavigate();
  const [activeStageId, setActiveStageId] = useState<string>(STAGES[0]!.id);
  const [zoom, setZoom] = useState(1);

  const goalPrompt = useSelectionStore((s) => s.goalPrompt);
  const selectedHostIds = useSelectionStore((s) => s.selectedHostIds);
  const selectedDatasetIds = useSelectionStore((s) => s.selectedDatasetIds);
  const toggleHost = useSelectionStore((s) => s.toggleHost);
  const toggleDataset = useSelectionStore((s) => s.toggleDataset);

  const activeStage = STAGES.find((s) => s.id === activeStageId) ?? STAGES[0]!;

  return (
    <div className="canvaspage">
      <BrandBar />
      <main className="canvaspage__main" id="main">
        <div className="canvaspage__head">
          <div>
            <h1 className="canvaspage__title">Workflow canvas</h1>
            <p className="canvaspage__subtitle">
              {goalPrompt ? (
                <>
                  Draft goal: <q>{goalPrompt}</q>
                </>
              ) : (
                "No goal drafted yet — the canvas shows the standard Phase 1 workflow."
              )}
            </p>
          </div>
          <Tag>illustrative draft</Tag>
        </div>

        <div className="canvaspage__toolbar" role="toolbar" aria-label="Canvas controls">
          <span className="canvaspage__toolbar-label" id="zoom-label">
            Zoom
          </span>
          <div className="canvaspage__zoom" aria-labelledby="zoom-label">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-label="Zoom out"
              disabled={zoom <= ZOOM_MIN}
              onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
            >
              −
            </Button>
            <span className="canvaspage__zoom-value" aria-live="polite">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-label="Zoom in"
              disabled={zoom >= ZOOM_MAX}
              onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
            >
              +
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setZoom(1)}
              disabled={zoom === 1}
            >
              Reset
            </Button>
          </div>
        </div>

        <div className="canvaspage__layout">
          {/* Spatial canvas — hidden on narrow screens, where the list takes over. */}
          <div className="canvaspage__canvas-wrap">
            <Canvas activeStageId={activeStageId} onSelectStage={setActiveStageId} zoom={zoom} />
          </div>

          <aside className="canvaspage__side">
            {/* Linear ordered list: the accessible / narrow-screen equivalent. */}
            <StageList activeStageId={activeStageId} onSelectStage={setActiveStageId} />

            <section className="canvaspage__overview" aria-live="polite">
              <Card
                title={activeStage.title}
                subtitle={`Stage ${activeStage.order} of ${STAGES.length}`}
                actions={<Tag>illustrative</Tag>}
              >
                <p className="canvaspage__overview-summary">{activeStage.summary}</p>

                {activeStage.flow === ProjectFlow.SelectingHosts && (
                  <fieldset className="canvaspage__picker">
                    <legend>Select hosts (illustrative)</legend>
                    {HOST_OPTIONS.map((h) => (
                      <label key={h.id} className="canvaspage__check">
                        <input
                          type="checkbox"
                          className="bf-focusable"
                          checked={selectedHostIds.includes(h.id)}
                          onChange={() => toggleHost(h.id)}
                        />
                        <span>{h.name}</span>
                      </label>
                    ))}
                    <p className="canvaspage__count">{selectedHostIds.length} selected</p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate("/hosts")}
                    >
                      Open full host discovery
                    </Button>
                  </fieldset>
                )}

                {activeStage.flow === ProjectFlow.SelectingInputs && (
                  <fieldset className="canvaspage__picker">
                    <legend>Select datasets (illustrative)</legend>
                    {DATASET_OPTIONS.map((d) => (
                      <label key={d.id} className="canvaspage__check">
                        <input
                          type="checkbox"
                          className="bf-focusable"
                          checked={selectedDatasetIds.includes(d.id)}
                          onChange={() => toggleDataset(d.id)}
                        />
                        <span>
                          {d.name} <Tag>{d.modality}</Tag>
                        </span>
                      </label>
                    ))}
                    <p className="canvaspage__count">{selectedDatasetIds.length} selected</p>
                  </fieldset>
                )}
              </Card>

              <p className="canvaspage__persist-note">
                Selections ({selectedHostIds.length} hosts, {selectedDatasetIds.length} datasets)
                are saved to this browser and survive tab changes and reload.
              </p>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
