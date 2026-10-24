import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { useFocusTrap } from "./useFocusTrap";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
}

/**
 * Right-side panel (e.g. the citation drawer). Same keyboard contract as Modal:
 * focus trapped, Escape / backdrop dismiss, focus restored on close.
 */
export function Drawer({ open, onClose, title, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(panelRef, open, onClose);

  if (!open) return null;

  return createPortal(
    <div
      className="bf-overlay"
      data-align="right"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bf-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
        tabIndex={-1}
      >
        <div className="bf-drawer__head">
          <h2 className="bf-drawer__title" id={titleId}>
            {title}
          </h2>
          <button
            type="button"
            className="bf-iconbtn bf-focusable"
            aria-label="Close panel"
            onClick={onClose}
          >
            {"×"}
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
