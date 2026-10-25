import { useEffect, useState } from "react";
import "./loading-overlay.css";

/**
 * Hold a loading state for at least `ms` after mount. Used to make a step feel
 * like real remote work is happening (literature survey, planning, etc.) before
 * the page settles. Returns true while loading.
 */
// Skip the artificial delay under tests (vitest sets MODE="test") so the suite
// isn't slowed and pages render their content synchronously.
const IS_TEST = import.meta.env?.MODE === "test";

export function useTimedLoading(ms: number): boolean {
  const [loading, setLoading] = useState(!IS_TEST);
  useEffect(() => {
    if (IS_TEST) return;
    const id = setTimeout(() => setLoading(false), ms);
    return () => clearTimeout(id);
  }, [ms]);
  return loading;
}

/** Full-panel loading overlay with a spinner and a status label. */
export function LoadingOverlay({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <div className="loading-overlay__spinner" aria-hidden="true" />
      <p className="loading-overlay__label">{label}</p>
      {sub ? <p className="loading-overlay__sub">{sub}</p> : null}
    </div>
  );
}
