import { MAX_OUTER_HTML_BYTES, type PickedElement, truncateToBytes } from "@claymod/core/snapshot";
import { CLAYMOD_ATTR } from "./messages";
import { uniqueSelector } from "./selector";

const ACCENT = "#7c5cff";

function createOverlay(): { box: HTMLDivElement; label: HTMLDivElement } {
  const box = document.createElement("div");
  box.setAttribute(CLAYMOD_ATTR, "highlight");
  Object.assign(box.style, {
    position: "fixed",
    zIndex: "2147483647",
    pointerEvents: "none",
    boxSizing: "border-box",
    border: `2px solid ${ACCENT}`,
    background: "rgba(124, 92, 255, 0.12)",
    borderRadius: "3px",
    transition: "all 60ms ease-out",
    display: "none",
  });
  const label = document.createElement("div");
  label.setAttribute(CLAYMOD_ATTR, "label");
  Object.assign(label.style, {
    position: "fixed",
    zIndex: "2147483647",
    pointerEvents: "none",
    background: ACCENT,
    color: "#fff",
    font: "12px/1.4 system-ui, sans-serif",
    padding: "2px 6px",
    borderRadius: "3px",
    maxWidth: "60vw",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    display: "none",
  });
  document.documentElement.append(box, label);
  return { box, label };
}

/**
 * Hover to highlight, click to pick, Esc to cancel. Page clicks are swallowed while picking
 * so links and buttons don't fire.
 */
export function pickElement(): { result: Promise<PickedElement | null>; cancel: () => void } {
  const { box, label } = createOverlay();
  let current: Element | null = null;
  let finish: (value: PickedElement | null) => void = () => {};
  const result = new Promise<PickedElement | null>((resolve) => {
    finish = resolve;
  });

  const onMove = (event: MouseEvent) => {
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!target || target.hasAttribute(CLAYMOD_ATTR) || target === current) return;
    current = target;
    const rect = target.getBoundingClientRect();
    Object.assign(box.style, {
      display: "block",
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    label.textContent = uniqueSelector(target);
    Object.assign(label.style, {
      display: "block",
      top: `${Math.max(0, rect.top - 22)}px`,
      left: `${rect.left}px`,
    });
  };
  const swallow = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  const onClick = (event: MouseEvent) => {
    swallow(event);
    const target = document.elementFromPoint(event.clientX, event.clientY) ?? current;
    if (!target) return;
    stop({
      selector: uniqueSelector(target),
      outerHTML: truncateToBytes(target.outerHTML, MAX_OUTER_HTML_BYTES),
    });
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    swallow(event);
    stop(null);
  };

  const listeners: Array<[string, EventListener]> = [
    ["mousemove", onMove as EventListener],
    ["click", onClick as EventListener],
    ["mousedown", swallow],
    ["mouseup", swallow],
    ["pointerdown", swallow],
    ["pointerup", swallow],
    ["keydown", onKey as EventListener],
  ];
  for (const [type, listener] of listeners) window.addEventListener(type, listener, true);
  const previousCursor = document.documentElement.style.cursor;
  document.documentElement.style.cursor = "crosshair";

  function stop(value: PickedElement | null) {
    for (const [type, listener] of listeners) window.removeEventListener(type, listener, true);
    document.documentElement.style.cursor = previousCursor;
    box.remove();
    label.remove();
    finish(value);
  }

  return { result, cancel: () => stop(null) };
}
