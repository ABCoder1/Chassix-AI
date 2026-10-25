import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Explicit empty/no-results state (never silently blank). */
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={["bf-empty", className].filter(Boolean).join(" ")}>
      {icon && (
        <div className="bf-empty__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="bf-empty__title">{title}</p>
      {description && <p className="bf-empty__desc">{description}</p>}
      {action}
    </div>
  );
}
