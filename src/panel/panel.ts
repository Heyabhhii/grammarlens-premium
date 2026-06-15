/**
 * GrammarLens — SidebarPanel
 *
 * Manages the full Grammarly-style UI injected into the page via Shadow DOM.
 * Self-contained: FAB + sliding sidebar, all isolated from page styles.
 *
 * Architecture
 *  ┌── document.body
 *  └── #grammarlens-root  (pointer-events:none host)
 *       └── ShadowRoot
 *            ├── <style>   (panel.css injected at runtime)
 *            ├── .gl-fab   (floating action button)
 *            └── .gl-sidebar
 *                 ├── .gl-resize-handle
 *                 ├── .gl-header  (draggable)
 *                 ├── .gl-tabs
 *                 ├── .gl-body    (dynamic content)
 *                 └── .gl-footer
 */

import panelCSS  from './panel.css';
import { bestReplacement } from '../utils/bestReplacement.js';
import type { AuthStatus } from '../services/googleAuth.js';
import panelHTML from './panel.html';
import { createSuggestionCard } from '../components/SuggestionCard.js';
import { LanguageSelector }     from '../components/LanguageSelector.js';
import type { ProcessedSuggestion, SuggestionCategory, SupportedLanguage } from '../types/grammar.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type PanelState = 'idle' | 'loading' | 'ready' | 'error';
type ActiveTab  = SuggestionCategory | 'all';

// ─── SidebarPanel ─────────────────────────────────────────────────────────────

export class SidebarPanel {
  // DOM
  private readonly host:   HTMLElement;
  private readonly shadow: ShadowRoot;

  // Shadow DOM elements (queried after HTML injection)
  private fab!:          HTMLButtonElement;
  private sidebar!:      HTMLElement;
  private fabBadge!:     HTMLElement;
  private countBadge!:   HTMLElement;
  private headerEl!:     HTMLElement;
  private subtitleEl!:   HTMLElement;
  private spinnerSlot!:  HTMLElement;
  private closeBtn!:     HTMLButtonElement;
  private tabs!:         NodeListOf<HTMLButtonElement>;
  private bodyEl!:       HTMLElement;
  private langRow!:      HTMLElement;
  private resizeHandle!: HTMLElement;

  // State
  private allSuggestions: ProcessedSuggestion[] = [];
  private activeTab: ActiveTab = 'all';
  private panelState: PanelState = 'idle';
  private errorMsg  = '';
  private panelOpen = false;
  private navigationHandler: ((id: string) => void) | null = null;
  private fixHandler: ((id: string, replacement: string) => void) | null = null;
  private bulkFixHandler: ((fixes: Array<{id: string; replacement: string}>) => void) | null = null;

  // Dismissed fingerprints — persisted to storage so dismissals survive rechecks
  private dismissedFingerprints: Set<string> = new Set();
  private static readonly DISMISSED_KEY = 'gl_dismissed_fingerprints';

  // Drag state
  private isDragging   = false;
  private dragStartY   = 0;
  private dragStartTop = 0;
  private currentTop   = 0;

  // Resize state
  private isResizing      = false;
  private resizeStartX    = 0;
  private resizeStartWidth = 380;
  private currentWidth    = 380;

  // Sub-components
  private readonly langSelector: LanguageSelector;

  // Diagnostics (nullable — only present when panel.html includes the section)
  private diagToggle:   HTMLButtonElement | null = null;
  private diagBody:     HTMLElement       | null = null;
  private diagAuth:     HTMLElement       | null = null;
  private diagAccount:  HTMLElement       | null = null;
  private diagDocId:    HTMLElement       | null = null;
  private diagError:    HTMLElement       | null = null;
  private diagErrorRow: HTMLElement       | null = null;
  private diagSignIn:   HTMLButtonElement | null = null;

  // ── Constructor ────────────────────────────────────────────────────────────

  constructor() {
    // Invisible zero-size host — all content lives in Shadow DOM
    this.host = document.createElement('div');
    this.host.id = 'grammarlens-root';
    this.host.style.cssText =
      'all:initial;position:fixed;top:0;left:0;width:0;height:0;' +
      'z-index:2147483646;pointer-events:none;';

    this.shadow = this.host.attachShadow({ mode: 'open' });

    // Inject styles
    const styleEl = document.createElement('style');
    styleEl.textContent = panelCSS;
    this.shadow.appendChild(styleEl);

    // Inject template
    const wrapper = document.createElement('div');
    wrapper.innerHTML = panelHTML;
    this.shadow.appendChild(wrapper);

    // Query DOM references
    this.queryElements();

    // Language selector
    this.langSelector = new LanguageSelector((_lang: SupportedLanguage) => {
      this.handleLanguageChange();
    });

    // Bind all event listeners
    this.bindEvents();

    // Load persisted dismissed fingerprints
    void chrome.storage.local.get(SidebarPanel.DISMISSED_KEY).then((data) => {
      const stored = data[SidebarPanel.DISMISSED_KEY];
      if (Array.isArray(stored)) {
        this.dismissedFingerprints = new Set(stored as string[]);
      }
    });
  }

  // ── Public: Lifecycle ──────────────────────────────────────────────────────

  /** Append the Shadow DOM host to the page. Call once from the content script. */
  mount(): void {
    if (document.getElementById('grammarlens-root')) return;
    const appendTarget = document.body ?? document.documentElement;
    appendTarget.appendChild(this.host);
    this.langSelector.renderInto(this.langRow);
  }

  /** Remove the panel from the page entirely. */
  destroy(): void {
    this.host.remove();
  }

  // ── Public: Visibility ─────────────────────────────────────────────────────

  open(): void {
    if (this.panelOpen) return;
    this.panelOpen = true;
    this.sidebar.classList.add('gl-sidebar--open');
    this.fab.setAttribute('aria-expanded', 'true');
    this.sidebar.setAttribute('aria-hidden', 'false');
  }

  close(): void {
    if (!this.panelOpen) return;
    this.panelOpen = false;
    this.sidebar.classList.remove('gl-sidebar--open');
    this.fab.setAttribute('aria-expanded', 'false');
    this.sidebar.setAttribute('aria-hidden', 'true');
  }

  toggle(): void {
    if (this.panelOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  isVisible(): boolean {
    return this.panelOpen;
  }

  // ── Public: State Updates ──────────────────────────────────────────────────

  setSuggestions(suggestions: ProcessedSuggestion[]): void {
    // Filter out anything the user has already dismissed
    this.allSuggestions = suggestions.filter(
      s => !this.dismissedFingerprints.has(this.fingerprintOf(s))
    );
    this.panelState = 'ready';
    this.errorMsg   = '';
    this.updateBadge(this.activeSuggestionCount());
    this.renderBody();
  }

  private fingerprintOf(s: ProcessedSuggestion): string {
    return `${s.ruleId}:${s.errorText.toLowerCase()}`;
  }

  setLoading(loading: boolean): void {
    if (loading) {
      this.panelState = 'loading';
      this.spinnerSlot.style.display = 'block';
      this.subtitleEl.textContent = 'Checking…';
    } else {
      this.spinnerSlot.style.display = 'none';
      this.subtitleEl.textContent = 'Review suggestions';
      if (this.panelState === 'loading') this.panelState = 'idle';
    }
    if (loading) this.renderBody();
  }

  setError(message: string): void {
    this.panelState = 'error';
    this.errorMsg   = message;
    this.spinnerSlot.style.display = 'none';
    this.subtitleEl.textContent = 'Review suggestions';
    this.renderBody();
  }

  clearError(): void {
    if (this.panelState === 'error') {
      this.panelState = 'idle';
      this.renderBody();
    }
  }

  /**
   * Register a callback invoked whenever a suggestion card is clicked/expanded.
   * NavigationManager calls this to wire card clicks → jump-to-error.
   */
  setNavigationHandler(fn: (id: string) => void): void {
    this.navigationHandler = fn;
  }

  /**
   * Register a callback invoked when a Fix button is clicked.
   * content/index.ts passes this so the panel can trigger adapter.requestFix()
   * with the full suggestion payload (offset, length, replacement).
   */
  setFixHandler(fn: (id: string, replacement: string) => void): void {
    this.fixHandler = fn;
  }

  /** Register handler for bulk fix operations (Fix Grammar / Fix Spelling). */
  setBulkFixHandler(fn: (fixes: Array<{id: string; replacement: string}>) => void): void {
    this.bulkFixHandler = fn;
  }

  /**
   * Show a brief toast notification inside the sidebar.
   * @param message  Text to display
   * @param type     'success' (green) | 'error' (red)
   */
  showToast(message: string, type: 'success' | 'error' = 'success'): void {
    const existing = this.shadow.querySelector('.gl-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `gl-toast gl-toast--${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    // Append to the sidebar (not shadow root directly, so CSS applies)
    const sidebar = this.shadow.querySelector<HTMLElement>('#gl-sidebar');
    if (sidebar) {
      sidebar.appendChild(toast);
      // Trigger fade-in
      requestAnimationFrame(() => toast.classList.add('gl-toast--visible'));
      setTimeout(() => {
        toast.classList.remove('gl-toast--visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
      }, 2800);
    }
  }

  /**
   * Programmatically expand and scroll to a suggestion card in the sidebar.
   * Called by NavigationManager after focusing the in-document error.
   */
  focusCard(id: string): void {
    const card = this.shadow.querySelector<HTMLElement>(`[data-suggestion-id="${id}"]`);
    if (!card) return;

    // Expand the card if it is currently collapsed
    if (!card.classList.contains('gl-card--expanded')) {
      card.querySelector<HTMLElement>('.gl-card-header')?.click();
    }

    // Scroll the card into view within the sidebar's scrollable body
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  updateBadge(count: number): void {
    const s = String(count);
    this.fabBadge.textContent   = s;
    this.countBadge.textContent = s;
    this.fabBadge.dataset['count'] = s;
  }

  /**
   * Update the diagnostics section with current OAuth status, account, and doc ID.
   * Called by content/index.ts after auth state changes.
   */
  updateDiagnostics(
    status:      AuthStatus,
    docId:       string | null,
    lastError:   string | null,
    sizeWarning: string | null = null
  ): void {
    if (!this.diagAuth) return; // diagnostics section not present

    // Auth status dot + text
    if (status.isAuthenticated) {
      this.diagAuth.innerHTML =
        '<span class="gl-diag-dot gl-diag-dot--ok"></span> Connected';
    } else {
      this.diagAuth.innerHTML =
        '<span class="gl-diag-dot gl-diag-dot--error"></span> Not signed in';
    }

    // Account email
    if (this.diagAccount) {
      this.diagAccount.textContent = status.account?.email ?? '—';
    }

    // Document ID (truncated)
    if (this.diagDocId && docId) {
      this.diagDocId.textContent = docId.length > 20 ? docId.slice(0, 18) + '…' : docId;
      this.diagDocId.title       = docId;
    }

    // Error row
    if (this.diagErrorRow && this.diagError) {
      if (lastError) {
        this.diagErrorRow.style.display = '';
        this.diagError.textContent      = lastError;
      } else {
        this.diagErrorRow.style.display = 'none';
      }
    }

    // Sign-in button visibility
    if (this.diagSignIn) {
      this.diagSignIn.style.display = status.isAuthenticated ? 'none' : 'block';
    }

    // Size warning row (overrides other error display if set)
    if (sizeWarning && this.diagErrorRow && this.diagError) {
      this.diagErrorRow.style.display = '';
      this.diagError.textContent      = sizeWarning;
    }
  }

  // ── Private: DOM Queries ───────────────────────────────────────────────────

  private queryElements(): void {
    const q = <T extends HTMLElement>(sel: string): T => {
      const el = this.shadow.querySelector<T>(sel);
      if (!el) throw new Error(`GrammarLens: missing element "${sel}"`);
      return el;
    };

    this.fab         = q<HTMLButtonElement>('#gl-fab');
    this.sidebar     = q<HTMLElement>('#gl-sidebar');
    this.fabBadge    = q<HTMLElement>('#gl-fab-badge');
    this.countBadge  = q<HTMLElement>('#gl-count-badge');
    this.headerEl    = q<HTMLElement>('#gl-header');
    this.subtitleEl  = q<HTMLElement>('#gl-header-subtitle');
    this.spinnerSlot = q<HTMLElement>('#gl-spinner-slot');
    this.closeBtn    = q<HTMLButtonElement>('#gl-close-btn');
    this.bodyEl      = q<HTMLElement>('#gl-body');
    this.langRow     = q<HTMLElement>('#gl-lang-row');
    this.resizeHandle = q<HTMLElement>('#gl-resize-handle');

    // Diagnostics — optional (panel.html may not include them in all builds)
    this.diagToggle  = this.shadow.querySelector<HTMLButtonElement>('#gl-diag-toggle');
    this.diagBody    = this.shadow.querySelector<HTMLElement>('#gl-diag-body');
    this.diagAuth    = this.shadow.querySelector<HTMLElement>('#gl-diag-auth');
    this.diagAccount = this.shadow.querySelector<HTMLElement>('#gl-diag-account');
    this.diagDocId   = this.shadow.querySelector<HTMLElement>('#gl-diag-docid');
    this.diagError   = this.shadow.querySelector<HTMLElement>('#gl-diag-error');
    this.diagErrorRow = this.shadow.querySelector<HTMLElement>('#gl-diag-error-row');
    this.diagSignIn  = this.shadow.querySelector<HTMLButtonElement>('#gl-diag-signin');
    this.tabs        = this.shadow.querySelectorAll<HTMLButtonElement>('.gl-tab');
  }

  // ── Private: Event Binding ─────────────────────────────────────────────────

  private bindEvents(): void {
    // FAB click
    this.fab.addEventListener('click', () => this.toggle());

    // Close button
    this.closeBtn.addEventListener('click', () => this.close());

    // Tab clicks
    this.tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const tabValue = tab.dataset['tab'] as ActiveTab | undefined;
        if (tabValue) this.setActiveTab(tabValue);
      });
    });

    // Bulk action buttons
    this.bindBulkButtons();

    // Drag (move sidebar vertically)
    this.headerEl.addEventListener('mousedown', (e) => this.onDragStart(e));

    // Resize (change sidebar width)
    this.resizeHandle.addEventListener('mousedown', (e) => this.onResizeStart(e));

    // Document-level mouse tracking
    document.addEventListener('mousemove', (e) => {
      if (this.isDragging)  this.onDragMove(e);
      if (this.isResizing)  this.onResizeMove(e);
    });

    document.addEventListener('mouseup', () => {
      this.isDragging  = false;
      this.isResizing  = false;
      this.sidebar.classList.remove('gl-sidebar--resizing');
    });

    // Diagnostics toggle
    this.bindDiagnostics();

    // Keyboard shortcuts handled externally (content script) via messages
  }

  private bindDiagnostics(): void {
    if (!this.diagToggle || !this.diagBody) return;

    this.diagToggle.addEventListener('click', () => {
      const isExpanded = this.diagToggle!.getAttribute('aria-expanded') === 'true';
      this.diagToggle!.setAttribute('aria-expanded', String(!isExpanded));
      this.diagBody!.setAttribute('aria-hidden',     String(isExpanded));
    });

    this.diagSignIn?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'GET_AUTH_TOKEN', payload: { interactive: true } });
    });
  }

  private bindBulkButtons(): void {
    const get = (id: string): HTMLButtonElement | null =>
      this.shadow.querySelector<HTMLButtonElement>(`#${id}`);

    get('gl-btn-fix-grammar')?.addEventListener('click', () => {
      this.handleBulkFix('grammar');
    });

    get('gl-btn-fix-spelling')?.addEventListener('click', () => {
      this.handleBulkFix('spelling');
    });

    get('gl-btn-dismiss-all')?.addEventListener('click', () => {
      this.allSuggestions = [];
      this.updateBadge(0);
      this.renderBody();
    });

    get('gl-btn-recheck')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'RECHECK_DOC' });
    });
  }

  // ── Private: Tab Management ────────────────────────────────────────────────

  private setActiveTab(tab: ActiveTab): void {
    this.activeTab = tab;

    this.tabs.forEach((t) => {
      const isActive = t.dataset['tab'] === tab;
      t.classList.toggle('gl-tab--active', isActive);
      t.setAttribute('aria-selected', String(isActive));
      t.tabIndex = isActive ? 0 : -1;
    });

    this.renderBody();
  }

  private filteredSuggestions(): ProcessedSuggestion[] {
    if (this.activeTab === 'all') return this.allSuggestions;
    return this.allSuggestions.filter((s) => s.category === this.activeTab);
  }

  // ── Private: Body Rendering ────────────────────────────────────────────────

  private renderBody(): void {
    // Clear existing content
    this.bodyEl.innerHTML = '';

    switch (this.panelState) {
      case 'loading':
        this.bodyEl.appendChild(this.renderLoading());
        break;

      case 'error':
        this.bodyEl.appendChild(this.renderError());
        break;

      case 'ready': {
        const visible = this.filteredSuggestions().filter(
          (s) => s.status !== 'dismissed' && s.status !== 'ignored'
        );
        if (visible.length === 0) {
          this.bodyEl.appendChild(this.renderEmpty());
        } else {
          this.bodyEl.appendChild(this.renderList(visible));
        }
        break;
      }

      default:
        this.bodyEl.appendChild(this.renderIdle());
        break;
    }
  }

  private renderLoading(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'gl-loading';

    for (let i = 0; i < 4; i++) {
      container.appendChild(this.skeletonCard());
    }

    return container;
  }

  private skeletonCard(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'gl-skeleton-card';
    card.setAttribute('aria-hidden', 'true');
    card.innerHTML = `
      <div class="gl-skeleton gl-skeleton-dot"></div>
      <div class="gl-skeleton-body">
        <div class="gl-skeleton gl-skeleton-line gl-skeleton-line--title"></div>
        <div class="gl-skeleton gl-skeleton-line gl-skeleton-line--short"></div>
      </div>`;
    return card;
  }

  private renderEmpty(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'gl-empty-state';
    el.setAttribute('role', 'status');
    el.innerHTML = `
      <div class="gl-empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div class="gl-empty-title">Looks great!</div>
      <div class="gl-empty-subtitle">
        No writing suggestions found${this.activeTab !== 'all' ? ` for <strong>${this.activeTab}</strong>` : ''}.
        Your writing is clear and correct.
      </div>`;
    return el;
  }

  private renderError(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'gl-error-state';
    el.setAttribute('role', 'alert');

    const retryBtn = document.createElement('button');
    retryBtn.className = 'gl-retry-btn';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', () => {
      this.clearError();
      chrome.runtime.sendMessage({ type: 'RECHECK_DOC' });
    });

    el.innerHTML = `
      <div class="gl-error-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <div class="gl-error-title">Check failed</div>
      <div class="gl-error-message">${this.escapeHtml(this.errorMsg)}</div>`;

    el.appendChild(retryBtn);
    return el;
  }

  private renderIdle(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'gl-empty-state';
    el.setAttribute('role', 'status');
    el.innerHTML = `
      <div class="gl-empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      </div>
      <div class="gl-empty-title">Ready to check</div>
      <div class="gl-empty-subtitle">Start typing — GrammarLens will check your writing automatically.</div>`;
    return el;
  }

  private renderList(suggestions: ProcessedSuggestion[]): HTMLElement {
    const list = document.createElement('div');
    list.className = 'gl-suggestion-list';
    list.setAttribute('role', 'list');

    suggestions.forEach((s) => {
      const card = createSuggestionCard(s, {
        onFix: (id, replacement) => this.handleFix(id, replacement),
        onDismiss: (id) => this.handleDismiss(id),
        onExpand: (id) => this.handleExpand(id),
      });
      card.setAttribute('role', 'listitem');
      list.appendChild(card);
    });

    return list;
  }

  // ── Private: Suggestion Actions ────────────────────────────────────────────

  private handleFix(id: string, replacement: string): void {
    // Delegate to the content script's fix handler (which calls adapter.requestFix)
    if (this.fixHandler) {
      this.fixHandler(id, replacement);
    }

    // Optimistically mark as fixed in UI
    const suggestion = this.allSuggestions.find((s) => s.id === id);
    if (suggestion) {
      suggestion.status = 'fixed';
      this.updateBadge(this.activeSuggestionCount());
      this.renderBody();
    }
  }

  private handleDismiss(id: string): void {
    const suggestion = this.allSuggestions.find((s) => s.id === id);
    if (suggestion) {
      // Persist fingerprint so it survives rechecks
      const fp = this.fingerprintOf(suggestion);
      this.dismissedFingerprints.add(fp);
      void chrome.storage.local.set({
        [SidebarPanel.DISMISSED_KEY]: [...this.dismissedFingerprints],
      });

      suggestion.status = 'dismissed';
      this.updateBadge(this.activeSuggestionCount());
      this.renderBody();
    }
  }

  private handleExpand(id: string): void {
    const suggestion = this.allSuggestions.find((s) => s.id === id);
    if (suggestion && suggestion.status === 'new') {
      suggestion.status = 'reviewed';
    }
    // Notify NavigationManager so it can scroll + flash the in-document error
    if (this.navigationHandler) this.navigationHandler(id);
  }

  private handleBulkFix(type: 'grammar' | 'spelling'): void {
    const targets = this.allSuggestions.filter((s) => {
      if (s.status === 'fixed' || s.status === 'dismissed' || s.status === 'ignored') return false;

      if (type === 'spelling') {
        // Pure spelling mistakes only (not confused-words, which go to grammar)
        return s.issueType === 'misspelling' && s.ltCategoryId !== 'CONFUSED_WORDS';
      }

      // Grammar: structural errors + confused-word substitutions (Their→They're etc.)
      // LanguageTool classifies confused words as issueType='misspelling' category='CONFUSED_WORDS'
      // but they are semantically grammar errors, so Fix Grammar must include them.
      //
      // Also include contraction fixes (Its→It's) which LT puts in 'TYPOS' not 'CONFUSED_WORDS'.
      // Detection: the best replacement introduces an apostrophe the original didn't have.
      // bestReplacement() already filters bad candidates (e.g. returns "This" not "The's" for "Ths"),
      // so this condition is safe against accidental contraction false-positives.
      const isMisspelling = s.issueType === 'misspelling';
      const isContractionFix = isMisspelling &&
        s.ltCategoryId === 'TYPOS' &&
        !s.errorText.includes("'") &&
        bestReplacement(s.errorText, s.replacements).includes("'");

      return s.issueType === 'grammar'       ||
             s.issueType === 'typographical' ||
             s.issueType === 'whitespace'    ||
             s.issueType === 'uncategorized' ||
             (isMisspelling && s.ltCategoryId === 'CONFUSED_WORDS') ||
             isContractionFix;
    });

    const fixes = targets
      .map(s => ({
        id:          s.id,
        replacement: bestReplacement(s.errorText, s.replacements),
      }))
      .filter(f => f.replacement.length > 0);

    if (fixes.length === 0) {
      this.showToast(`No ${type} errors found to fix`, 'success');
      return;
    }

    // Optimistically mark all targets as fixed in the UI
    fixes.forEach(f => {
      const s = this.allSuggestions.find(x => x.id === f.id);
      if (s) s.status = 'fixed';
    });
    this.updateBadge(this.activeSuggestionCount());
    this.renderBody();
    this.showToast(`Fixing ${fixes.length} ${type} issue${fixes.length > 1 ? 's' : ''}…`, 'success');

    if (this.bulkFixHandler) {
      this.bulkFixHandler(fixes);
    } else {
      // Fallback: call individual fix handler for each
      fixes.forEach(f => this.fixHandler?.(f.id, f.replacement));
    }
  }

  private handleLanguageChange(): void {
    // Re-trigger grammar check on language switch
    chrome.runtime.sendMessage(
      { type: 'RECHECK_DOC' },
      () => { void chrome.runtime.lastError; }
    );
  }

  private activeSuggestionCount(): number {
    return this.allSuggestions.filter(
      (s) => s.status !== 'fixed' && s.status !== 'dismissed' && s.status !== 'ignored'
    ).length;
  }

  // ── Private: Drag (vertical repositioning) ─────────────────────────────────

  private onDragStart(e: MouseEvent): void {
    if ((e.target as HTMLElement).closest('button')) return;
    this.isDragging   = true;
    this.dragStartY   = e.clientY;
    this.dragStartTop = this.currentTop;
    e.preventDefault();
  }

  private onDragMove(e: MouseEvent): void {
    const delta = e.clientY - this.dragStartY;
    const newTop = Math.max(0, Math.min(
      window.innerHeight - 120,
      this.dragStartTop + delta
    ));
    this.currentTop = newTop;
    this.sidebar.style.setProperty('--gl-sidebar-top', `${newTop}px`);
    this.sidebar.style.height = `${window.innerHeight - newTop}px`;
  }

  // ── Private: Resize (width) ────────────────────────�
  private onResizeStart(e: MouseEvent): void {
    this.isResizing       = true;
    this.resizeStartX     = e.clientX;
    this.resizeStartWidth = this.currentWidth;
    e.preventDefault();
  }

  private onResizeMove(e: MouseEvent): void {
    const delta    = this.resizeStartX - e.clientX;
    const newWidth = Math.max(280, Math.min(600, this.resizeStartWidth + delta));
    this.currentWidth = newWidth;
    this.sidebar.style.width = `${newWidth}px`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
