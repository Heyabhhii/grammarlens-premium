/**
 * GrammarLens — Navigation Manager
 *
 * High-level coordinator for jump-to-error functionality.
 *
 * Responsibilities
 * ────────────────
 * 1. Maintains an ordered registry of navigable suggestions (document order).
 * 2. Implements focusSuggestion() — scroll + flash + expand sidebar card.
 * 3. Implements keyboard navigation (Alt+N / Alt+P → next/previous).
 * 4. Click-on-text detection: clicking highlighted text activates its card.
 * 5. Dynamic updates: refreshes registry when suggestions change.
 * 6. Bidirectional sync: sidebar card click → focus; focus → expand card.
 *
 * Google Docs rules
 * ─────────────────
 * All Range operations are performed against highlight entries produced by
 * HighlightEngine, which only maps text inside the document body
 * (never the outline, navigation panel, or comments).
 */

import type { ProcessedSuggestion } from '../types/grammar.js';
import type { FocusResult, NavigationEntry, NavigationState } from '../types/navigation.js';
import type { HighlightEngine } from './highlights.js';
import type { SidebarPanel }    from '../panel/panel.js';
import { focusManager } from './focusManager.js';

// ─── NavigationManager ───────────────────────────────────────────────────────

export class NavigationManager {
  private registry    = new Map<string, NavigationEntry>();
  private orderedIds: string[] = [];
  private activeId:   string | null = null;

  private readonly engine: HighlightEngine;
  private readonly panel:  SidebarPanel;

  private clickListener: ((e: MouseEvent) => void) | null = null;

  // ── Constructor ────────────────────────────────────────────────────────────

  constructor(engine: HighlightEngine, panel: SidebarPanel) {
    this.engine = engine;
    this.panel  = panel;

    this.attachClickListener();

    // Wire sidebar card clicks → focus
    panel.setNavigationHandler((id: string) => {
      this.focusSuggestion(id);
    });
  }

  // ── Public: Suggestion List ────────────────────────────────────────────────

  /**
   * Update the suggestion set. Rebuilds the registry from the current
   * highlight entries and preserves the active selection if possible.
   */
  setSuggestions(suggestions: ProcessedSuggestion[]): void {
    const prevActive = this.activeId;

    this.registry.clear();
    this.orderedIds = [];

    const active = suggestions.filter(
      (s) => s.status !== 'fixed' && s.status !== 'dismissed' && s.status !== 'ignored'
    );

    active.forEach((s) => {
      const entry = this.engine.getEntry(s.id);
      if (!entry) return;

      this.registry.set(s.id, {
        suggestionId: s.id,
        suggestion:   s,
        range:        entry.range,
        isActive:     false,
      });
    });

    // Re-sort by document order using Range comparisons
    this.orderedIds = this.sortByDocumentOrder(Array.from(this.registry.keys()));

    // Preserve active selection if it still exists
    if (prevActive && this.registry.has(prevActive)) {
      this.activeId = prevActive;
      const navEntry = this.registry.get(prevActive);
      if (navEntry) navEntry.isActive = true;
    } else {
      this.activeId = null;
    }
  }

  // ── Public: Navigation API ─────────────────────────────────────────────────

  /**
   * Focus a specific suggestion by ID.
   * Scrolls the document to the error, flashes it, and expands the sidebar card.
   */
  focusSuggestion(id: string): FocusResult {
    const navEntry = this.registry.get(id);

    if (!navEntry) {
      return { status: 'not_found', id, entry: null };
    }

    // Validate that the range is still live
    if (!this.isRangeValid(navEntry.range)) {
      this.registry.delete(id);
      this.orderedIds = this.orderedIds.filter((oid) => oid !== id);
      return { status: 'out_of_range', id, entry: null };
    }

    const alreadyActive = this.activeId === id;

    // Deactivate previous
    this.deactivateCurrent();

    // Activate new
    this.activeId = id;
    navEntry.isActive = true;

    // Scroll + flash
    focusManager.scrollToRange(navEntry.range, {
      forceScroll:  alreadyActive, // re-scroll on double-click of same card
      behavior:     'smooth',
      flashDelayMs: 350,
    });

    // Flash the underline highlight
    this.engine.focusSuggestion(id);

    // Expand and scroll to card in sidebar
    this.panel.focusCard(id);

    return {
      status: alreadyActive ? 'already_active' : 'focused',
      id,
      entry: navEntry,
    };
  }

  /**
   * Focus the next suggestion in document order (wraps around).
   */
  focusNextSuggestion(): FocusResult {
    if (this.orderedIds.length === 0) {
      return { status: 'not_found', id: '', entry: null };
    }

    const nextIdx = this.nextIndex(1);
    const nextId  = this.orderedIds[nextIdx];
    if (nextId === undefined) {
      return { status: 'not_found', id: '', entry: null };
    }

    return this.focusSuggestion(nextId);
  }

  /**
   * Focus the previous suggestion in document order (wraps around).
   */
  focusPreviousSuggestion(): FocusResult {
    if (this.orderedIds.length === 0) {
      return { status: 'not_found', id: '', entry: null };
    }

    const prevIdx = this.nextIndex(-1);
    const prevId  = this.orderedIds[prevIdx];
    if (prevId === undefined) {
      return { status: 'not_found', id: '', entry: null };
    }

    return this.focusSuggestion(prevId);
  }

  /**
   * Remove focus from the currently active suggestion.
   */
  clearFocus(): void {
    this.deactivateCurrent();
    this.activeId = null;
  }

  /**
   * Return the currently active suggestion, or null.
   */
  getActiveSuggestion(): ProcessedSuggestion | null {
    if (!this.activeId) return null;
    return this.registry.get(this.activeId)?.suggestion ?? null;
  }

  /**
   * Return a snapshot of the current navigation state.
   */
  getState(): NavigationState {
    const activeIndex = this.activeId
      ? this.orderedIds.indexOf(this.activeId)
      : -1;

    return {
      activeId:    this.activeId,
      orderedIds:  [...this.orderedIds],
      activeIndex,
      totalCount:  this.orderedIds.length,
    };
  }

  /**
   * Clean up event listeners. Call when the extension is unloading.
   */
  destroy(): void {
    this.detachClickListener();
    this.registry.clear();
    this.orderedIds = [];
    this.activeId   = null;
  }

  // ── Private: Click-on-Text Detection ──────────────────────────────────────

  /**
   * When the user clicks inside the document, check if the click position
   * falls within any registered suggestion range. If so, activate it.
   *
   * Uses viewport coordinates from MouseEvent against Range.getClientRects().
   */
  private attachClickListener(): void {
    this.clickListener = (e: MouseEvent) => {
      // Ignore clicks inside GrammarLens UI
      const target = e.target as HTMLElement | null;
      if (target?.closest('#grammarlens-root, #gl-highlights-root, #gl-flash-style')) {
        return;
      }

      const x = e.clientX;
      const y = e.clientY;

      for (const id of this.orderedIds) {
        const navEntry = this.registry.get(id);
        if (!navEntry || !this.isRangeValid(navEntry.range)) continue;

        const rects = navEntry.range.getClientRects();
        for (let i = 0; i < rects.length; i++) {
          const rect = rects.item(i);
          if (!rect) continue;
          // Extend hit-test zone: 4px above text top (for underline) and 6px below
          if (
            x >= rect.left - 2  &&
            x <= rect.right + 2 &&
            y >= rect.top - 4   &&
            y <= rect.bottom + 6
          ) {
            this.focusSuggestion(id);
            return;
          }
        }
      }
    };

    document.addEventListener('click', this.clickListener, { capture: false });
  }

  private detachClickListener(): void {
    if (this.clickListener) {
      document.removeEventListener('click', this.clickListener, false);
      this.clickListener = null;
    }
  }

  // ── Private: Helpers ───────────────────────────────────────────────────────

  private deactivateCurrent(): void {
    if (!this.activeId) return;
    const entry = this.registry.get(this.activeId);
    if (entry) entry.isActive = false;
  }

  private nextIndex(delta: 1 | -1): number {
    const total = this.orderedIds.length;
    if (total === 0) return 0;

    const currentIdx = this.activeId
      ? this.orderedIds.indexOf(this.activeId)
      : -1;

    if (currentIdx === -1) {
      return delta === 1 ? 0 : total - 1;
    }

    return ((currentIdx + delta) + total) % total;
  }

  private isRangeValid(range: Range): boolean {
    try {
      // A detached range throws on property access in some browsers
      const node = range.startContainer;
      return document.contains(node);
    } catch {
      return false;
    }
  }

  /**
   * Sort suggestion IDs by their position in the document using Range.compareBoundaryPoints.
   * Returns a new array in DOM order (top-to-bottom, left-to-right).
   */
  private sortByDocumentOrder(ids: string[]): string[] {
    return [...ids].sort((a, b) => {
      const ea = this.registry.get(a);
      const eb = this.registry.get(b);
      if (!ea || !eb) return 0;

      try {
        // Range.START_TO_START = 0
        return ea.range.compareBoundaryPoints(Range.START_TO_START, eb.range);
      } catch {
        return 0;
      }
    });
  }
}
