import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { useFocusTrap } from "./useFocusTrap";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}

/**
 * Accessible dialog: role="dialog" aria-modal, focus trapped inside, Escape and
 * backdrop-click dismiss, focus restored to the trigger on close.
 */
export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(dialogRef, open, onClose);

  if (!open) return null;

  return createPortal(
    <div
      className="bf-overlay"
      data-align="center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bf-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="bf-modal__head">
          <h2 className="bf-modal__title" id={titleId}>
            {title}
          </h2>
          <button
            type="button"
            className="bf-iconbtn bf-focusable"
            aria-label="Close dialog"
            onClick={onClose}
          >
            {"×"}
          </button>
        </div>
        <div>{children}</div>
        {footer && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "var(--space-2)",
              marginTop: "var(--space-5)",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
