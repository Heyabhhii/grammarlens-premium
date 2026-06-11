/**
 * GrammarLens — Focus Manager
 *
 * Low-level utilities for scrolling to a DOM Range and flashing the
 * target region with a yellow highlight animation.
 *
 * Scroll-container detection walks the ancestor chain and works correctly
 * inside nested scrollable elements (Gmail compose, LinkedIn editor, Notion,
 * WordPress Gutenberg blocks, and the Google Docs main body).
 *
 * Coordinate approach
 * ───────────────────
 * The yellow flash overlay uses `position: fixed` so it aligns with the
 * viewport rect returned by getClientRects() at the moment of creation.
 * We delay creation by `flashDelayMs` (default 350 ms) so the smooth scroll
 * has time to settle before we sample the viewport position.
 */

import type { ScrollTargetOptions } from '../types/navigation.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const FLASH_STYLE_ID   = 'gl-flash-style';
const FLASH_CLASS      = 'gl-flash-overlay';
const DEFAULT_FLASH_DELAY_MS = 350;

const FLASH_CSS = `
.${FLASH_CLASS} {
  position: fixed;
  pointer-events: none;
  z-index: 2147483641;
  border-radius: 3px;
  background: rgba(253, 224, 71, 0.55);
  animation: gl-flash-fade 1.8s ease-out forwards;
}
@keyframes gl-flash-fade {
  0%   { opacity: 1; }
  70%  { opacity: 0.8; }
  100% { opacity: 0; }
}
`;

// ─── FocusManager ────────────────────────────────────────────────────────────

export class FocusManager {

  constructor() {
    this.injectFlashStyles();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Scroll the page so the target Range is centered in the viewport, then
   * flash it with a yellow overlay.
   *
   * If the target is already fully visible and `forceScroll` is false, only
   * the flash animation is triggered.
   */
  scrollToRange(range: Range, options: ScrollTargetOptions = {}): void {
    const rects = this.getUsableRects(range);
    if (rects.length === 0) return;

    const targetRect = rects[0]!;
    const alreadyVisible = this.isVisible(targetRect);
    const behavior: ScrollBehavior = options.behavior ?? 'smooth';
    const flashDelay = options.flashDelayMs ?? DEFAULT_FLASH_DELAY_MS;

    if (!alreadyVisible || options.forceScroll) {
      const container = this.findScrollContainer(range.startContainer);
      this.scrollToCenter(targetRect, container, behavior);
    }

    // Flash after scroll settles
    const delay = alreadyVisible ? 0 : flashDelay;
    setTimeout(() => this.flashRange(range), delay);
  }

  /**
   * Flash the area covered by the Range with a temporary yellow overlay.
   * Recalculates rects at call time (post-scroll).
   */
  flashRange(range: Range): void {
    const rects = this.getUsableRects(range);
    rects.forEach((rect) => this.flashRect(rect));
  }

  /**
   * Return true if the given rect is entirely within the viewport.
   */
  isVisible(rect: DOMRect): boolean {
    return (
      rect.top    >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.left   >= 0 &&
      rect.right  <= window.innerWidth
    );
  }

  /**
   * Return true if any part of the rect intersects the viewport.
   */
  isPartiallyVisible(rect: DOMRect): boolean {
    return (
      rect.bottom > 0 &&
      rect.top    < window.innerHeight &&
      rect.right  > 0 &&
      rect.left   < window.innerWidth
    );
  }

  /**
   * Walk up the ancestor chain from `node` and return the first element
   * whose computed overflow allows scrolling, or `window` if none.
   *
   * Works for nested scroll containers (e.g. Gmail compose, Notion blocks,
   * Google Docs body scroll area).
   */
  findScrollContainer(node: Node): Element | Window {
    let current: Element | null =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : node.parentElement;

    while (current && current !== document.documentElement) {
      if (this.isScrollable(current)) return current;
      current = current.parentElement;
    }

    return window;
  }

  // ── Private: Scroll ────────────────────────────────────────────────────────

  private scrollToCenter(
    targetRect: DOMRect,
    container:  Element | Window,
    behavior:   ScrollBehavior
  ): void {
    if (container instanceof Window) {
      const viewportCenter = window.innerHeight / 2;
      const targetCenter   = targetRect.top + targetRect.height / 2;
      const delta          = targetCenter - viewportCenter;
      window.scrollBy({ top: delta, behavior });
    } else {
      const containerRect  = (container as HTMLElement).getBoundingClientRect();
      const containerMidY  = containerRect.height / 2;
      // Target position relative to the container
      const relTop         = targetRect.top - containerRect.top;
      const targetMidY     = relTop + targetRect.height / 2;
      const delta          = targetMidY - containerMidY;
      container.scrollBy({ top: delta, behavior });
    }
  }

  private isScrollable(el: Element): boolean {
    const style    = window.getComputedStyle(el);
    const overflow = style.overflow + style.overflowY + style.overflowX;
    if (!/auto|scroll/.test(overflow)) return false;
    // Also check that the element actually has scroll room
    return el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;
  }

  // ── Private: Flash ─────────────────────────────────────────────────────────

  private flashRect(rect: DOMRect): void {
    if (rect.width < 1 || rect.height < 1) return;

    const el = document.createElement('div');
    el.className = FLASH_CLASS;
    el.style.left   = `${Math.round(rect.left)}px`;
    el.style.top    = `${Math.round(rect.top)}px`;
    el.style.width  = `${Math.round(rect.width)}px`;
    el.style.height = `${Math.round(rect.height)}px`;

    (document.body ?? document.documentElement).appendChild(el);

    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

  // ── Private: Geometry ──────────────────────────────────────────────────────

  private getUsableRects(range: Range): DOMRect[] {
    try {
      const list    = range.getClientRects();
      const results: DOMRect[] = [];
      for (let i = 0; i < list.length; i++) {
        const r = list.item(i);
        if (r && r.width >= 1 && r.height >= 1) results.push(r);
      }
      if (results.length === 0) {
        const bounding = range.getBoundingClientRect();
        if (bounding.width >= 1) results.push(bounding);
      }
      return results;
    } catch {
      return [];
    }
  }

  // ── Private: Styles ────────────────────────────────────────────────────────

  private injectFlashStyles(): void {
    if (document.getElementById(FLASH_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id          = FLASH_STYLE_ID;
    style.textContent = FLASH_CSS;
    (document.head ?? document.documentElement).appendChild(style);
  }
}

// Module-level singleton — shared across NavigationManager and any direct callers.
export const focusManager = new FocusManager();
