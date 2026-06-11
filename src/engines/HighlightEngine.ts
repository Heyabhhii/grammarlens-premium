/**
 * HighlightEngine
 * Renders red/blue/purple underlines over document text using
 * absolutely-positioned overlay elements.
 * Phase 2 implementation.
 */

import type { DOMTextNode, Suggestion } from '../types/index.js';

export class HighlightEngine {
  private overlays: Map<string, HTMLElement> = new Map();

  /**
   * Render underline highlights for all suggestions.
   * @param suggestions  List of active suggestions
   * @param nodeMap      DOM-text-node map from TextExtractor
   */
  render(_suggestions: Suggestion[], _nodeMap: DOMTextNode[]): void {
    // TODO:
    // 1. Clear previous overlays
    // 2. For each suggestion, find the matching Text nodes
    // 3. Create a <span> overlay with class gl-underline--{type}
    // 4. Position it absolutely over the text using getBoundingClientRect
    // 5. Append to document.body (or a dedicated overlay root)
  }

  /**
   * Remove all highlights from the page.
   */
  clear(): void {
    this.overlays.forEach((el) => el.remove());
    this.overlays.clear();
  }

  /**
   * Flash yellow highlight on a specific suggestion to draw attention.
   */
  flash(suggestionId: string): void {
    const el = this.overlays.get(suggestionId);
    if (el) {
      el.classList.add('gl-flash');
      el.addEventListener('animationend', () => el.classList.remove('gl-flash'), { once: true });
    }
  }
}
