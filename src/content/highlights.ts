/**
 * GrammarLens — Highlight Engine
 *
 * Renders non-destructive underline highlights over document text by
 * injecting absolutely-positioned overlay spans into the page. All spans
 * use pointer-events:none so they never interfere with user interaction.
 *
 * Coordinate system
 * ─────────────────
 * Highlights are `position:absolute` children of a container appended to
 * document.body. Their coordinates are computed as:
 *
 *   left = rect.left + window.scrollX
 *   top  = rect.bottom + window.scrollY - UNDERLINE_OFFSET
 *
 * Because the container itself is `position:absolute; top:0; left:0`, these
 * coordinates are relative to the document origin, so highlights scroll
 * naturally with the page — no scroll event listeners required.
 *
 * Public API (used by subsequent phases)
 * ───────────────────────────────────────
 *   highlightSuggestions(suggestions)  — full render pass
 *   removeSuggestion(id)               — remove one highlight
 *   clearHighlights()                  — remove all highlights
 *   refreshSuggestions()               — rebuild map + re-render current set
 *   focusSuggestion(id)                — flash + return entry (Phase 5)
 *   getEntry(id)                       — look up entry (Phase 5)
 */

import type { ProcessedSuggestion } from '../types/grammar.js';
import type { HighlightEntry, HighlightType, TextMap } from '../types/highlighting.js';
import { resolveHighlightType } from '../types/highlighting.js';
import { buildTextMap } from './textMapper.js';
import { findDOMRange, isMapStale } from './rangeFinder.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const CONTAINER_ID      = 'gl-highlights-root';
const STYLE_ID          = 'gl-highlights-style';
/** Pixels above the bottom of the text rect where the underline is drawn */
const UNDERLINE_OFFSET  = 1;
/** Underline thickness in px */
const UNDERLINE_HEIGHT  = 2;
/** Debounce delay for MutationObserver-triggered re-renders (ms) */
const REFRESH_DEBOUNCE  = 120;

// ─── Highlight CSS ────────────────────────────────────────────────────────────

const HIGHLIGHT_CSS = `
.gl-hl {
  position: absolute;
  height: ${UNDERLINE_HEIGHT}px;
  pointer-events: none;
  z-index: 2147483640;
  border-radius: 1px;
}
.gl-hl--error {
  background: #ef4444;
}
.gl-hl--spelling {
  background: repeating-linear-gradient(
    90deg,
    #ef4444 0,    #ef4444 3px,
    transparent 3px, transparent 6px
  );
}
.gl-hl--style {
  background: #7c3aed;
}
.gl-hl--clarity {
  background: #3b82f6;
}
.gl-hl--warning {
  background: #f97316;
}
@keyframes gl-hl-flash {
  0%,100% { opacity: 1; }
  25%,75%  { opacity: 0.15; }
}
.gl-hl--focused {
  animation: gl-hl-flash 0.7s ease-in-out;
}
`;

// ─── HighlightEngine ──────────────────────────────────────────────────────────

export class HighlightEngine {
  private container: HTMLDivElement | null = null;
  private registry    = new Map<string, HighlightEntry>();
  private textMap:     TextMap | null = null;
  private suggestions: ProcessedSuggestion[] = [];
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private mutationObserver: MutationObserver | null = null;
  private resizeObserver:   ResizeObserver   | null = null;
  private mounted = false;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Inject the highlight container and global CSS into the page.
   * Must be called before any highlight operation.
   */
  mount(): void {
    if (this.mounted) return;
    this.mounted = true;

    this.injectStyles();
    this.createContainer();
    this.startObservers();
  }

  /** Remove all highlights and clean up observers. */
  destroy(): void {
    this.stopObservers();
    this.clearHighlights();
    this.container?.remove();
    this.container = null;
    document.getElementById(STYLE_ID)?.remove();
    this.mounted = false;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Full render pass: rebuilds the text map and renders underlines for all
   * active (non-dismissed, non-fixed) suggestions.
   */
  highlightSuggestions(suggestions: ProcessedSuggestion[]): void {
    this.suggestions = suggestions;
    this.clearHighlights();

    // Rebuild the text map against the current DOM state
    this.textMap = buildTextMap();

    const active = suggestions.filter(
      (s) => s.status !== 'fixed' && s.status !== 'dismissed' && s.status !== 'ignored'
    );

    active.forEach((s) => this.renderOne(s));
  }

  /**
   * Full render pass using an externally-supplied TextMap.
   *
   * Called by content/index.ts with the GDocs-specific TextMap produced by
   * `buildGDocsTextMap()` and aligned to canonical text via
   * `alignCanonicalToDOM()`.  This replaces the old internal call to the
   * generic `buildTextMap()` and ensures all highlighting uses the same
   * text source as LanguageTool checks and Google Docs API fix indices.
   *
   * @param suggestions  Active suggestions from LanguageTool
   * @param textMap      Pre-built GDocs TextMap with canonical-aligned offsets
   */
  highlightSuggestionsWithMap(
    suggestions: ProcessedSuggestion[],
    textMap:     TextMap
  ): void {
    this.suggestions = suggestions;
    this.clearHighlights();
    this.textMap = textMap;

    const active = suggestions.filter(
      (s) => s.status !== 'fixed' && s.status !== 'dismissed' && s.status !== 'ignored'
    );

    active.forEach((s) => this.renderOne(s));
  }

  /**
   * Remove the highlight for a single suggestion (e.g. after fix or dismiss).
   */
  removeSuggestion(id: string): void {
    this.removeEntry(id);
    this.suggestions = this.suggestions.filter((s) => s.id !== id);
  }

  /**
   * Remove all highlights from the page.
   */
  clearHighlights(): void {
    this.registry.forEach((entry) => entry.spans.forEach((s) => s.remove()));
    this.registry.clear();
    if (this.container) this.container.innerHTML = '';
  }

  /**
   * Rebuild the text map and re-render all current suggestions.
   * Called after the DOM changes significantly (resize, mutation).
   */
  refreshSuggestions(): void {
    if (this.suggestions.length === 0) return;

    // If the map is stale (text nodes changed), rebuild using the same map source.
    // If a canonical TextMap was supplied via highlightSuggestionsWithMap(), use it
    // rather than falling back to the generic buildTextMap().
    if (this.textMap === null || isMapStale(this.textMap.nodeMap)) {
      if (this.textMap !== null) {
        // Re-render with the existing (stale) map as a best-effort.
        // content/index.ts will trigger a full recheck via scheduleCheck
        // when it detects content changes, which will produce a fresh map.
        this.highlightSuggestionsWithMap(this.suggestions, this.textMap);
      } else {
        // No map yet — use generic fallback (should not happen in GDocs flow)
        this.highlightSuggestions(this.suggestions);
      }
      return;
    }

    // Map is current — just reposition spans to account for layout changes
    this.repositionAll();
  }

  /**
   * Flash the highlight for a given suggestion to draw the user's eye.
   * Returns the HighlightEntry for use by jump-to-error (Phase 5).
   */
  focusSuggestion(id: string): HighlightEntry | null {
    const entry = this.registry.get(id);
    if (!entry) return null;

    entry.spans.forEach((span) => {
      span.classList.add('gl-hl--focused');
      span.addEventListener(
        'animationend',
        () => span.classList.remove('gl-hl--focused'),
        { once: true }
      );
    });

    return entry;
  }

  /**
   * Return the HighlightEntry for a given suggestion ID, or null.
   * Used by jump-to-error in Phase 5.
   */
  getEntry(id: string): HighlightEntry | null {
    return this.registry.get(id) ?? null;
  }

  /**
   * Return all currently registered suggestion IDs (active highlights only).
   * Used by NavigationManager to build the ordered navigation list.
   */
  getAllEntryIds(): string[] {
    return Array.from(this.registry.keys());
  }

  // ── Private: Rendering ─────────────────────────────────────────────────────

  private renderOne(suggestion: ProcessedSuggestion): void {
    if (!this.container || !this.textMap) return;

    const foundRange = findDOMRange(this.textMap, suggestion.offset, suggestion.length);
    if (!foundRange) return;

    const type   = resolveHighlightType(suggestion.severity, suggestion.category, suggestion.issueType);
    const spans  = this.createSpansFromRects(foundRange.rects, type, suggestion.id);

    if (spans.length === 0) return;

    spans.forEach((span) => this.container!.appendChild(span));

    this.registry.set(suggestion.id, {
      id:         suggestion.id,
      suggestion,
      type,
      spans,
      range:      foundRange.range,
      active:     true,
    });
  }

  private createSpansFromRects(
    rects: DOMRect[],
    type:  HighlightType,
    id:    string
  ): HTMLElement[] {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    return rects
      .filter((r) => r.width >= 1)
      .map((rect, i) => {
        const span = document.createElement('span');
        span.className    = `gl-hl gl-hl--${type}`;
        span.dataset['suggestionId'] = id;
        span.dataset['rectIndex']    = String(i);
        span.style.cssText = [
          `left:${Math.round(rect.left   + scrollX)}px`,
          `top:${Math.round(rect.bottom  + scrollY - UNDERLINE_OFFSET - UNDERLINE_HEIGHT)}px`,
          `width:${Math.round(rect.width)}px`,
        ].join(';');
        return span;
      });
  }

  // ── Private: Repositioning ─────────────────────────────────────────────────

  /**
   * Recalculate span positions from existing ranges (no DOM re-walk).
   * Used after viewport changes where the text itself hasn't changed.
   */
  private repositionAll(): void {
    if (!this.container) return;

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    this.registry.forEach((entry) => {
      let rects: DOMRect[];
      try {
        rects = Array.from(entry.range.getClientRects()).filter((r) => r.width >= 1);
      } catch {
        // Range is detached — remove this entry
        this.removeEntry(entry.id);
        return;
      }

      if (rects.length === 0) {
        this.removeEntry(entry.id);
        return;
      }

      // Resize span array to match new rect count
      while (entry.spans.length > rects.length) {
        entry.spans.pop()?.remove();
      }
      while (entry.spans.length < rects.length) {
        const span = document.createElement('span');
        span.className = `gl-hl gl-hl--${entry.type}`;
        span.dataset['suggestionId'] = entry.id;
        this.container!.appendChild(span);
        entry.spans.push(span);
      }

      // Update positions
      rects.forEach((rect, i) => {
        const span = entry.spans[i];
        if (!span) return;
        span.style.left  = `${Math.round(rect.left   + scrollX)}px`;
        span.style.top   = `${Math.round(rect.bottom + scrollY - UNDERLINE_OFFSET - UNDERLINE_HEIGHT)}px`;
        span.style.width = `${Math.round(rect.width)}px`;
      });
    });
  }

  // ── Private: Registry Helpers ──────────────────────────────────────────────

  private removeEntry(id: string): void {
    const entry = this.registry.get(id);
    if (entry) {
      entry.spans.forEach((s) => s.remove());
      this.registry.delete(id);
    }
  }

  // ── Private: Observers ─────────────────────────────────────────────────────

  private startObservers(): void {
    // MutationObserver: rebuild map + re-render after DOM changes
    this.mutationObserver = new MutationObserver(() => this.scheduleRefresh());
    this.mutationObserver.observe(document.body, {
      childList:     true,
      subtree:       true,
      characterData: true,
    });

    // ResizeObserver: reposition spans when layout changes
    this.resizeObserver = new ResizeObserver(() => this.scheduleRefresh());
    this.resizeObserver.observe(document.documentElement);
  }

  private stopObservers(): void {
    this.mutationObserver?.disconnect();
    this.resizeObserver?.disconnect();
    this.mutationObserver = null;
    this.resizeObserver   = null;
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.refreshSuggestions();
    }, REFRESH_DEBOUNCE);
  }

  // ── Private: DOM Setup ─────────────────────────────────────────────────────

  private injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id          = STYLE_ID;
    style.textContent = HIGHLIGHT_CSS;
    (document.head ?? document.documentElement).appendChild(style);
  }

  private createContainer(): void {
    let container = document.getElementById(CONTAINER_ID) as HTMLDivElement | null;
    if (!container) {
      container = document.createElement('div');
      container.id = CONTAINER_ID;
      container.setAttribute('aria-hidden', 'true');
      container.style.cssText = [
        'position:absolute',
        'top:0', 'left:0',
        'width:0', 'height:0',
        'overflow:visible',
        'pointer-events:none',
        'z-index:2147483640',
      ].join(';');
      (document.body ?? document.documentElement).appendChild(container);
    }
    this.container = container;
  }
}
