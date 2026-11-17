import type { OutlineNode } from "@claymod/core/snapshot";
import { CLAYMOD_ATTR } from "./messages";

const SKIP = new Set(["script", "style", "noscript", "template", "link", "meta", "head", "iframe"]);
const MAX_NODES = 6000;
const MAX_TEXT = 120;

function ownText(element: Element): string | undefined {
  let text = "";
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? "";
    if (text.length > MAX_TEXT) break;
  }
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed || undefined;
}

function describeElement(element: Element): OutlineNode {
  const node: OutlineNode = { tag: element.localName };
  if (element.id) node.id = element.id;
  if (element.classList.length) node.classes = [...element.classList];
  const role = element.getAttribute("role");
  if (role) node.role = role;
  const text = ownText(element);
  if (text) node.text = text;
  return node;
}

/** Converts the live DOM into the plain tree core renders; skips Claymod's own UI. */
export function outlineTree(root: Element): OutlineNode {
  let budget = MAX_NODES;
  const walk = (element: Element): OutlineNode => {
    const node = describeElement(element);
    budget--;
    if (element.localName === "svg") return node; // icon internals are noise
    const children: OutlineNode[] = [];
    for (const child of element.children) {
      if (budget <= 0) break;
      if (
        SKIP.has(child.localName) ||
        child.hasAttribute(CLAYMOD_ATTR) ||
        child.hasAttribute("hidden")
      )
        continue;
      children.push(walk(child));
    }
    if (children.length) node.children = children;
    return node;
  };
  return walk(root);
}
