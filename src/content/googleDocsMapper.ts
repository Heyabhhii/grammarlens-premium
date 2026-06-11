/**
 * GrammarLens — Google Docs DOM Text Mapper
 *
 * Extracts plain text from the Google Docs Kix editor DOM and builds
 * a NodeMap for precise underline positioning (Phase 4 highlight engine).
 *
 * Scope rules
 * ───────────
 * SCAN:  .kix-page-content-block  — main editable document body
 * SKIP:  .docs-toc-sidebar        — document outline / ToC panel
 *        .docs-header-container   — title / toolbar area
 *        .kix-appview-editor > .docs-butterbar-container — notification bars
 *        [aria-label="Document outline"]
 *        .kix-footnote-container  — footnotes (separate from body)
 *        .kix-comment-overlay-container — comment sidepanel
 *        .kix-suggestionscontainer — suggested edits panel
 *
 * Output
 * ──────
 * Returns a TextMap (identical interface to the generic textMapper.ts) so the
 * Phase 4 HighlightEngine can use it without modification.
 */

import type { TextMap, NodeMapEntry } from '../types/highlighting.js';

// ─── Google Docs Selectors ────────────────────────────────────────────────────

/** Root selector for scannable document body paragraphs.
 *  Listed in priority order — the first one that matches is used.
 *  Google updates CSS class names; keeping multiple fallbacks is essential. */
// NOTE: [contenteditable="true"] is intentionally EXCLUDED — it matches the
// Gemini AI prompt box, not the document. We use only specific Kix selectors.
const BODY_SELECTORS = [
  '.kix-page-content-block',      // classic Kix page renderer
  '.kix-paragraphrenderer',       // paragraph-level renderer
  '.kix-canvas-tile-content',     // canvas tile content
  '.kix-page-content',            // alternate page content class
  '.docs-editor-area',            // some GDocs versions
];
const BODY_SELECTOR = BODY_SELECTORS.join(', ');

/** Subtrees that must be excluded from scanning */
const EXCLUDE_SELECTOR = [
  '.docs-toc-sidebar',
  '.docs-header-container',
  '[aria-label="Document outline"]',
  '[data-doc-outline]',
  '.kix-footnote-container',
  '.kix-comment-overlay-container',
  '.kix-suggestionscontainer',
  '.kix-surface-comments-overlay-content',
  '#grammarlens-root',
  '#gl-highlights-root',
  '#gl-flash-style',
].join(', ');

/** HTML tags to skip entirely (text inside these is not part of body content) */
const SKIP_TAGS = new Set<string>([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'CANVAS', 'SVG', 'IFRAME',
]);

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a TextMap from the current Google Docs editor state.
 * Equivalent to buildTextMap() in textMapper.ts but Google-Docs-specific.
 */
export function buildGDocsTextMap(doc: Document = document): TextMap {
  const allMatches = doc.querySelectorAll<HTMLElement>(BODY_SELECTOR);
  console.log('[GL:MAPPER] BODY_SELECTOR found', allMatches.length, 'elements:',
    Array.from(allMatches).map(el => el.tagName + '.' + el.className.split(' ')[0]).join(', ').slice(0, 200));

  const bodyBlocks = Array.from(allMatches).filter((el) => !isExcluded(el, doc));
  console.log('[GL:MAPPER] After exclusion filter:', bodyBlocks.length, 'blocks');

  if (bodyBlocks.length === 0) {
    // Deep DOM inspection to find the actual document structure
    const kix = doc.querySelector('.kix-appview-editor');
    if (kix) {
      // Print all descendants with kix- or docs- classes up to 4 levels deep
      const interesting: string[] = [];
      const walk = (el: Element, depth: number): void => {
        if (depth > 4) return;
        const cls = el.className?.toString() ?? '';
        if (cls.includes('kix-') || cls.includes('docs-')) {
          interesting.push(`${'  '.repeat(depth)}${el.tagName}.${cls.split(' ')[0]}`);
        }
        Array.from(el.children).slice(0, 8).forEach(c => walk(c, depth + 1));
      };
      walk(kix, 0);
      console.log('[GL:MAPPER] kix-appview-editor structure:\n' + interesting.slice(0, 30).join('\n'));
    }

    // Walk ALL text nodes inside kix editor to confirm canvas rendering
    const kixEl = doc.querySelector('.kix-appview-editor');
    if (kixEl) {
      const tw = doc.createTreeWalker(kixEl, NodeFilter.SHOW_TEXT);
      const textSamples: string[] = [];
      let n: Text | null;
      while ((n = tw.nextNode() as Text | null) !== null && textSamples.length < 5) {
        const v = n.nodeValue?.trim() ?? '';
        if (v.length > 2) textSamples.push(v.slice(0, 40));
      }
      console.log('[GL:MAPPER] Text nodes inside kix-appview-editor:', textSamples.length,
        textSamples.length ? textSamples : '(none — canvas rendering mode confirmed)');
    }

    return { text: '', nodeMap: [], editableRoots: [] };
  }

  const nodeMap: NodeMapEntry[] = [];
  const parts:   string[]       = [];
  let   cursor = 0;

  bodyBlocks.forEach((block, i) => {
    // Paragraph break between blocks
    if (i > 0) {
      parts.push('\n');
      cursor += 1;
    }

    cursor = walkBlock(block, nodeMap, parts, cursor, doc);
  });

  return {
    text:          parts.join(''),
    nodeMap,
    editableRoots: bodyBlocks,
  };
}

/**
 * Extract just the plain text from Google Docs (no node map).
 * Slightly faster than buildGDocsTextMap when highlight positions aren't needed.
 */
export function extractGDocsText(doc: Document = document): string {
  const bodyBlocks = Array.from(
    doc.querySelectorAll<HTMLElement>(BODY_SELECTOR)
  ).filter((el) => !isExcluded(el, doc));

  return bodyBlocks
    .map((block) => (block as HTMLElement).innerText.trim())
    .join('\n')
    .slice(0, 100_000);
}

// ─── Private: DOM Walker ──────────────────────────────────────────────────────

function walkBlock(
  block:   HTMLElement,
  nodeMap: NodeMapEntry[],
  parts:   string[],
  cursor:  number,
  doc:     Document
): number {
  // Pre-compute excluded subtrees within this block for FILTER_REJECT efficiency
  const excluded = new Set<Node>(
    Array.from(block.querySelectorAll(EXCLUDE_SELECTOR))
  );

  const walker = doc.createTreeWalker(
    block,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(node: Node): number {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          if (excluded.has(el))         return NodeFilter.FILTER_REJECT;
          if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
          if (el.hidden || el.style.display === 'none') return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_SKIP;
        }

        if (node.nodeType === Node.TEXT_NODE) {
          const val = (node as Text).nodeValue ?? '';
          if (val.length === 0) return NodeFilter.FILTER_SKIP;
          return NodeFilter.FILTER_ACCEPT;
        }

        return NodeFilter.FILTER_SKIP;
      },
    }
  );

  let node: Node | null = walker.nextNode();
  while (node !== null) {
    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text;
      const val      = textNode.nodeValue ?? '';
      if (val.length > 0) {
        parts.push(val);
        nodeMap.push({
          node:       textNode,
          nodeStart:  cursor,
          nodeLength: val.length,
        });
        cursor += val.length;
      }
    }
    node = walker.nextNode();
  }

  return cursor;
}

// ─── Private: Exclusion Check ─────────────────────────────────────────────────

function isExcluded(el: Element, doc: Document): boolean {
  // closest() is the most reliable ancestor check
  if (el.closest(EXCLUDE_SELECTOR)) return true;
  // Also exclude elements that are not actually inside the document body
  if (!doc.body.contains(el)) return true;
  return false;
}


// ─── Canonical Text Alignment ────────────────────────────────────────────────

/**
 * Given the canonical flat text produced by the Google Docs REST API
 * (`buildIndexMap().flatText`) and a DOM-based TextMap, return a new
 * NodeMapEntry[] whose `nodeStart` values are expressed as offsets into
 * `canonicalText` rather than into the DOM flat text.
 *
 * In practice the two texts are nearly identical — the only systematic
 * difference is that the API embeds paragraph-end `\n` marks *inside*
 * each textRun (so they appear at every block boundary), while the DOM
 * mapper inserts `\n` *between* blocks.  For standard documents these
 * produce the same character sequence, so the mapping is an identity.
 *
 * The algorithm runs a single O(n) pass over both strings, skipping
 * unmatched `\n` characters in either source.  This is robust against
 * any trailing paragraph marks or minor whitespace divergence.
 *
 * @param canonicalText  Flat text from `GoogleDocsApi.buildIndexMap().flatText`
 * @param textMap        DOM TextMap from `buildGDocsTextMap()`
 */
export function alignCanonicalToDOM(
  canonicalText: string,
  textMap:       TextMap
): NodeMapEntry[] {
  const domText = textMap.text;

  // Fast path: if texts are identical no remapping is needed.
  if (canonicalText === domText) return textMap.nodeMap;

  const posMap = buildPositionMapping(domText, canonicalText);

  return textMap.nodeMap.map((entry) => ({
    node:       entry.node,
    nodeStart:  posMap.get(entry.nodeStart) ?? entry.nodeStart,
    nodeLength: entry.nodeLength,
  }));
}

/**
 * Build a Map<domPos, canonicalPos> by walking both strings simultaneously.
 * Unmatched `\n` characters in either string are silently consumed so they
 * never derail the alignment of real content characters.
 */
function buildPositionMapping(
  domText:       string,
  canonicalText: string
): Map<number, number> {
  const map = new Map<number, number>();
  let d = 0;
  let c = 0;

  while (d < domText.length && c < canonicalText.length) {
    const dc = domText[d];
    const cc = canonicalText[c];

    if (dc === cc) {
      // Characters agree — record mapping and advance both
      map.set(d, c);
      d++;
      c++;
    } else if (cc === '\n') {
      // Canonical has an extra newline (paragraph-end mark) — skip it
      c++;
    } else if (dc === '\n') {
      // DOM has an extra newline (virtual separator) — skip it
      map.set(d, c);
      d++;
    } else {
      // Non-newline mismatch (should not occur in normal documents).
      // Force-advance both to avoid an infinite loop.
      map.set(d, c);
      d++;
      c++;
    }
  }

  // Any remaining DOM characters map to the current canonical position.
  while (d < domText.length) {
    map.set(d, c);
    d++;
  }

  return map;
}
