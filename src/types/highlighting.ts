/**
 * GrammarLens — Highlighting Type Definitions
 */

import type { ProcessedSuggestion, SuggestionSeverity, SuggestionCategory } from './grammar.js';

// ─── Node Map ─────────────────────────────────────────────────────────────────

/**
 * Maps a single DOM Text node to its position in the flat joined text string
 * that was submitted to LanguageTool.
 */
export interface NodeMapEntry {
  /** The actual DOM Text node */
  node: Text;
  /** Absolute character offset in the full text where this node begins */
  nodeStart: number;
  /** Number of characters this node contributes */
  nodeLength: number;
}

/**
 * Flat text representation of all editable content on the page,
 * paired with the node map needed to convert LT offsets → DOM positions.
 */
export interface TextMap {
  /** Joined plain text submitted to LanguageTool */
  text: string;
  /** Ordered list of text node entries, sorted by nodeStart */
  nodeMap: NodeMapEntry[];
  /** The editable root elements that contributed to this map */
  editableRoots: HTMLElement[];
}

// ─── Highlight Rendering ──────────────────────────────────────────────────────

/** Visual underline type, derived from suggestion severity + category */
export type HighlightType =
  | 'error'     // solid red        — grammar/misspelling error
  | 'spelling'  // dotted red       — misspelling specifically
  | 'style'     // solid purple     — style/clarity
  | 'clarity'   // solid blue       — clarity/engagement
  | 'warning';  // solid orange     — non-critical issues

/**
 * One rendered highlight in the page: a suggestion → one or more absolutely-
 * positioned underline spans (one per line of multi-line selections).
 */
export interface HighlightEntry {
  id:         string;
  suggestion: ProcessedSuggestion;
  type:       HighlightType;
  /** Underline span elements injected into the highlights container */
  spans:      HTMLElement[];
  /** The DOM Range covering the error text */
  range:      Range;
  /** Whether the highlight is currently visible / active */
  active:     boolean;
}

// ─── Range Resolution ─────────────────────────────────────────────────────────

/**
 * Result of resolving a LanguageTool offset+length pair
 * into an actual DOM Range with geometry.
 */
export interface FoundRange {
  startNode:   Text;
  startOffset: number;
  endNode:     Text;
  endOffset:   number;
  range:       Range;
  /** One DOMRect per line (multi-line selections produce multiple rects) */
  rects:       DOMRect[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive the visual HighlightType from a suggestion's severity/category. */
export function resolveHighlightType(
  severity: SuggestionSeverity,
  category: SuggestionCategory,
  issueType: string
): HighlightType {
  if (issueType === 'misspelling') return 'spelling';
  if (severity === 'error')        return 'error';
  if (category === 'clarity')      return 'clarity';
  if (category === 'engagement' || category === 'delivery') return 'clarity';
  if (severity === 'style')        return 'style';
  return 'warning';
}
