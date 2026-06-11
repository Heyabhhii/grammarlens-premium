/**
 * TextExtractor
 * Extracts plain text from the active document area,
 * building a DOM-to-offset map for highlight positioning.
 * Phase 2 implementation.
 */

import type { DOMTextNode } from '../types/index.js';

export class TextExtractor {
  constructor(_platform: string) {
    void _platform;
  }

  /**
   * Extract full document text and a node map.
   * Returns { text, nodeMap } where nodeMap[i].node contains the DOM Text
   * node holding character at absolute offset i.
   */
  extract(): { text: string; nodeMap: DOMTextNode[] } {
    // TODO: implement per-platform extraction
    // - google-docs: query .kix-page-content-block text nodes, skip outline
    // - gmail: query .editable / [contenteditable]
    // - generic: gather all contenteditable + textarea
    return { text: '', nodeMap: [] };
  }
}
