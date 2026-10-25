import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

/** Rounded navy panel. Title/subtitle optional; body is children. */
export function Card({ title, subtitle, actions, className, children, ...rest }: CardProps) {
  return (
    <div className={["bf-card", className].filter(Boolean).join(" ")} {...rest}>
      {(title || actions) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "var(--space-4)",
          }}
        >
          {title && <h3 className="bf-card__title">{title}</h3>}
          {actions}
        </div>
      )}
      {subtitle && <p className="bf-card__subtitle">{subtitle}</p>}
      {children}
    </div>
  );
}
