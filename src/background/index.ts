/**
 * GrammarLens — Background Service Worker (MV3)
 *
 * Responsibilities:
 *  - Routes CHECK_TEXT → LanguageToolService
 *  - APPLY_FIX_GDOCS   → GoogleDocsApi (with OAuth via GoogleAuth)
 *  - GET_AUTH_TOKEN    → GoogleAuth
 *  - GET_AUTH_STATUS   → GoogleAuth (for diagnostics panel)
 *  - SWITCH_LANGUAGE   → LanguageToolService
 *  - CLEAR_CACHE       → LanguageToolService
 *  - OPEN_SIDE_PANEL   → chrome.sidePanel
 *  - Keyboard commands → content script relay
 */

import { languageToolService }  from '../services/languagetool.js';
import { logger }               from '../utils/logger.js';
import { perfMonitor }          from '../utils/performance.js';
import { googleAuth }           from '../services/googleAuth.js';
import { googleDocsApi, GDocsApiError } from '../services/googleDocsApi.js';
import { contextEngine, reviewGrammarWithGroq } from '../services/contextEngine.js';
import { checkCustomRules }      from '../services/customRules.js';
import { loadSettings }         from '../utils/settingsStore.js';
import { LanguageToolError }    from '../types/grammar.js';
import type {
  CheckRequest,
  Message,
  MessageType,
  SupportedLanguage,
} from '../types/index.js';
import type { GDocsIndexMap }   from '../services/googleDocsApi.js';

// ─── Settings cache (avoid storage read on every check) ───────────────────────
let _cachedSettings: Awaited<ReturnType<typeof loadSettings>> | null = null;
let _settingsCacheAt = 0;
const SETTINGS_CACHE_TTL = 30_000; // 30 s

async function getSettings(): Promise<Awaited<ReturnType<typeof loadSettings>>> {
  if (_cachedSettings && Date.now() - _settingsCacheAt < SETTINGS_CACHE_TTL) {
    return _cachedSettings;
  }
  _cachedSettings = await loadSettings();
  _settingsCacheAt = Date.now();
  return _cachedSettings;
}

// ─── Per-document API index cache ────────────────────────────────────────────
// Avoids re-fetching the document for every fix in the same session.

interface CachedDoc {
  indexMap:   GDocsIndexMap;
  fetchedAt:  number;
  revisionId: string | null;
}

const docCache = new Map<string, CachedDoc>();
const DOC_CACHE_TTL_MS    = 60_000; // 1 minute

// ─── Document size limits ─────────────────────────────────────────────────────
/** Show a warning in the diagnostics panel above this size */
const MAX_LT_WARNING_CHARS = 20_000;
/** Hard per-chunk limit sent to LanguageTool */
const MAX_LT_CHUNK_CHARS   = 50_000;

// ─── Sequential Fix Queue (BUG-012) ──────────────────────────────────────────
// Fixes are executed one at a time so that each subsequent fix uses the
// document state AFTER the previous fix was written.

interface FixQueueItem {
  documentId:  string;
  ltOffset:    number;
  ltLength:    number;
  replacement: string;
  sendResponse: (r: unknown) => void;
}

const fixQueue: FixQueueItem[] = [];
let   fixInProgress = false;

/**
 * Add a fix request to the queue and start processing if idle.
 */
function enqueueFix(item: FixQueueItem): void {
  fixQueue.push(item);
  void processFixQueue();
}

/**
 * Process fix items sequentially. After each fix, the docCache entry is
 * deleted so the next fix re-fetches the updated document before mapping
 * its offsets — preventing position corruption from stale index maps.
 */
async function processFixQueue(): Promise<void> {
  if (fixInProgress || fixQueue.length === 0) return;
  fixInProgress = true;

  const item = fixQueue.shift()!;
  try {
    await executeOneFix(item);
  } catch (err) {
    // executeOneFix already called sendResponse with the error
    logger.error('FIX_QUEUE', `Fix failed: ${String(err)}`);
  } finally {
    fixInProgress = false;
    // Brief pause to let Google Docs server persist the change before next fix
    if (fixQueue.length > 0) {
      setTimeout(() => void processFixQueue(), 250);
    }
  }
}

async function executeOneFix(item: FixQueueItem): Promise<void> {
  const { documentId, ltOffset, ltLength, replacement, sendResponse } = item;

  try {
    let token = await googleAuth.getAuthToken(true);
    if (!token) {
      sendResponse(fail('APPLY_FIX_RESULT', new Error('Not authenticated. Please sign in.')));
      return;
    }

    // Always fetch the latest document state (cache was cleared after last fix)
    let cached = getCachedDoc(documentId);
    if (!cached) {
      const doc      = await googleDocsApi.getDocument(documentId, token);
      const indexMap = googleDocsApi.buildIndexMap(doc);
      cached = { indexMap, fetchedAt: Date.now(), revisionId: doc.revisionId ?? null };
      docCache.set(documentId, cached);
    }

    const startIdx = googleDocsApi.ltOffsetToApiIndex(cached.indexMap, ltOffset);
    const endIdx   = googleDocsApi.ltOffsetToApiIndex(cached.indexMap, ltOffset + ltLength);

    const stopFixTimer = perfMonitor.startTimer('fix_apply');
    try {
      await googleDocsApi.applyFix(documentId, token, startIdx, endIdx, replacement);
    } catch (apiErr) {
      stopFixTimer(); // record even on failure
      if (apiErr instanceof GDocsApiError && apiErr.status === 401) {
        const newToken = await googleAuth.refreshToken();
        if (!newToken) throw apiErr;
        token = newToken;
        await googleDocsApi.applyFix(documentId, token, startIdx, endIdx, replacement);
      } else {
        throw apiErr;
      }
    }

    const fixMs = stopFixTimer();
    logger.info('FIX_QUEUE', `Fix applied in ${fixMs}ms; queue depth: ${fixQueue.length}`);
    perfMonitor.persistToStorage();

    // CRITICAL: invalidate cache so the next fix fetches the post-edit document
    docCache.delete(documentId);

    sendResponse(ok('APPLY_FIX_RESULT', { success: true }));
  } catch (err) {
    docCache.delete(documentId); // clear potentially stale cache on failure too
    logger.error('FIX_QUEUE', String(err));
    sendResponse(fail('APPLY_FIX_RESULT', err));
  }
}

function getCachedDoc(docId: string): CachedDoc | null {
  const cached = docCache.get(docId);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > DOC_CACHE_TTL_MS) {
    docCache.delete(docId);
    return null;
  }
  return cached;
}

// ─── Invalidate settings cache when user saves settings ───────────────────────

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'grammarLensSettings' in changes) {
    _cachedSettings  = null;
    _settingsCacheAt = 0;
    console.log('[GL:BG] Settings changed — cache invalidated');
  }
});

// ─── Install ──────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    void chrome.tabs.create({ url: 'https://docs.google.com/' });
  }

  chrome.contextMenus.create({
    id:       'grammarLens-lookup',
    title:    'GrammarLens: Look up "%s"',
    contexts: ['selection'],
  });
});


// ─── Merge LT + custom rule suggestions, deduplicating by offset ──────────────

function mergeAndDeduplicate(
  lt:     import('../types/grammar.js').ProcessedSuggestion[],
  custom: import('../types/grammar.js').ProcessedSuggestion[]
): import('../types/grammar.js').ProcessedSuggestion[] {
  const merged = [...lt];
  const ltOffsets = new Set(lt.map(s => s.offset));
  for (const c of custom) {
    // Skip if LT already flagged the same position (within 2 chars)
    let overlaps = false;
    for (const o of ltOffsets) {
      if (Math.abs(o - c.offset) <= 2) { overlaps = true; break; }
    }
    if (!overlaps) merged.push(c);
  }
  return merged.sort((a, b) => a.offset - b.offset);
}

// ─── Message Router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: Message,
    sender:        chrome.runtime.MessageSender,
    sendResponse:  (r: unknown) => void
  ) => {
    void routeMessage(message, sender, sendResponse);
    return true;
  }
);

async function routeMessage(
  message:      Message,
  sender:       chrome.runtime.MessageSender,
  sendResponse: (r: unknown) => void
): Promise<void> {
  switch (message.type) {

    // ── Grammar Check ───────────────────────────────────────────────────────
    case 'CHECK_TEXT': {
      const req = message.payload as CheckRequest;
      if (!req?.text || req.text.trim().length === 0) {
        sendResponse(ok('CHECK_TEXT_RESULT', {
          suggestions: [], language: req.language ?? 'en-US',
          checkedLength: 0, fromCache: false, latencyMs: 0, checkedAt: Date.now(),
        }));
        return;
      }
      try {
        const result = await languageToolService.check(req);
        sendResponse(ok('CHECK_TEXT_RESULT', result));
      } catch (err) {
        sendResponse(fail('CHECK_TEXT_RESULT', err));
      }
      break;
    }

    // ── Google Docs API Fix (BUG-012: queued, sequential) ────────────────────
    case 'APPLY_FIX_GDOCS': {
      const { documentId, ltOffset, ltLength, replacement } = message.payload as {
        documentId: string; ltOffset: number; ltLength: number; replacement: string;
      };

      // Enqueue the fix — never executes concurrently with another fix.
      // Each queued item re-fetches the document after the previous fix lands.
      enqueueFix({ documentId, ltOffset, ltLength, replacement, sendResponse });
      break;
    }

    // ── Auth Token (silent) ────────────────────────────────────────────────
    case 'GET_AUTH_TOKEN': {
      const { interactive = false } = (message.payload ?? {}) as { interactive?: boolean };
      try {
        const token = await googleAuth.getAuthToken(interactive as boolean);
        sendResponse(ok('AUTH_TOKEN_RESULT', { token }));
      } catch (err) {
        sendResponse(fail('AUTH_TOKEN_RESULT', err));
      }
      break;
    }

    // ── Auth Status (for diagnostics panel) ───────────────────────────────
    case 'GET_AUTH_STATUS': {
      try {
        const status = await googleAuth.getStatus();
        sendResponse(ok('AUTH_TOKEN_RESULT', status));
      } catch (err) {
        sendResponse(fail('AUTH_TOKEN_RESULT', err));
      }
      break;
    }

    // ── Language Switch ────────────────────────────────────────────────────
    case 'SWITCH_LANGUAGE': {
      const { language } = message.payload as { language: SupportedLanguage };
      languageToolService.setLanguage(language);
      sendResponse(ok('SWITCH_LANGUAGE', { ok: true }));
      break;
    }

    // ── Cache Control ──────────────────────────────────────────────────────
    case 'CLEAR_CACHE': {
      const { documentId } = (message.payload ?? {}) as { documentId?: string };
      languageToolService.clearCache(documentId);
      if (documentId) docCache.delete(documentId);
      else            docCache.clear();
      sendResponse(ok('CLEAR_CACHE', { ok: true }));
      break;
    }

    // ── Side Panel ─────────────────────────────────────────────────────────
    case 'OPEN_SIDE_PANEL': {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) {
        try { await chrome.sidePanel.open({ tabId }); } catch { /* already open */ }
      }
      sendResponse(ok('OPEN_SIDE_PANEL', { ok: true }));
      break;
    }

    // ── API-canonical document check ──────────────────────────────────────────
    case 'CHECK_GDOCS_DOCUMENT': {
      const { documentId, language, domText } = message.payload as {
        documentId: string;
        language:   string;
        domText?:   string;   // DOM-extracted fallback text from content script
      };

      console.log('[GL:BG] CHECK_GDOCS_DOCUMENT', { documentId, language, domTextLen: domText?.length ?? 0 });

      try {
        // 1. Try to get auth token silently
        const token = await googleAuth.getAuthToken(false);
        console.log('[GL:BG] Auth token:', token ? 'present' : 'absent');

        if (token) {
          // ── Authenticated path: fetch canonical text from Google Docs API ──
          try {
            const doc      = await googleDocsApi.getDocument(documentId, token);
            const indexMap = googleDocsApi.buildIndexMap(doc);
            const { flatText } = indexMap;

            docCache.set(documentId, { indexMap, fetchedAt: Date.now(), revisionId: doc.revisionId ?? null });

            const charCount = flatText.length;
            const truncated = charCount > MAX_LT_WARNING_CHARS;

            console.log('[GL:BG] API text length:', charCount, 'sending to LT');
            const stopLtTimer = perfMonitor.startTimer('grammar_check');
            const suggestions = await checkWithChunking(flatText, language, documentId);
            const ltMs        = stopLtTimer();
            logger.info('CHECK_GDOCS_DOCUMENT', `LT ${ltMs}ms, ${suggestions.length} suggestions (API path)`);
            perfMonitor.persistToStorage();

            // ── Custom rule engine (instant, zero API calls) ──────────────────
            const customSuggestions = checkCustomRules(flatText);
            const allSuggestions = mergeAndDeduplicate(suggestions, customSuggestions);
            console.log(`[GL:BG] Custom rules: +${customSuggestions.length} suggestions`);

            // ── AI: spelling context + grammar review ─────────────────────────
            const settings = await getSettings();
            if (settings.ai?.enabled && settings.ai?.groqApiKey?.trim()) {
              await contextEngine.enhanceSuggestions(allSuggestions, flatText, settings.ai);
              try {
                const existingOffsets = new Set(allSuggestions.map(s => s.offset));
                const aiGrammar = await reviewGrammarWithGroq(flatText, settings.ai.groqApiKey, settings.ai.confidenceThreshold ?? 0.85, existingOffsets);
                allSuggestions.push(...aiGrammar);
                if (aiGrammar.length) console.log(`[GL:BG] AI grammar review: +${aiGrammar.length} suggestions`);
              } catch (e) {
                console.warn('[GL:BG] AI grammar review failed (non-fatal):', String(e));
              }
            }

            sendResponse(ok('CHECK_TEXT_RESULT', {
              suggestions: allSuggestions, language,
              checkedLength: charCount, fromCache: false, latencyMs: ltMs, checkedAt: Date.now(),
              flatText, charCount, truncated, hasIndexMap: true,
            }));
            return;
          } catch (apiErr) {
            // API fetch failed — fall through to DOM fallback
            if (apiErr instanceof GDocsApiError && apiErr.status === 401) {
              googleAuth.clearCache();
            }
            console.warn('[GL:BG] API fetch failed, falling back to DOM text:', String(apiErr));
          }
        }

        // ── Unauthenticated / API-failed path: use DOM text from content script ──
        const textToCheck = domText?.trim() ?? '';
        if (!textToCheck) {
          sendResponse(fail('CHECK_TEXT_RESULT', new Error('Not authenticated and no document text available. Please sign in via the GrammarLens status panel.')));
          return;
        }

        console.log('[GL:BG] DOM fallback path, text length:', textToCheck.length);
        const stopLtTimer2 = perfMonitor.startTimer('grammar_check');
        const suggestions2 = await checkWithChunking(textToCheck, language, documentId);
        const ltMs2        = stopLtTimer2();
        logger.info('CHECK_GDOCS_DOCUMENT', `LT ${ltMs2}ms, ${suggestions2.length} suggestions (DOM fallback, no Fix available)`);
        perfMonitor.persistToStorage();

        // Custom rules + AI on DOM fallback path
        const customSuggestions2 = checkCustomRules(textToCheck);
        const allSuggestions2 = mergeAndDeduplicate(suggestions2, customSuggestions2);
        const settings2 = await getSettings();
        if (settings2.ai?.enabled && settings2.ai?.groqApiKey?.trim()) {
          await contextEngine.enhanceSuggestions(allSuggestions2, textToCheck, settings2.ai);
          try {
            const existingOffsets2 = new Set(allSuggestions2.map(s => s.offset));
            const aiGrammar2 = await reviewGrammarWithGroq(textToCheck, settings2.ai.groqApiKey, settings2.ai.confidenceThreshold ?? 0.85, existingOffsets2);
            allSuggestions2.push(...aiGrammar2);
          } catch (e) {
            console.warn('[GL:BG] AI grammar review (DOM) failed:', String(e));
          }
        }

        sendResponse(ok('CHECK_TEXT_RESULT', {
          suggestions: allSuggestions2, language,
          checkedLength: textToCheck.length, fromCache: false, latencyMs: ltMs2, checkedAt: Date.now(),
          flatText: textToCheck, charCount: textToCheck.length, truncated: false, hasIndexMap: false,
        }));

      } catch (err) {
        logger.error('CHECK_GDOCS_DOCUMENT', String(err));
        console.error('[GL:BG] CHECK_GDOCS_DOCUMENT fatal error:', err);
        sendResponse(fail('CHECK_TEXT_RESULT', err));
      }
      break;
    }

    default: {
      sendResponse({ error: `Unknown message type: ${message.type as string}` });
    }
  }
}

// ─── Keyboard Commands ────────────────────────────────────────────────────────

const COMMAND_TO_MESSAGE: Record<string, MessageType> = {
  'open-panel':      'TOGGLE_PANEL',
  'fix-current':     'FIX_CURRENT',
  'next-suggestion': 'NEXT_SUGGESTION',
  'prev-suggestion': 'PREV_SUGGESTION',
  'recheck-doc':     'RECHECK_DOC',
};

chrome.commands.onCommand.addListener((command) => {
  const msgType = COMMAND_TO_MESSAGE[command];
  if (!msgType) return;
  void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    if (tab?.id !== undefined) {
      chrome.tabs.sendMessage(tab.id, { type: msgType });
    }
  });
});

// ─── Context Menu ─────────────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'grammarLens-lookup' && tab?.id !== undefined) {
    chrome.tabs.sendMessage(tab.id, {
      type:    'SHOW_WORD_LOOKUP' as MessageType,
      payload: { word: info.selectionText ?? '' },
    });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ok(type: MessageType, payload: unknown): object {
  return { type, payload };
}

function fail(type: MessageType, err: unknown): object {
  const message = err instanceof GDocsApiError    ? `[GDocs ${err.status}] ${err.message}`
    : err instanceof LanguageToolError ? `[LT ${err.code}] ${err.message}`
    : err instanceof Error             ? err.message
    : String(err);
  return { type, error: message };
}

export {};

// ─── LT Chunking Helpers ──────────────────────────────────────────────────────

/**
 * Split `text` into chunks at paragraph (`\n`) boundaries so each chunk is
 * at most `maxChunkSize` characters.  Returns an array of `{text, offset}`
 * pairs where `offset` is the character position of the chunk's first character
 * in the original text.
 */
function splitIntoChunks(
  text:         string,
  maxChunkSize: number
): Array<{ text: string; offset: number }> {
  const chunks: Array<{ text: string; offset: number }> = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChunkSize, text.length);

    // Prefer to break at a paragraph boundary to keep sentences intact
    if (end < text.length) {
      const lastBreak = text.lastIndexOf('\n', end - 1);
      if (lastBreak > start) end = lastBreak + 1;
    }

    chunks.push({ text: text.slice(start, end), offset: start });
    start = end;
  }

  return chunks;
}

/**
 * Run LanguageTool against `text`, chunking automatically when the text
 * exceeds `MAX_LT_CHUNK_CHARS`.  Offsets in returned suggestions are adjusted
 * to be relative to the full original text.
 */
async function checkWithChunking(
  text:       string,
  language:   string,
  documentId: string
): Promise<import('../types/grammar.js').ProcessedSuggestion[]> {
  if (text.length <= MAX_LT_CHUNK_CHARS) {
    const result = await languageToolService.check({ text, language: language as import('../types/grammar.js').SupportedLanguage, documentId });
    return result.suggestions;
  }

  // Text exceeds hard limit — split into overlapping chunks at paragraph breaks
  const chunks  = splitIntoChunks(text, MAX_LT_CHUNK_CHARS);
  const seenIds = new Set<string>();
  const merged: import('../types/grammar.js').ProcessedSuggestion[] = [];

  for (const chunk of chunks) {
    const result = await languageToolService.check({
      text:       chunk.text,
      language:   language as import('../types/grammar.js').SupportedLanguage,
      documentId: `${documentId}:chunk:${chunk.offset}`,
       });

    for (const s of result.suggestions) {
      // Adjust offset to be relative to the full document text
      const adjusted = {
        ...s,
        offset: s.offset + chunk.offset,
        id:     `${s.id}_${chunk.offset}`,
      };
      if (!seenIds.has(adjusted.id)) {
        seenIds.add(adjusted.id);
        merged.push(adjusted);
      }
    }
  }

  return merged;
}
