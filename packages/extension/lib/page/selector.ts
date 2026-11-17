const MAX_DEPTH = 8;
// Generated class names (css-1x2y3z, sc-abc123, _a1b2c3) change between deploys; skip them.
const GENERATED_CLASS = /^(css|sc|jsx|emotion|styled)-|^_|\d{3,}|[a-z]+_[a-zA-Z0-9]{5,}$/;
const STABLE_ATTRS = ["data-testid", "data-test", "data-qa", "aria-label", "name"];

const isUnique = (selector: string, root: ParentNode) => {
  try {
    return root.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
};

function stableClasses(element: Element): string[] {
  return [...element.classList].filter((name) => !GENERATED_CLASS.test(name)).slice(0, 2);
}

function segmentFor(element: Element): string {
  if (element.id && !GENERATED_CLASS.test(element.id)) return `#${CSS.escape(element.id)}`;
  for (const attr of STABLE_ATTRS) {
    const value = element.getAttribute(attr);
    if (value) return `${element.localName}[${attr}="${CSS.escape(value)}"]`;
  }
  const classes = stableClasses(element)
    .map((name) => `.${CSS.escape(name)}`)
    .join("");
  let segment = `${element.localName}${classes}`;
  const parent = element.parentElement;
  if (parent) {
    const sameKind = [...parent.children].filter((child) => child.matches(segment));
    if (sameKind.length > 1) {
      const index = [...parent.children]
        .filter((c) => c.localName === element.localName)
        .indexOf(element);
      segment += `:nth-of-type(${index + 1})`;
    }
  }
  return segment;
}

/**
 * A short CSS selector that matches only this element, preferring ids, test ids and stable
 * class names over position, so it survives small page changes.
 */
export function uniqueSelector(element: Element): string {
  const document = element.ownerDocument;
  const parts: string[] = [];
  let current: Element | null = element;
  for (let depth = 0; current && depth < MAX_DEPTH; depth++) {
    if (current === document.body || current === document.documentElement) break;
    parts.unshift(segmentFor(current));
    const selector = parts.join(" > ");
    if (isUnique(selector, document)) return selector;
    current = current.parentElement;
  }
  return parts.join(" > ") || element.localName;
}
