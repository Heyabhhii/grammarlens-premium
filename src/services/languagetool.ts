/**
 * GrammarLens — LanguageTool Service
 *
 * Production-ready grammar checking service with:
 *  - Multi-language support (en-US, en-GB, en-AU, de, fr, es, pt, it)
 *  - TTL response caching (5 min, max 100 entries, LRU eviction)
 *  - 1500 ms debounce per document context
 *  - Exponential-backoff retry (up to 3 attempts)
 *  - Rate-limit awareness (LanguageTool public API: ~20 req/min)
 *  - Abort stale in-flight requests on new check
 *  - Full Wren & Martin educational explanations per suggestion
 *  - Language switching without page refresh
 */

import {
  LanguageToolError,
  LANGUAGE_TO_LT_CODE,
  type CacheEntry,
  type CheckRequest,
  type CheckResult,
  type LTMatch,
  type LTResponse,
  type ProcessedReplacement,
  type ProcessedSuggestion,
  type SuggestionCategory,
  type SuggestionSeverity,
  type SupportedLanguage,
} from '../types/grammar.js';
import { getWrenMartinExplanation } from './wrenMartin.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const LT_API_URL      = 'https://api.languagetool.org/v2/check';
const CACHE_TTL_MS    = 5 * 60 * 1000;   // 5 minutes
const CACHE_MAX_SIZE  = 100;
const DEBOUNCE_MS     = 1500;
const MAX_RETRIES     = 3;
const REQUEST_TIMEOUT = 8000;             // 8 s per attempt
/** Minimum gap between API calls to stay within the public rate limit */
const MIN_CALL_GAP_MS = 3000;

// ─── In-Memory Cache ──────────────────────────────────────────────────────────

class CheckCache {
  private readonly store = new Map<string, CacheEntry>();

  get(key: string): CheckResult | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.store.delete(key);
      return null;
    }
    // LRU: re-insert to move to end
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.result;
  }

  set(key: string, result: CheckResult): void {
    if (this.store.size >= CACHE_MAX_SIZE) {
      // Evict the oldest entry (first in insertion order)
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) {
        this.store.delete(firstKey);
      }
    }
    this.store.set(key, { result, expiry: Date.now() + CACHE_TTL_MS });
  }

  invalidate(keyPrefix?: string): void {
    if (!keyPrefix) {
      this.store.clear();
      return;
    }
    for (const key of this.store.keys()) {
      if (key.startsWith(keyPrefix)) {
        this.store.delete(key);
      }
    }
  }

  size(): number {
    return this.store.size;
  }
}

// ─── Debounce Map ─────────────────────────────────────────────────────────────

class DebounceMap {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly controllers = new Map<string, AbortController>();

  schedule(
    contextId: string,
    fn: (signal: AbortSignal) => Promise<void>,
    delayMs: number
  ): void {
    const existing = this.timers.get(contextId);
    if (existing) clearTimeout(existing);

    const prevController = this.controllers.get(contextId);
    if (prevController) prevController.abort();

    const controller = new AbortController();
    this.controllers.set(contextId, controller);

    const timer = setTimeout(() => {
      this.timers.delete(contextId);
      fn(controller.signal).catch(() => {
        /* errors surfaced through callbacks, not here */
      });
    }, delayMs);

    this.timers.set(contextId, timer);
  }

  cancel(contextId: string): void {
    const timer = this.timers.get(contextId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(contextId);
    }
    const controller = this.controllers.get(contextId);
    if (controller) {
      controller.abort();
      this.controllers.delete(contextId);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildCacheKey(text: string, language: SupportedLanguage, docId?: string): string {
  // Simple hash: length + first 50 chars + last 50 chars + full length
  const head = text.slice(0, 50);
  const tail = text.slice(-50);
  const base = `${language}:${text.length}:${head}${tail}`;
  return docId ? `${docId}:${base}` : base;
}

function generateId(): string {
  return crypto.randomUUID();
}

// ─── Category & Severity Mapping ──────────────────────────────────────────────

const LT_CATEGORY_TO_OURS: Record<string, SuggestionCategory> = {
  TYPOS:          'correctness',
  GRAMMAR:        'correctness',
  PUNCTUATION:    'correctness',
  CASING:         'correctness',
  CONFUSED_WORDS: 'correctness',
  MISC:           'correctness',
  STYLE:          'clarity',
  REDUNDANCY:     'clarity',
  COLLOCATIONS:   'clarity',
  SEMANTICS:      'clarity',
  CREATIVE_WRITING: 'engagement',
  TONE_OF_VOICE:  'delivery',
  FORMALITY:      'delivery',
};

function mapCategory(ltCategoryId: string, issueType: string): SuggestionCategory {
  if (ltCategoryId in LT_CATEGORY_TO_OURS) {
    return LT_CATEGORY_TO_OURS[ltCategoryId]!;
  }
  // Fallback by issueType
  if (issueType === 'style' || issueType === 'locale-violation') return 'clarity';
  if (issueType === 'uncategorized') return 'delivery';
  return 'correctness';
}

const ISSUE_TYPE_TO_SEVERITY: Record<string, SuggestionSeverity> = {
  misspelling:       'error',
  grammar:           'error',
  typographical:     'warning',
  style:             'style',
  whitespace:        'warning',
  'locale-violation':'style',
  uncategorized:     'warning',
  nonstandard:       'warning',
  inconsistency:     'style',
  hint:              'style',
};

function mapSeverity(issueType: string): SuggestionSeverity {
  return ISSUE_TYPE_TO_SEVERITY[issueType] ?? 'warning';
}

// ─── Match → ProcessedSuggestion ─────────────────────────────────────────────

function matchToSuggestion(
  match: LTMatch,
  text: string,
  _language: SupportedLanguage
): ProcessedSuggestion {
  const ruleId      = match.rule.id;
  const categoryId  = match.rule.category.id;
  const issueType   = match.rule.issueType;
  const errorText   = text.slice(match.offset, match.offset + match.length);

  const replacements: ProcessedReplacement[] = match.replacements.map((r) => ({
    value: r.value,
    shortDescription: r.shortDescription ?? '',
  }));

  return {
    id:              generateId(),
    offset:          match.offset,
    length:          match.length,
    errorText,
    message:         match.message,
    shortMessage:    match.shortMessage || match.message,
    category:        mapCategory(categoryId, issueType),
    severity:        mapSeverity(issueType),
    replacements,
    status:          'new',
    ruleId,
    ruleDescription: match.rule.description,
    ltCategoryId:    categoryId,
    ltCategoryName:  match.rule.category.name,
    issueType,
    wrenMartin:      getWrenMartinExplanation(ruleId, categoryId),
    sentence:        match.sentence ?? '',
    createdAt:       Date.now(),
  };
}

// ─── HTTP Layer ───────────────────────────────────────────────────────────────

async function fetchFromLT(
  text: string,
  ltLanguage: string,
  signal: AbortSignal
): Promise<LTMatch[]> {
  const body = new URLSearchParams({
    text,
    language: ltLanguage,
    enabledOnly: 'false',
    level: 'default',
  });

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  // Combine external abort signal with our timeout
  signal.addEventListener('abort', () => controller.abort(), { once: true });

  try {
    const response = await fetch(LT_API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
      signal:  controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json() as LTResponse;
      return data.matches;
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 15_000;
      throw new LanguageToolError('RATE_LIMITED', `Rate limited. Retry after ${waitMs}ms.`, 429, true);
    }
    if (response.status === 400) {
      throw new LanguageToolError('BAD_REQUEST', 'Bad request to LanguageTool API.', 400, false);
    }
    if (response.status === 401 || response.status === 403) {
      throw new LanguageToolError('UNAUTHORIZED', 'Unauthorized LanguageTool API access.', response.status, false);
    }
    if (response.status >= 500) {
      throw new LanguageToolError('SERVER_ERROR', `LanguageTool server error: ${response.status}`, response.status, true);
    }

    throw new LanguageToolError('SERVER_ERROR', `Unexpected HTTP ${response.status}`, response.status, true);

  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof LanguageToolError) throw err;

    const domErr = err as DOMException;
    if (domErr.name === 'AbortError') {
      if (signal.aborted) {
        throw new LanguageToolError('ABORTED', 'Request aborted by caller.');
      }
      throw new LanguageToolError('TIMEOUT', 'LanguageTool request timed out.', undefined, true);
    }

    throw new LanguageToolError('NETWORK_ERROR', `Network error: ${String(err)}`, undefined, true);
  }
}

async function fetchWithRetry(
  text: string,
  ltLanguage: string,
  signal: AbortSignal
): Promise<LTMatch[]> {
  let lastError: LanguageToolError | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (signal.aborted) {
      throw new LanguageToolError('ABORTED', 'Request aborted before attempt.');
    }

    try {
      return await fetchFromLT(text, ltLanguage, signal);
    } catch (err) {
      if (!(err instanceof LanguageToolError)) throw err;
      lastError = err;

      if (!err.retryable || attempt === MAX_RETRIES) break;

      const backoff = err.code === 'RATE_LIMITED'
        ? 15_000
        : Math.min(1000 * Math.pow(2, attempt - 1), 8_000);

      await sleep(backoff);
    }
  }

  throw lastError ?? new LanguageToolError('MAX_RETRIES_EXCEEDED', 'Max retries exceeded.');
}

// ─── Main Service ─────────────────────────────────────────────────────────────

export class LanguageToolService {
  private readonly cache    = new CheckCache();
  private readonly debounce = new DebounceMap();
  private currentLanguage: SupportedLanguage;
  private lastCallTime = 0;

  /** Registered callbacks for when debounced results are ready */
  private resultCallbacks = new Map<
    string,
    (result: CheckResult | null, error: LanguageToolError | null) => void
  >();

  constructor(defaultLanguage: SupportedLanguage = 'en-US') {
    this.currentLanguage = defaultLanguage;
  }

  // ── Public: Immediate Check ───────────────────────────────────────────────

  /**
   * Perform an immediate grammar check. Returns a CheckResult.
   * Uses cache unless forceRefresh is set.
   */
  async check(request: CheckRequest): Promise<CheckResult> {
    const language = request.language ?? this.currentLanguage;
    const cacheKey = buildCacheKey(request.text, language, request.documentId);

    if (!request.forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return { ...cached, fromCache: true, latencyMs: 0 };
      }
    }

    // Enforce minimum gap between API calls
    const now = Date.now();
    const gap = MIN_CALL_GAP_MS - (now - this.lastCallTime);
    if (gap > 0) await sleep(gap);
    this.lastCallTime = Date.now();

    const ltLanguage = LANGUAGE_TO_LT_CODE[language];
    const signal     = new AbortController().signal;
    const t0         = Date.now();

    const matches = await fetchWithRetry(request.text, ltLanguage, signal);

    const result: CheckResult = {
      suggestions:    matches.map((m) => matchToSuggestion(m, request.text, language)),
      language,
      checkedLength:  request.text.length,
      fromCache:      false,
      latencyMs:      Date.now() - t0,
      checkedAt:      Date.now(),
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  // ── Public: Debounced Check ───────────────────────────────────────────────

  /**
   * Schedule a debounced grammar check (1500 ms after last call for same contextId).
   * Results are delivered via the onResult callback registered for the contextId.
   *
   * @param contextId  Stable ID for the document/editor context (e.g. tab ID + platform)
   * @param request    The check request
   * @param onResult   Called with the result (or error) when the check completes
   */
  scheduleCheck(
    contextId: string,
    request: CheckRequest,
    onResult: (result: CheckResult | null, error: LanguageToolError | null) => void
  ): void {
    this.resultCallbacks.set(contextId, onResult);

    this.debounce.schedule(
      contextId,
      async (signal) => {
        const cb = this.resultCallbacks.get(contextId);
        if (!cb) return;

        try {
          const language = request.language ?? this.currentLanguage;
          const cacheKey = buildCacheKey(request.text, language, request.documentId);

          const cached = request.forceRefresh ? null : this.cache.get(cacheKey);
          if (cached) {
            cb({ ...cached, fromCache: true, latencyMs: 0 }, null);
            return;
          }

          const now = Date.now();
          const gap = MIN_CALL_GAP_MS - (now - this.lastCallTime);
          if (gap > 0) await sleep(gap);
          if (signal.aborted) return;
          this.lastCallTime = Date.now();

          const ltLanguage = LANGUAGE_TO_LT_CODE[language];
          const t0         = Date.now();
          const matches    = await fetchWithRetry(request.text, ltLanguage, signal);

          if (signal.aborted) return;

          const result: CheckResult = {
            suggestions:   matches.map((m) => matchToSuggestion(m, request.text, language)),
            language,
            checkedLength: request.text.length,
            fromCache:     false,
            latencyMs:     Date.now() - t0,
            checkedAt:     Date.now(),
          };

          this.cache.set(cacheKey, result);
          cb(result, null);
        } catch (err) {
          if (err instanceof LanguageToolError && err.code === 'ABORTED') return;
          const ltErr = err instanceof LanguageToolError
            ? err
            : new LanguageToolError('NETWORK_ERROR', String(err));
          cb(null, ltErr);
        }
      },
      DEBOUNCE_MS
    );
  }

  /**
   * Cancel any pending debounced check for a given context.
   */
  cancelPending(contextId: string): void {
    this.debounce.cancel(contextId);
    this.resultCallbacks.delete(contextId);
  }

  // ── Public: Language Management ───────────────────────────────────────────

  /**
   * Switch the active language. Invalidates all cache entries for the new language.
   * In-flight debounced checks will automatically use the new language.
   */
  setLanguage(language: SupportedLanguage): void {
    if (language === this.currentLanguage) return;
    this.currentLanguage = language;
    // Invalidate cache for new language to force fresh checks
    this.cache.invalidate(language);
  }

  getLanguage(): SupportedLanguage {
    return this.currentLanguage;
  }

  // ── Public: Cache Management ──────────────────────────────────────────────

  clearCache(documentId?: string): void {
    this.cache.invalidate(documentId);
  }

  cacheSize(): number {
    return this.cache.size();
  }
}

// ─── Module-Level Singleton ───────────────────────────────────────────────────

/**
 * Shared singleton used by the background service worker.
 * Content scripts communicate through chrome.runtime.sendMessage.
 */
export const languageToolService = new LanguageToolService('en-US');
