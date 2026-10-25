import type { HTMLAttributes, ReactNode } from "react";

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
}

/** Small neutral label chip (filters, modality markers, etc.). */
export function Tag({ className, children, ...rest }: TagProps) {
  return (
    <span className={["bf-tag", className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </span>
  );
}
