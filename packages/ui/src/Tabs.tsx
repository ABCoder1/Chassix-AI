import { useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

export interface TabsProps {
  items: ReadonlyArray<TabItem>;
  defaultTabId?: string;
  "aria-label": string;
  className?: string;
}

/**
 * ARIA tabs with full keyboard support: Left/Right move between tabs (roving
 * tabindex), Home/End jump to first/last, and the selected tab's panel shows.
 */
export function Tabs({ items, defaultTabId, className, ...rest }: TabsProps) {
  const first = items[0];
  const [active, setActive] = useState<string>(defaultTabId ?? first?.id ?? "");
  const baseId = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  if (items.length === 0) return null;

  const focusTab = (id: string) => {
    setActive(id);
    refs.current[id]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const idx = items.findIndex((t) => t.id === active);
    if (idx < 0) return;
    let next = idx;
    switch (e.key) {
      case "ArrowRight":
        next = (idx + 1) % items.length;
        break;
      case "ArrowLeft":
        next = (idx - 1 + items.length) % items.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = items.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    const target = items[next];
    if (target) focusTab(target.id);
  };

  const activeItem = items.find((t) => t.id === active) ?? first;

  return (
    <div className={className} {...rest}>
      <div className="bf-tabs__list" role="tablist" aria-label={rest["aria-label"]}>
        {items.map((t) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              id={`${baseId}-tab-${t.id}`}
              className="bf-tab bf-focusable"
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(t.id)}
              onKeyDown={onKeyDown}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {activeItem && (
        <div
          className="bf-tabs__panel"
          id={`${baseId}-panel-${activeItem.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${activeItem.id}`}
          tabIndex={0}
        >
          {activeItem.content}
        </div>
      )}
    </div>
  );
}
