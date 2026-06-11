/**
 * GrammarLens — Range Finder
 *
 * Converts a LanguageTool (offset, length) pair into a real DOM Range object
 * and its associated DOMRects for underline positioning.
 *
 * Uses binary search against the NodeMap for O(log n) lookup.
 */

import type { FoundRange, NodeMapEntry, TextMap } from '../types/highlighting.js';
import { findEntryIndex } from './textMapper.js';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve a LanguageTool offset + length into a DOM Range.
 *
 * Returns null if:
 *  - The offset falls in a virtual separator region (newlines between blocks)
 *  - The target text nodes have been removed from the DOM
 *  - The range would produce zero-width or empty rects
 */
export function findDOMRange(
  map:    TextMap,
  offset: number,
  length: number
): FoundRange | null {
  if (length <= 0 || offset < 0 || offset >= map.text.length) return null;

  const endOffset = offset + length;

  // Find the entry containing the start position
  const startIdx = findEntryIndex(map.nodeMap, offset);
  if (startIdx === -1) return null;

  const startEntry = map.nodeMap[startIdx];
  if (startEntry === undefined) return null;

  // Find the entry containing the end position (end is exclusive, so -1)
  const endSearchOffset = endOffset - 1;
  const endIdx = findEntryIndex(map.nodeMap, endSearchOffset);
  if (endIdx === -1) return null;

  const endEntry = map.nodeMap[endIdx];
  if (endEntry === undefined) return null;

  // Validate nodes are still in the document
  if (!document.contains(startEntry.node) || !document.contains(endEntry.node)) {
    return null;
  }

  // Compute intra-node offsets
  const startNodeOffset = offset - startEntry.nodeStart;
  const endNodeOffset   = endOffset - endEntry.nodeStart;

  // Clamp to node bounds
  const clampedStart = Math.max(0, Math.min(startNodeOffset, startEntry.nodeLength));
  const clampedEnd   = Math.max(0, Math.min(endNodeOffset, endEntry.nodeLength));

  // Build the DOM Range
  let range: Range;
  try {
    range = document.createRange();
    range.setStart(startEntry.node, clampedStart);
    range.setEnd(endEntry.node, clampedEnd);
  } catch {
    // Range can throw if nodes are detached or offsets are out of range
    return null;
  }

  // Get bounding rects for positioning underlines
  const rects = getUsableRects(range);
  if (rects.length === 0) return null;

  return {
    startNode:   startEntry.node,
    startOffset: clampedStart,
    endNode:     endEntry.node,
    endOffset:   clampedEnd,
    range,
    rects,
  };
}

// ─── Private: Rect Utilities ──────────────────────────────────────────────────

/**
 * Return all non-degenerate client rects for a range.
 * Filters out zero-width rects (e.g. from collapsed ranges or line-break artefacts).
 */
function getUsableRects(range: Range): DOMRect[] {
  const rectList = range.getClientRects();
  const results: DOMRect[] = [];

  for (let i = 0; i < rectList.length; i++) {
    const rect = rectList.item(i);
    if (rect === null) continue;
    // Ignore zero-size or sub-pixel rects
    if (rect.width < 1 || rect.height < 1) continue;
    results.push(rect);
  }

  // If getClientRects() returned nothing useful, fall back to getBoundingClientRect
  if (results.length === 0) {
    const bounding = range.getBoundingClientRect();
    if (bounding.width >= 1 && bounding.height >= 1) {
      results.push(bounding);
    }
  }

  return results;
}

/**
 * Check whether a NodeMapEntry is still valid (node is in the document
 * and its text content still matches what was mapped).
 */
export function isEntryStale(entry: NodeMapEntry): boolean {
  if (!document.contains(entry.node)) return true;
  const current = entry.node.nodeValue ?? '';
  return current.length !== entry.nodeLength;
}

/**
 * Batch-validate a NodeMap and return true if any entry is stale.
 * Used to decide whether a full remap is needed.
 */
export function isMapStale(nodeMap: NodeMapEntry[]): boolean {
  for (const entry of nodeMap) {
    if (isEntryStale(entry)) return true;
  }
  return false;
}
