type Child = Node | string | false | null | undefined;
type Props = Record<string, string | boolean | EventListener | undefined>;

/** Tiny element builder. `on*` props become listeners; booleans toggle attributes. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue;
    if (typeof value === "function") element.addEventListener(name.slice(2).toLowerCase(), value);
    else if (value === true) element.setAttribute(name, "");
    else element.setAttribute(name, value);
  }
  for (const child of children) {
    if (child === false || child === null || child === undefined) continue;
    element.append(child);
  }
  return element;
}
