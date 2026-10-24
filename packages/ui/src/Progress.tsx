export interface ProgressProps {
  /** 0–100. Omit for an indeterminate bar. */
  value?: number;
  label?: string;
  className?: string;
}

/**
 * Progress bar with correct ARIA. Determinate bars expose aria-valuenow and a
 * visible numeric readout; indeterminate bars omit the value per ARIA spec.
 */
export function Progress({ value, label, className }: ProgressProps) {
  const indeterminate = value === undefined;
  const clamped = indeterminate ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div
      className={["bf-progress", className].filter(Boolean).join(" ")}
      data-indeterminate={indeterminate}
    >
      {(label || !indeterminate) && (
        <div className="bf-progress__head">
          <span>{label}</span>
          {!indeterminate && <span className="bf-progress__value">{Math.round(clamped)}%</span>}
        </div>
      )}
      <div
        className="bf-progress__track"
        role="progressbar"
        aria-label={label ?? "Progress"}
        aria-valuemin={indeterminate ? undefined : 0}
        aria-valuemax={indeterminate ? undefined : 100}
        aria-valuenow={indeterminate ? undefined : Math.round(clamped)}
      >
        <div
          className="bf-progress__bar"
          style={indeterminate ? undefined : { width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
