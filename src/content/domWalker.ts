/**
 * GrammarLens — DOM Walker
 *
 * Locates all editable content roots on the page and walks their text nodes,
 * carefully excluding GrammarLens own UI, navigation panels, hidden content,
 * and Google Docs structural elements that are not part of the document body.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** CSS selectors for subtrees that must never be scanned or highlighted */
const EXCLUDED_SUBTREE_SELECTORS = [
  '#grammarlens-root',      // GrammarLens Shadow DOM host
  '#gl-highlights-root',    // Highlight overlay container
  '.docs-toc-sidebar',      // Google Docs outline panel
  '[data-doc-outline]',     // Google Docs outline (alternate selector)
  '.docs-header-container', // Google Docs toolbar
  '.kix-appview-editor-container > .kix-scrollbar-outer',  // GDoc scrollbar
  'nav',                    // Navigation elements
  'header',                 // Page headers
  'footer',                 // Page footers
  '[role="navigation"]',    // ARIA navigation landmarks
  '[role="banner"]',        // ARIA banner (site header)
  '[role="complementary"]', // ARIA aside / sidebar
  '[aria-hidden="true"]',   // Screen-reader-hidden content
  '.linkedin-header',       // LinkedIn nav
  '.global-nav',            // LinkedIn global nav
  '.msg-overlay-container', // LinkedIn message overlay UI chrome
].join(', ');

/** HTML tag names whose content should never be scanned */
const SKIP_TAGS = new Set<string>([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME',
  'CANVAS', 'SVG', 'MATH', 'OBJECT', 'EMBED',
  'AUDIO', 'VIDEO', 'SELECT', 'OPTION',
]);

/** Selectors that identify editable content roots */
const EDITABLE_SELECTORS = [
  '[contenteditable="true"]',
  '[contenteditable=""]',
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Find all editable content roots on the page that GrammarLens should check.
 * Excludes GrammarLens' own UI and elements within excluded subtrees.
 */
export function getEditableRoots(doc: Document = document): HTMLElement[] {
  const results: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  EDITABLE_SELECTORS.forEach((sel) => {
    doc.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);

      if (isInExcludedSubtree(el)) return;
      if (!isElementVisible(el))   return;
      if (el.textContent === null || el.textContent.trim().length === 0) return;

      results.push(el);
    });
  });

  // Google Docs: the main editor uses a custom renderer. Add the content
  // block container if no contenteditable is found.
  if (results.length === 0) {
    doc.querySelectorAll<HTMLElement>('.kix-page-content-block').forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      if (isInExcludedSubtree(el) || !isElementVisible(el)) return;
      results.push(el);
    });
  }

  return results;
}

/**
 * Walk all non-empty Text nodes within a given root element.
 * Respects exclusions at the subtree level for efficiency.
 *
 * @param root          The editable root element to scan
 * @param extraExcludes Additional nodes to exclude (e.g. previously marked)
 */
export function walkTextNodes(
  root: HTMLElement,
  extraExcludes: ReadonlySet<Node> = new Set()
): Text[] {
  const results: Text[] = [];

  // Pre-compute excluded subtrees within this root for O(1) ancestor lookup
  const excludedRoots = buildExcludedSet(root, extraExcludes);

  const walker = document.createTreeWalker(
    root,
    // We need SHOW_ELEMENT to REJECT excluded subtrees, and SHOW_TEXT to collect text
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(node: Node): number {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;

          // Reject entire excluded subtrees — TreeWalker won't descend into REJECTED nodes
          if (excludedRoots.has(el))              return NodeFilter.FILTER_REJECT;
          if (SKIP_TAGS.has(el.tagName))          return NodeFilter.FILTER_REJECT;
          if (!isElementVisible(el))              return NodeFilter.FILTER_REJECT;

          // Element itself is not a text node we want — skip it but still descend
          return NodeFilter.FILTER_SKIP;
        }

        // Text node
        if (node.nodeType === Node.TEXT_NODE) {
          const text = (node as Text).nodeValue ?? '';
          if (text.length === 0) return NodeFilter.FILTER_SKIP;
          return NodeFilter.FILTER_ACCEPT;
        }

        return NodeFilter.FILTER_SKIP;
      },
    }
  );

  let node: Node | null = walker.nextNode();
  while (node !== null) {
    if (node.nodeType === Node.TEXT_NODE) {
      results.push(node as Text);
    }
    node = walker.nextNode();
  }

  return results;
}

/**
 * Check whether a DOM element is currently visible to the user.
 * Fast — does not trigger layout.
 */
export function isElementVisible(el: HTMLElement): boolean {
  if (el.hidden) return false;
  const style = el.style;
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  // offsetParent is null for display:none elements (not for visibility:hidden)
  // This catches computed styles, unlike inline style checks above
  if (el.offsetParent === null && el.tagName !== 'BODY') return false;
  return true;
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

/**
 * Return true if the given element is inside an excluded subtree
 * (e.g. GrammarLens UI, navigation panels, etc.).
 */
function isInExcludedSubtree(el: Element): boolean {
  // closest() walks up the ancestor chain — fast and readable
  return el.closest(EXCLUDED_SUBTREE_SELECTORS) !== null;
}

/**
 * Build the set of excluded elements within a root so TreeWalker can
 * REJECT entire subtrees in O(1) per node rather than walking ancestors.
 */
function buildExcludedSet(
  root: HTMLElement,
  extraExcludes: ReadonlySet<Node>
): Set<HTMLElement> {
  const excluded = new Set<HTMLElement>();

  root.querySelectorAll<HTMLElement>(EXCLUDED_SUBTREE_SELECTORS).forEach((el) => {
    excluded.add(el);
  });

  extraExcludes.forEach((node) => {
    if (node instanceof HTMLElement) excluded.add(node);
  });

  return excluded;
}
