/**
 * GrammarLens — Context-Aware Correction Engine (Groq)
 */

import type { ProcessedSuggestion } from '../types/grammar.js';
import { bestReplacement, levenshtein } from '../utils/bestReplacement.js';

export interface AISettings {
  enabled:             boolean;
  groqApiKey:          string;
  confidenceThreshold: number;
  groqModel?:          string;
}

interface SentenceContext {
  currentSentence:  string;
  previousSentence: string | null;
  nextSentence:     string | null;
}

interface AIResult {
  correction: string;
  confidence: number;
}

interface AICacheEntry {
  result:    AIResult;
  expiresAt: number;
}

interface AIDiagnosticsStore {
  totalCalls:     number;
  cacheHits:      number;
  fallbackUsed:   number;
  totalLatencyMs: number;
  callCount:      number;
}

const GROQ_URL      = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL    = 'llama-3.1-8b-instant';
const CACHE_KEY     = 'gl_ai_cache';
const DIAG_KEY      = 'gl_ai_diag';
const CACHE_TTL_MS  = 24 * 60 * 60 * 1_000;
const CACHE_MAX     = 300;
const AI_TIMEOUT_MS = 10_000;
const MAX_PER_CHECK = 4;

const SYSTEM_PROMPT =
  'You are a spelling correction assistant. A user misspelled a word in a sentence.\n' +
  'Your job is to figure out the INTENDED word — what the user meant to type.\n\n' +
  'CRITICAL: You are NOT limited to the candidates list. The candidates are ' +
  "LanguageTool's guesses based on spelling similarity only — they may all be wrong.\n" +
  'Ask yourself: "What word belongs here to make this sentence natural and correct?"\n\n' +
  'Examples:\n' +
  '- "She was chsing butterflies." + candidates:[chasing,casing] -> "chasing" (candidate is right)\n' +
  '- "He spent time chsing between options." + candidates:[chasing,casing] -> "choosing" ' +
  '(not in candidates, but clearly the intended word)\n\n' +
  'Rules:\n' +
  '1. Read the FULL sentence context\n' +
  '2. Determine the INTENDED word (may or may not be in candidates)\n' +
  '3. Preserve original capitalisation\n' +
  '4. Respond ONLY with valid JSON: {"correction":"word","confidence":0.95}\n' +
  '   confidence: 1.0=certain, 0.5=unsure';

// ─── Trigger gate ──────────────────────────────────────────────────────────────

function shouldUseAI(s: ProcessedSuggestion): boolean {
  if (s.replacements.length === 0) return false;
  if (looksLikeTechnical(s.errorText)) return false;
  if (['whitespace', 'typographical', 'formatting', 'style'].includes(s.issueType)) return false;
  if (s.ltCategoryId === 'CONFUSED_WORDS') return true;
  if (isApostropheFix(s)) return true;
  if (s.issueType === 'misspelling' && s.replacements.length > 1) {
    return isAmbiguousSpelling(s);
  }
  return false;
}

function isApostropheFix(s: ProcessedSuggestion): boolean {
  if (s.replacements.length === 0) return false;
  const hasApostrophe = (w: string) => w.includes("'") || w.includes('’');
  if (hasApostrophe(s.errorText)) return false;
  return hasApostrophe(bestReplacement(s.errorText, s.replacements));
}

function isAmbiguousSpelling(s: ProcessedSuggestion): boolean {
  const orig  = s.errorText.toLowerCase();
  const dists = s.replacements.slice(0, 3).map(r => levenshtein(orig, r.value.toLowerCase()));
  const minDist = Math.min(...dists);
  // Check tie BEFORE early exit
  if (dists.length >= 2 && dists[0] === dists[1]) return true;
  if (minDist <= 1) return false;
  return minDist > 2;
}

function looksLikeTechnical(word: string): boolean {
  return (
    word.length <= 1 ||
    /^https?:\/\//.test(word) ||
    /\S+@\S+\.\S+/.test(word) ||
    /^[A-Z0-9_]{4,}$/.test(word) ||
    /^\d/.test(word) ||
    /[/\\]/.test(word) ||
    /^[{[(]/.test(word)
  );
}

// ─── Context extraction ────────────────────────────────────────────────────────

function extractContext(flatText: string, offset: number, length: number): SentenceContext {
  const re = /[^.!?\n]+[.!?\n]+/g;
  const sentences: Array<{ text: string; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(flatText)) !== null) {
    sentences.push({ text: m[0].trim(), end: m.index + m[0].length });
  }
  let cumulative = 0;
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i]!;
    if (offset >= cumulative && offset < s.end) {
      return {
        previousSentence: i > 0 ? sentences[i - 1]!.text.slice(0, 200) : null,
        currentSentence:  s.text.slice(0, 400),
        nextSentence:     i < sentences.length - 1 ? sentences[i + 1]!.text.slice(0, 200) : null,
      };
    }
    cumulative = s.end;
  }
  const start = Math.max(0, offset - 120);
  const end   = Math.min(flatText.length, offset + length + 120);
  return { previousSentence: null, currentSentence: flatText.slice(start, end).trim(), nextSentence: null };
}

// ─── Capitalisation ────────────────────────────────────────────────────────────

function matchCapitalisation(original: string, correction: string): string {
  if (!original || !correction) return correction;
  if (original === original.toUpperCase() && /[A-Z]/.test(original)) return correction.toUpperCase();
  if (
    original[0] === original[0]?.toUpperCase() &&
    original.slice(1) === original.slice(1).toLowerCase() &&
    /[A-Z]/.test(original[0] ?? '')
  ) {
    return correction.charAt(0).toUpperCase() + correction.slice(1).toLowerCase();
  }
  if (original === original.toLowerCase()) return correction.toLowerCase();
  return correction;
}

// ─── Cache ─────────────────────────────────────────────────────────────────────

function buildCacheKey(sentence: string, errorWord: string): string {
  const raw = `${sentence.trim().toLowerCase()}::${errorWord.toLowerCase()}`;
  return `${raw.length}:${raw.slice(0, 25)}:${raw.slice(-15)}`;
}

async function getFromCache(key: string): Promise<AIResult | null> {
  try {
    const store = await chrome.storage.local.get(CACHE_KEY);
    const cache = (store[CACHE_KEY] ?? {}) as Record<string, AICacheEntry>;
    const entry = cache[key];
    if (!entry || Date.now() > entry.expiresAt) return null;
    return entry.result;
  } catch { return null; }
}

async function saveToCache(key: string, result: AIResult): Promise<void> {
  try {
    const store = await chrome.storage.local.get(CACHE_KEY);
    const cache = (store[CACHE_KEY] ?? {}) as Record<string, AICacheEntry>;
    const now = Date.now();
    for (const k of Object.keys(cache)) {
      if ((cache[k]?.expiresAt ?? 0) < now) delete cache[k];
    }
    if (Object.keys(cache).length >= CACHE_MAX) {
      Object.entries(cache).sort(([,a],[,b]) => a.expiresAt - b.expiresAt).slice(0,30).forEach(([k]) => { delete cache[k]; });
    }
    cache[key] = { result, expiresAt: now + CACHE_TTL_MS };
    await chrome.storage.local.set({ [CACHE_KEY]: cache });
  } catch { /* ignore */ }
}

// ─── Diagnostics ───────────────────────────────────────────────────────────────

async function recordDiag(patch: { aiCall?: true; cacheHit?: true; fallback?: true; latencyMs?: number }): Promise<void> {
  try {
    const store = await chrome.storage.local.get(DIAG_KEY);
    const d: AIDiagnosticsStore = store[DIAG_KEY] ?? { totalCalls: 0, cacheHits: 0, fallbackUsed: 0, totalLatencyMs: 0, callCount: 0 };
    if (patch.aiCall)   { d.totalCalls++; d.callCount++; }
    if (patch.cacheHit)   d.cacheHits++;
    if (patch.fallback)   d.fallbackUsed++;
    if (patch.latencyMs !== undefined) d.totalLatencyMs += patch.latencyMs;
    await chrome.storage.local.set({ [DIAG_KEY]: d });
  } catch { /* ignore */ }
}

// ─── Groq API ─────────────────────────────────────────────────────────────────

async function callGroq(ctx: SentenceContext, errorWord: string, candidates: string[], apiKey: string, model?: string): Promise<AIResult> {
  const prevPart = ctx.previousSentence ? `Previous sentence: "${ctx.previousSentence}"\n` : '';
  const nextPart = ctx.nextSentence     ? `\nNext sentence: "${ctx.nextSentence}"`          : '';
  const userMsg =
    `${prevPart}Current sentence: "${ctx.currentSentence}"${nextPart}\n\n` +
    `Misspelled word: "${errorWord}"\n` +
    `LanguageTool candidates (may be wrong): ${JSON.stringify(candidates)}\n\n` +
    `What word did the user INTEND to write? Consider what makes the sentence most natural.`;

  const resp = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey.trim()}` },
    body: JSON.stringify({
      model: model ?? GROQ_MODEL, temperature: 0.1, max_tokens: 60,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userMsg }],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Groq ${resp.status}: ${errText.slice(0, 120)}`);
  }

  const data    = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
  const raw     = data.choices?.[0]?.message?.content?.trim() ?? '';
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const parsed  = JSON.parse(jsonStr) as { correction?: string; confidence?: number };
  const correction = (parsed.correction ?? '').trim();
  const confidence = typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0;
  if (!correction) throw new Error('Groq returned empty correction');
  return { correction, confidence };
}

// ─── Engine ────────────────────────────────────────────────────────────────────

export class ContextEngine {

  async enhanceSuggestions(suggestions: ProcessedSuggestion[], flatText: string, aiSettings: AISettings): Promise<void> {
    if (!aiSettings.enabled || !aiSettings.groqApiKey?.trim()) return;
    const targets = suggestions.filter(shouldUseAI).slice(0, MAX_PER_CHECK);
    console.log(`[GL:AI] enhanceSuggestions: ${suggestions.length} total, ${targets.length} AI targets:`, targets.map(s => s.errorText));
    if (targets.length === 0) return;
    const threshold = aiSettings.confidenceThreshold ?? 0.85;
    const model = aiSettings.groqModel ?? GROQ_MODEL;
    await Promise.race([
      Promise.allSettled(targets.map(s => this.enhanceOne(s, flatText, aiSettings.groqApiKey, threshold, model))),
      new Promise<void>(resolve => setTimeout(resolve, AI_TIMEOUT_MS + 500)),
    ]);
  }

  private async enhanceOne(s: ProcessedSuggestion, flatText: string, apiKey: string, threshold: number, model?: string): Promise<void> {
    const ctx      = extractContext(flatText, s.offset, s.length);
    const cacheKey = buildCacheKey(ctx.currentSentence, s.errorText);
    const cached   = await getFromCache(cacheKey);
    if (cached) {
      if (cached.confidence >= threshold) this.applyCorrection(s, cached.correction);
      void recordDiag({ cacheHit: true });
      return;
    }
    const t0 = performance.now();
    try {
      const candidates = s.replacements.slice(0, 5).map(r => r.value);
      console.log(`[GL:AI] Calling Groq for "${s.errorText}", candidates:`, candidates);
      const result    = await callGroq(ctx, s.errorText, candidates, apiKey, model);
      const latencyMs = Math.round(performance.now() - t0);
      void recordDiag({ aiCall: true, latencyMs });
      console.log(`[GL:AI] "${s.errorText}" -> "${result.correction}" (confidence ${result.confidence}, ${latencyMs}ms)`);
      if (result.confidence >= threshold) {
        void saveToCache(cacheKey, result);
        this.applyCorrection(s, result.correction);
      } else {
        void recordDiag({ fallback: true });
        console.log(`[GL:AI] below threshold ${threshold} — fallback`);
      }
    } catch (err) {
      void recordDiag({ fallback: true });
      console.warn('[GL:AI] Groq error, falling back:', String(err));
    }
  }

  private applyCorrection(s: ProcessedSuggestion, rawCorrection: string): void {
    const correction = matchCapitalisation(s.errorText, rawCorrection);
    if (s.replacements[0]?.value === correction) return;
    const rest = s.replacements.filter(r => r.value !== correction);
    s.replacements = [{ value: correction, shortDescription: 'AI context correction' }, ...rest];
  }

  async getDiagnostics(): Promise<{ totalCalls: number; cacheHits: number; avgLatencyMs: number; fallbackUsed: number }> {
    try {
      const store = await chrome.storage.local.get(DIAG_KEY);
      const d = (store[DIAG_KEY] ?? {}) as AIDiagnosticsStore;
      return {
        totalCalls:   d.totalCalls   ?? 0,
        cacheHits:    d.cacheHits    ?? 0,
        avgLatencyMs: d.callCount > 0 ? Math.round(d.totalLatencyMs / d.callCount) : 0,
        fallbackUsed: d.fallbackUsed ?? 0,
      };
    } catch {
      return { totalCalls: 0, cacheHits: 0, avgLatencyMs: 0, fallbackUsed: 0 };
    }
  }

  async clearCache(): Promise<void> {
    await chrome.storage.local.remove(CACHE_KEY);
  }
}

export const contextEngine = new ContextEngine();

// ─── Groq Grammar Review (second-pass AI review) ──────────────────────────────

const GRAMMAR_REVIEW_PROMPT =
  'You are a strict grammar checker. Review the text for clear grammar errors ONLY.\n\n' +
  'STRICT RULES — violating these means a wrong answer:\n' +
  '- Only flag errors you are 100% certain about. When in doubt, return [].\n' +
  '- Do NOT flag spelling errors (handled separately).\n' +
  '- Do NOT flag singular vs plural unless subject-verb agreement is clearly broken.\n' +
  '- Do NOT suggest swapping "fewer" ↔ "less". "fewer than N [countable noun]" is ALWAYS correct.\n' +
  '- Do NOT flag "fewer than X people/items/days" — that is standard correct English.\n' +
  '- Do NOT flag word choice or style — only unambiguous grammar errors.\n' +
  '- Do NOT re-flag something that was already corrected (e.g. if text already says "fewer", leave it).\n' +
  '- The "original_phrase" must be an EXACT substring of the input text.\n' +
  '- If you are not 100% certain, return [].\n\n' +
  'EXAMPLES of what to flag:\n' +
  '  "She go to school" → "She goes to school" (subject-verb agreement)\n' +
  '  "He is more taller" → "He is taller" (double comparative)\n\n' +
  'EXAMPLES of what NOT to flag (these are already correct):\n' +
  '  "fewer than 5 people" — correct, do NOT change to "less"\n' +
  '  "choosing between conventional and modern methods" — correct\n' +
  '  "between X and Y" — always correct phrasing\n\n' +
  'Respond ONLY with a JSON array (empty array if no issues):\n' +
  '[{"original_phrase":"exact text","corrected_phrase":"fix","explanation":"why","confidence":0.98}]\n' +
  'If no clear errors: []';

export interface GrammarIssue {
  original_phrase: string;
  corrected_phrase: string;
  explanation:     string;
  confidence:      number;
}

export async function reviewGrammarWithGroq(
  text:      string,
  apiKey:    string,
  threshold: number,
  existingOffsets: Set<number>
): Promise<import('../types/grammar.js').ProcessedSuggestion[]> {
  // Limit text to first 3000 chars to keep Groq fast
  const sample = text.slice(0, 3_000);

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey.trim()}` },
    body: JSON.stringify({
      model:       'llama-3.1-8b-instant',
      temperature: 0.1,
      max_tokens:  400,
      messages: [
        { role: 'system', content: GRAMMAR_REVIEW_PROMPT },
        { role: 'user',   content: `Text to review:\n"${sample}"` },
      ],
    }),
  });

  if (!resp.ok) throw new Error(`Groq grammar review ${resp.status}`);

  const data    = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
  const raw     = data.choices?.[0]?.message?.content?.trim() ?? '';
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let issues: GrammarIssue[] = [];
  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) issues = parsed as GrammarIssue[];
  } catch {
    console.warn('[GL:AI] Grammar review: failed to parse Groq response:', raw.slice(0, 200));
    return [];
  }

  const results: import('../types/grammar.js').ProcessedSuggestion[] = [];

  for (const issue of issues) {
    if (!issue.original_phrase || !issue.corrected_phrase) continue;
    if ((issue.confidence ?? 0) < threshold) continue;
    if (issue.original_phrase.toLowerCase() === issue.corrected_phrase.toLowerCase()) continue;

    // Find the phrase in the document text
    const offset = text.indexOf(issue.original_phrase);
    if (offset < 0) continue;

    // Skip if LT or custom rules already flagged this offset range
    let overlaps = false;
    for (const existingOffset of existingOffsets) {
      if (Math.abs(existingOffset - offset) < issue.original_phrase.length) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;

    console.log(`[GL:AI] Grammar review found: "${issue.original_phrase}" -> "${issue.corrected_phrase}"`);

    results.push({
      id:           `ai_grammar_${offset}`,
      offset,
      length:       issue.original_phrase.length,
      errorText:    issue.original_phrase,
      message:     issue.explanation || 'Grammar issue',
      shortMessage: (issue.explanation || 'Grammar issue').slice(0, 60),
      category:     'correctness' as const,
      severity:     'error' as const,
      replacements: [{ value: issue.corrected_phrase, shortDescription: issue.explanation || 'AI grammar fix' }],
      status:       'new' as const,
      ruleId:       'AI_GRAMMAR_REVIEW',
      ruleDescription: issue.explanation || 'Identified by AI grammar review',
      ltCategoryId:    'AI_GRAMMAR',
      ltCategoryName:  'AI Grammar Review',
      issueType:       'grammar' as const,
      wrenMartin:      null,
      sentence:        text.slice(Math.max(0, offset - 60), offset + issue.original_phrase.length + 60).trim(),
      createdAt:       Date.now(),
    });
  }

  return results;
}
