/**
 * GrammarLens — Content Script (MVP Clean)
 *
 * Removed: HighlightEngine, NavigationManager, DOM text mappers.
 * Canvas-based Google Docs has no DOM text nodes — underlines are impossible.
 * Sidebar is the sole source of truth for suggestions.
 */

import './content.css';
import { SidebarPanel }      from '../panel/panel.js';
import { GoogleDocsAdapter } from './googleDocsAdapter.js';
import { loadSettings }      from '../utils/settingsStore.js';
import type { CheckResult, Message, MessageType } from '../types/index.js';
import type { SupportedLanguage, ProcessedSuggestion } from '../types/grammar.js';
import type { AuthStatus }   from '../services/googleAuth.js';

// ─── Guard ────────────────────────────────────────────────────────────────────

if (
  window.location.hostname !== 'docs.google.com' ||
  !window.location.pathname.startsWith('/document/')
) {
  throw new Error('[GrammarLens] Not a Google Docs document — aborting.');
}

// ─── Module State ─────────────────────────────────────────────────────────────

let panel:   SidebarPanel;
let adapter: GoogleDocsAdapter;

let initDocId:           string | null         = null;
let lastCanonicalText    = '';
let currentLanguage:     SupportedLanguage      = 'en-US';
let currentSuggestions:  ProcessedSuggestion[]  = [];

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let checkGeneration = 0;

const DEBOUNCE_MS = 1500;

// ─── Teardown / SPA navigation ────────────────────────────────────────────────

function teardown(): void {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  checkGeneration++;
  panel?.destroy();
  adapter?.destroy();
  lastCanonicalText  = '';
  currentSuggestions = [];
  initDocId          = null;
}

function maybeReinit(): void {
  const newDocId = extractDocumentId();
  if (!newDocId || !window.location.pathname.startsWith('/document/')) {
    if (initDocId !== null) teardown();
    return;
  }
  if (newDocId === initDocId) return;
  teardown();
  init(newDocId);
}

function watchNavigation(): void {
  const origPush = history.pushState.bind(history);
  history.pushState = function (d: unknown, u: string, url?: string | URL | null): void {
    origPush(d, u, url);
    setTimeout(maybeReinit, 0);
  };
  window.addEventListener('popstate', () => setTimeout(maybeReinit, 0));
}

function extractDocumentId(): string | null {
  return window.location.pathname.match(/\/document\/d\/([^/]+)/)?.[1] ?? null;
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

function init(docId: string): void {
  initDocId = docId;
  adapter   = new GoogleDocsAdapter();
  panel     = new SidebarPanel();

  panel.mount();

  // ── Single Fix ──────────────────────────────────────────────────────────────
  panel.setFixHandler((id: string, replacement: string) => {
    const dId = adapter.getDocumentId();
    if (!dId) return;
    const target = currentSuggestions.find(s => s.id === id) ?? null;
    if (!target) return;
    currentSuggestions = currentSuggestions.filter(s => s.id !== id);
    adapter.requestFix(
      { documentId: dId, ltOffset: target.offset, ltLength: target.length, replacement, errorText: target.errorText },
      (error) => {
        if (error) {
          panel.showToast(`Fix failed: ${error}`, 'error');
        } else {
          panel.showToast('✓ Fixed', 'success');
          setTimeout(() => { lastCanonicalText = ''; runCheck(); }, 1000);
        }
      }
    );
  });

  // ── Bulk Fix (Fix Grammar / Fix Spelling buttons) ────────────────────────
  panel.setBulkFixHandler((fixes) => {
    const dId = adapter.getDocumentId();
    if (!dId || fixes.length === 0) return;

    let completed = 0;
    let succeeded = 0;

    fixes.forEach(fix => {
      const target = currentSuggestions.find(s => s.id === fix.id);
      if (!target) { completed++; return; }
      currentSuggestions = currentSuggestions.filter(s => s.id !== fix.id);

      adapter.requestFix(
        { documentId: dId, ltOffset: target.offset, ltLength: target.length,
          replacement: fix.replacement, errorText: target.errorText },
        (error) => {
          completed++;
          if (!error) succeeded++;
          if (completed === fixes.length) {
            // All done — show summary toast and recheck
            if (succeeded === fixes.length) {
              panel.showToast(`✓ Fixed ${succeeded} issue${succeeded > 1 ? 's' : ''}`, 'success');
            } else {
              panel.showToast(`Fixed ${succeeded}/${fixes.length} — ${fixes.length - succeeded} failed`, 'error');
            }
            setTimeout(() => { lastCanonicalText = ''; runCheck(); }, 1000);
          }
        }
      );
    });
  });

  void loadSettings().then(settings => { currentLanguage = settings.language; });

  adapter.observe(scheduleCheck);

  waitForEditor(() => {
    refreshDiagnostics();
    scheduleCheck();
  });
}

// ─── Editor detection ─────────────────────────────────────────────────────────

function waitForEditor(cb: () => void, maxMs = 15000): void {
  const start = Date.now();
  const check = (): void => {
    if (document.querySelector('.kix-appview-editor, .docs-editor')) { cb(); return; }
    if (Date.now() - start > maxMs) { cb(); return; }
    setTimeout(check, 500);
  };
  check();
}

// ─── Grammar check ────────────────────────────────────────────────────────────

function scheduleCheck(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runCheck, DEBOUNCE_MS);
}

function runCheck(): void {
  const currentDocId = extractDocumentId();
  if (currentDocId !== initDocId) { maybeReinit(); return; }

  const docId = adapter.getDocumentId();
  if (!docId) return;

  const myGeneration = ++checkGeneration;
  panel.setLoading(true);

  chrome.runtime.sendMessage(
    {
      type:    'CHECK_GDOCS_DOCUMENT' as MessageType,
      payload: { documentId: docId, language: currentLanguage, domText: '' },
    },
    (response: unknown) => {
      if (myGeneration !== checkGeneration) return;
      if (chrome.runtime.lastError) { panel.setLoading(false); return; }

      const msg = response as Message;
      if (msg.error) {
        panel.setLoading(false);
        panel.setError(msg.error);
        return;
      }

      const result = msg.payload as CheckResult & {
        flatText?:    string;
        charCount?:   number;
        truncated?:   boolean;
        hasIndexMap?: boolean;
      };

      const canonicalText = result.flatText ?? '';
      if (canonicalText && canonicalText === lastCanonicalText &&
          result.suggestions.length === 0) {
        panel.setLoading(false);
        return;
      }
      if (canonicalText) lastCanonicalText = canonicalText;

      currentSuggestions = result.suggestions;

      panel.setLoading(false);
      panel.setSuggestions(result.suggestions);

      if (!(result.hasIndexMap ?? false)) {
        panel.updateDiagnostics(
          { isAuthenticated: false, token: null, account: null, error: null },
          docId,
          'Sign in to enable the Fix button.',
        );
      }
    }
  );
}

// ─── Diagnostics ──────────────────────────────────────────────────────────────

function refreshDiagnostics(): void {
  chrome.runtime.sendMessage(
    { type: 'GET_AUTH_STATUS' as MessageType },
    (response: unknown) => {
      void chrome.runtime.lastError;
      const msg = response as Message;
      if (msg?.payload) {
        const authStatus = msg.payload as AuthStatus;
        const diag = adapter.getDiagnostics();
        panel.updateDiagnostics(authStatus, diag.documentId, diag.lastApiError);
      }
    }
  );
}

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: Message) => {
  switch (message.type) {
    case 'TOGGLE_PANEL':
      panel?.toggle();
      break;

    case 'RECHECK_DOC':
      lastCanonicalText  = '';
      currentSuggestions = [];
      panel?.setLoading(true);
      runCheck();
      break;

    case 'SWITCH_LANGUAGE': {
      const { language } = message.payload as { language: SupportedLanguage };
      currentLanguage   = language;
      lastCanonicalText = '';
      runCheck();
      break;
    }

    case 'APPLY_FIX_RESULT': {
      const payload = (message as Message<{ success?: boolean; error?: string }>).payload;
      if (payload?.success) {
        panel?.showToast('✓ Fixed successfully', 'success');
        setTimeout(() => { lastCanonicalText = ''; runCheck(); }, 1000);
      } else {
        const errMsg = payload?.error ?? 'Unknown error';
        panel?.showToast(`Fix failed: ${errMsg}`, 'error');
      }
      break;
    }

    case 'AUTH_TOKEN_RESULT':
      refreshDiagnostics();
      break;
  }
});

// ─── Entry ────────────────────────────────────────────────────────────────────

watchNavigation();

const initialDocId = extractDocumentId();
if (initialDocId) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init(initialDocId));
  } else {
    init(initialDocId);
  }
}

export {};
