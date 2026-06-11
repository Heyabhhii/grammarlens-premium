/**
 * GrammarLens — Navigation Type Definitions
 */

import type { ProcessedSuggestion } from './grammar.js';

// ─── Navigation Entry ─────────────────────────────────────────────────────────

/**
 * A resolved entry in the navigation registry — one suggestion mapped to
 * its current DOM Range and viewport geometry.
 */
export interface NavigationEntry {
  suggestionId: string;
  suggestion:   ProcessedSuggestion;
  /** The live DOM Range covering the error text */
  range:        Range;
  /** Whether the entry is currently the focused/active one */
  isActive:     boolean;
}

// ─── Navigation State ─────────────────────────────────────────────────────────

export interface NavigationState {
  /** ID of the currently focused suggestion, or null if none */
  activeId:     string | null;
  /** All navigable IDs in document order */
  orderedIds:   string[];
  /** Index of activeId within orderedIds, or -1 */
  activeIndex:  number;
  /** Total navigable suggestion count */
  totalCount:   number;
}

// ─── Scroll Options ───────────────────────────────────────────────────────────

export interface ScrollTargetOptions {
  /** true = always scroll even if target is visible (default: false) */
  forceScroll?:  boolean;
  /** Scroll behaviour (default: 'smooth') */
  behavior?:     ScrollBehavior;
  /** Milliseconds to wait before flashing after scroll starts (default: 350) */
  flashDelayMs?: number;
}

// ─── Focus Result ─────────────────────────────────────────────────────────────

export type FocusResultStatus =
  | 'focused'          // Scrolled (or already visible) and flashed
  | 'not_found'        // No highlight entry for this ID
  | 'out_of_range'     // Range is detached / stale
  | 'already_active';  // Was already the active suggestion (re-flashed)

export interface FocusResult {
  status:  FocusResultStatus;
  id:      string;
  entry:   NavigationEntry | null;
}
