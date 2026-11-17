import { MAX_OUTLINE_BYTES, type OutlineNode } from "./schema";
import { byteLength } from "./truncate";

const MAX_TEXT = 80;
const MAX_CLASSES = 4;

function describe(node: OutlineNode): string {
  let line = node.tag.toLowerCase();
  if (node.id) line += `#${node.id}`;
  for (const name of (node.classes ?? []).slice(0, MAX_CLASSES)) line += `.${name}`;
  if (node.role) line += ` [role=${node.role}]`;
  const text = node.text?.replace(/\s+/g, " ").trim();
  if (text) {
    line += ` "${text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text}"`;
  }
  return line;
}

/**
 * Renders the tree breadth-first, so when the byte budget runs out we lose the deepest
 * details rather than whole sections of the page. Output is indented depth-first for reading.
 */
export function renderOutline(root: OutlineNode, maxBytes = MAX_OUTLINE_BYTES): string {
  const kept = new Set<OutlineNode>();
  const queue: Array<[OutlineNode, number]> = [[root, 0]];
  let budget = maxBytes - 64; // room for the truncation note
  let truncated = false;
  for (let entry = queue.shift(); entry; entry = queue.shift()) {
    const [node, depth] = entry;
    const cost = 2 * depth + byteLength(describe(node)) + 1;
    if (cost > budget) {
      truncated = true;
      break;
    }
    budget -= cost;
    kept.add(node);
    for (const child of node.children ?? []) queue.push([child, depth + 1]);
  }
  const lines: string[] = [];
  const walk = (node: OutlineNode, depth: number) => {
    if (!kept.has(node)) return;
    lines.push(`${"  ".repeat(depth)}${describe(node)}`);
    for (const child of node.children ?? []) walk(child, depth + 1);
  };
  walk(root, 0);
  if (truncated) lines.push("… (outline truncated to fit the size limit)");
  return lines.join("\n");
}
