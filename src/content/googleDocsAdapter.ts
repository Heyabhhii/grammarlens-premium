/**
 * GrammarLens — Google Docs Adapter
 *
 * High-level coordinator for everything Google-Docs-specific in the
 * content script context. Manages:
 *
 *  - Document ID extraction from URL
 *  - Text extraction via googleDocsMapper (DOM-based)
 *  - Fix requests dispatched to background via APPLY_FIX_GDOCS message
 *  - Diagnostics data aggregation (auth status, doc ID, errors)
 *  - MutationObserver watching the Kix editor for content changes
 *
 * Not responsible for:
 *  - OAuth token management (background / googleAuth.ts)
 *  - Google Docs REST API calls  (background / googleDocsApi.ts)
 *  - Highlight rendering          (content / highlights.ts)
 *  - Navigation                   (content / navigation.ts)
 */

import { buildGDocsTextMap, extractGDocsText } from './googleDocsMapper.js';
import type { TextMap } from '../types/highlighting.js';
import type { MessageType } from '../types/index.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FixRequest {
  documentId:  string;
  ltOffset:    number;
  ltLength:    number;
  replacement: string;
  errorText:   string;
}

export interface DiagnosticsData {
  documentId:      string | null;
  isGoogleDocs:    boolean;
  authStatus:      'authenticated' | 'unauthenticated' | 'unknown';
  accountEmail:    string | null;
  lastApiError:    string | null;
  lastCheckMs:     number | null;
  suggestionCount: number;
  truncatedWarning: boolean;
  charCount:        number | null;
}

// ─── GoogleDocsAdapter ────────────────────────────────────────────────────────

export class GoogleDocsAdapter {
  private docId: string | null = null;
  private diagnostics: DiagnosticsData = {
    documentId:      null,
    isGoogleDocs:    false,
    authStatus:      'unknown',
    accountEmail:    null,
    lastApiError:    null,
    lastCheckMs:     null,
    suggestionCount:  0,
    truncatedWarning: false,
    charCount:        null,
  };

  private changeCallback: (() => void) | null = null;
  private mutationObserver: MutationObserver | null = null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  constructor() {
    this.docId = this.extractDocumentId();
    this.diagnostics.documentId   = this.docId;
    this.diagnostics.isGoogleDocs = this.isGoogleDocs();
  }

  /**
   * Start watching the Kix editor for content changes.
   * Calls the provided callback (debounced 1500 ms) when text changes.
   */
  observe(onContentChange: () => void): void {
    this.changeCallback = onContentChange;
    this.startMutationObserver();
  }

  /** Stop watching and clean up. */
  destroy(): void {
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
    this.changeCallback   = null;
  }

  // ── Document Identity ──────────────────────────────────────────────────────

  /** True when running inside a Google Docs document (not Slides/Sheets). */
  isGoogleDocs(): boolean {
    const { hostname, pathname } = window.location;
    return hostname === 'docs.google.com' && pathname.startsWith('/document/');
  }

  /**
   * Extract the Google Docs document ID from the current URL.
   * Returns null if the URL pattern doesn't match.
   */
  getDocumentId(): string | null {
    return this.docId;
  }

  // ── Text Extraction ────────────────────────────────────────────────────────

  /**
   * Build a full TextMap from the Kix editor DOM.
   * Returns both the flat text for LanguageTool and the NodeMap for highlights.
   */
  buildTextMap(): TextMap {
    return buildGDocsTextMap(document);
  }

  /**
   * Fast text-only extraction (no node map).
   * Used to check whether text has changed before scheduling a full check.
   */
  getPlainText(): string {
    return extractGDocsText(document);
  }

  // ── Fix Application ────────────────────────────────────────────────────────

  /**
   * Send a fix request to the background service worker.
   * The background resolves the LT offset to a Google Docs API index,
   * calls batchUpdate, then sends back a APPLY_FIX_RESULT message.
   */
  requestFix(req: FixRequest, onDone?: (error?: string) => void): void {
    chrome.runtime.sendMessage(
      {
        type:    'APPLY_FIX_GDOCS' as MessageType,
        payload: req,
      },
      (response: unknown) => {
        void chrome.runtime.lastError;
        const msg = response as { error?: string; payload?: { success?: boolean } } | undefined;
        const errMsg = msg?.error;
        if (errMsg) {
          this.diagnostics.lastApiError = errMsg;
        } else {
          this.diagnostics.lastApiError = null;
        }
        onDone?.(errMsg);
      }
    );
  }

  // ── Auth Status ────────────────────────────────────────────────────────────

  /**
   * Ask the background for current OAuth status and cache it in diagnostics.
   */
  refreshAuthStatus(): void {
    chrome.runtime.sendMessage(
      { type: 'GET_AUTH_TOKEN' as MessageType, payload: { interactive: false } },
      (response: unknown) => {
        void chrome.runtime.lastError;
        const msg = response as { payload?: { token?: string | null }; error?: string } | undefined;
        if (msg?.payload?.token) {
          this.diagnostics.authStatus = 'authenticated';
        } else {
          this.diagnostics.authStatus = 'unauthenticated';
        }
      }
    );
  }

  // ── Diagnostics ────────────────────────────────────────────────────────────

  updateDiagnostics(patch: Partial<DiagnosticsData>): void {
    Object.assign(this.diagnostics, patch);
  }

  getDiagnostics(): Readonly<DiagnosticsData> {
    return { ...this.diagnostics };
  }

  // ── Private: MutationObserver ──────────────────────────────────────────────

  private startMutationObserver(): void {
    if (this.mutationObserver) return;

    // Try multiple selectors — observe document.body as final fallback
    const kixRoot = document.querySelector<HTMLElement>(
      '.kix-appview-editor, .docs-editor, [role="main"]'
    ) ?? document.body;
    console.log('[GL:ADAPTER] MutationObserver on:', kixRoot.className?.slice(0, 60) ?? 'body');

    this.mutationObserver = new MutationObserver(() => {
      // Invoke callback immediately — debouncing is handled by the caller
      // (content/index.ts scheduleCheck uses its own 1500 ms timer).
      this.changeCallback?.();
    });

    this.mutationObserver.observe(kixRoot, {
      childList:     true,
      subtree:       true,
      characterData: true,
    });
  }

  // ── Private: URL Parsing ───────────────────────────────────────────────────

  private extractDocumentId(): string | null {
    const match = window.location.pathname.match(/\/document\/d\/([^/]+)/);
    return match?.[1] ?? null;
  }
}
