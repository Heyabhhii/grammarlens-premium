/**
 * GrammarLens — Text Mapper
 *
 * Builds a flat string representation of all editable page content and a
 * parallel NodeMap that tracks where each DOM Text node sits within that string.
 *
 * This is the critical bridge between LanguageTool's flat-text offsets and
 * the actual DOM nodes that need to be highlighted.
 *
 * Paragraph/block boundaries between editable roots are represented by "\n\n"
 * separators. Inline block boundaries (e.g. <div> inside contenteditable)
 * produce a single "\n". These virtual separators don't correspond to any
 * DOM node but keep the joined text structurally accurate for LanguageTool.
 */

import type { NodeMapEntry, TextMap } from '../types/highlighting.js';
import { getEditableRoots } from './domWalker.js';

// ─── Block-level tags that introduce a newline in the flattened text ──────────

const BLOCK_TAGS = new Set<string>([
  'P', 'DIV', 'LI', 'TR', 'TD', 'TH',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'PRE', 'ADDRESS', 'ARTICLE',
  'SECTION', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE',
  'BR',
]);

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build the TextMap for the current page state.
 * Must be called fresh before each new batch of suggestions to ensure
 * offsets align with LanguageTool's latest response.
 */
export function buildTextMap(doc: Document = document): TextMap {
  const roots = getEditableRoots(doc);
  return buildFromRoots(roots);
}

/**
 * Build a TextMap from a specific list of editable roots.
 * Useful when the caller already knows which elements to scan.
 */
export function buildFromRoots(roots: HTMLElement[]): TextMap {
  const nodeMap: NodeMapEntry[] = [];
  const parts:   string[]       = [];
  let   cursor = 0;

  roots.forEach((root, rootIndex) => {
    // Separate editable roots with double newline (paragraph break)
    if (rootIndex > 0) {
      parts.push('\n\n');
      cursor += 2;
    }

    cursor = processRoot(root, nodeMap, parts, cursor);
  });

  return {
    text:         parts.join(''),
    nodeMap,
    editableRoots: roots,
  };
}

// ─── Private: Process a Single Root ──────────────────────────────────────────

function processRoot(
  root: HTMLElement,
  nodeMap: NodeMapEntry[],
  parts:   string[],
  cursor:  number
): number {
  // Walk the root using a custom recursive walker that tracks block boundaries
  cursor = walkNode(root, root, nodeMap, parts, cursor, false);
  return cursor;
}

/**
 * Recursively walk a DOM subtree, accumulating text content and building
 * the NodeMap. Inserts "\n" at block-level element boundaries.
 */
function walkNode(
  node:    Node,
  root:    HTMLElement,
  nodeMap: NodeMapEntry[],
  parts:   string[],
  cursor:  number,
  addedNewlineBefore: boolean
): number {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node as Text).nodeValue ?? '';
    if (text.length === 0) return cursor;

    parts.push(text);
    nodeMap.push({
      node:       node as Text,
      nodeStart:  cursor,
      nodeLength: text.length,
    });
    cursor += text.length;
    return cursor;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return cursor;

  const el      = node as HTMLElement;
  const tagName = el.tagName;

  // Skip excluded tags entirely
  const SKIP_TAGS_SET = new Set<string>(['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'CANVAS', 'SVG', 'SELECT']);
  if (SKIP_TAGS_SET.has(tagName)) return cursor;

  // Insert newline before block-level elements (if we haven't just added one)
  const isBlock = BLOCK_TAGS.has(tagName);
  let insertedNewline = false;

  if (isBlock && !addedNewlineBefore && cursor > 0) {
    const lastChar = parts.length > 0 ? (parts[parts.length - 1] ?? '').slice(-1) : '';
    if (lastChar !== '\n') {
      parts.push('\n');
      cursor += 1;
      insertedNewline = true;
    }
  }

  // Recurse into children
  const children = Array.from(el.childNodes);
  let childAddedNewline = insertedNewline;

  for (const child of children) {
    const prevCursor = cursor;
    cursor = walkNode(child, root, nodeMap, parts, cursor, childAddedNewline);
    // Track whether a newline was added at the start of this child's content
    childAddedNewline = cursor === prevCursor ? childAddedNewline : false;
  }

  // Insert newline after block-level elements
  if (isBlock) {
    const lastChar = parts.length > 0 ? (parts[parts.length - 1] ?? '').slice(-1) : '';
    if (lastChar !== '\n') {
      parts.push('\n');
      cursor += 1;
    }
  }

  return cursor;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Check whether a given flat-text offset falls within any real text node
 * (not a virtual separator).
 */
export function isRealOffset(map: TextMap, offset: number): boolean {
  return findEntryIndex(map.nodeMap, offset) !== -1;
}

/**
 * Binary-search the NodeMap for the entry containing `offset`.
 * Returns -1 if the offset falls in a virtual separator region.
 */
export function findEntryIndex(nodeMap: NodeMapEntry[], offset: number): number {
  let lo = 0;
  let hi = nodeMap.length - 1;

  while (lo <= hi) {
    const mid  = (lo + hi) >>> 1;
    const entry = nodeMap[mid];
    if (entry === undefined) break;

    const entryEnd = entry.nodeStart + entry.nodeLength;

    if (offset < entry.nodeStart) {
      hi = mid - 1;
    } else if (offset >= entryEnd) {
      lo = mid + 1;
    } else {
      return mid;
    }
  }

  return -1;
}
