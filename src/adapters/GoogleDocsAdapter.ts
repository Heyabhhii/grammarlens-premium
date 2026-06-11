/**
 * GoogleDocsAdapter
 *
 * Handles all Google Docs-specific logic:
 *  - Text extraction from the Kix editor (body only, not outline/nav)
 *  - DOM-to-offset mapping
 *  - Auto-fix via Google Docs REST API (background worker call)
 *  - Position tracking during collaborative edits
 *
 * Phase 2/3 implementation.
 */

import type { DOMTextNode } from '../types/index.js';

// Google Docs uses .kix-page-content-block for document body paragraphs.
// The document outline lives in .docs-toc-sidebar — must be excluded.
const BODY_SELECTOR     = '.kix-page-content-block';
const EXCLUDED_SELECTOR = '.docs-toc-sidebar, .docs-title-outer, [data-doc-outline]';

export class GoogleDocsAdapter {
  /**
   * Extract plain text from the Google Docs body only.
   * Returns { text, nodeMap }.
   */
  extractText(): { text: string; nodeMap: DOMTextNode[] } {
    const nodeMap: DOMTextNode[] = [];
    let fullText = '';

    const excluded = new Set<Node>(
      Array.from(document.querySelectorAll(EXCLUDED_SELECTOR))
    );

    const blocks = document.querySelectorAll(BODY_SELECTOR);
    blocks.forEach((block) => {
      if (isExcluded(block, excluded)) return;

      const walker = document.createTreeWalker(
        block,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            return isExcluded(node, excluded)
              ? NodeFilter.FILTER_REJECT
              : NodeFilter.FILTER_ACCEPT;
          },
        }
      );

      let node: Text | null;
      while ((node = walker.nextNode() as Text | null) !== null) {
        if (node.nodeValue) {
          nodeMap.push({ node, startOffset: fullText.length });
          fullText += node.nodeValue;
        }
      }

      // Paragraph break
      fullText += '\n';
    });

    return { text: fullText.trimEnd(), nodeMap };
  }

  /**
   * Apply a fix via Google Docs REST API.
   * The actual HTTP call happens in the background service worker.
   * This adapter just builds the request payload.
   */
  buildFixRequest(
    documentId: string,
    startIndex: number,
    endIndex: number,
    replacement: string
  ): object {
    return {
      requests: [
        {
          deleteContentRange: {
            range: {
              startIndex,
              endIndex,
              segmentId: '',
            },
          },
        },
        {
          insertText: {
            location: {
              index: startIndex,
              segmentId: '',
            },
            text: replacement,
          },
        },
      ],
      documentId,
    };
  }

  /**
   * Extract the Google Docs document ID from the current URL.
   */
  getDocumentId(): string | null {
    const match = window.location.pathname.match(/\/document\/d\/([^/]+)/);
    return match?.[1] ?? null;
  }
}

function isExcluded(node: Node, excluded: Set<Node>): boolean {
  let current: Node | null = node;
  while (current) {
    if (excluded.has(current)) return true;
    current = current.parentNode;
  }
  return false;
}
