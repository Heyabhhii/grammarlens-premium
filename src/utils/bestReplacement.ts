/**
 * GrammarLens — Best Replacement Selector
 *
 * LanguageTool returns replacements ranked by its own language model, which
 * occasionally produces poor first suggestions (e.g. "The's" before "This"
 * for the misspelling "Ths").
 *
 * This utility re-ranks the candidate list using three rules applied in order:
 *
 *  Rule 1 — No-apostrophe preference
 *    If the original token contains no apostrophe, prefer candidates that also
 *    contain no apostrophe.  Falls back to full list if all candidates have one
 *    (e.g. "Their" → only replacement is "They're" — must keep it).
 *
 *  Rule 2 — Capitalisation matching
 *    Prefer candidates whose capitalisation pattern matches the original:
 *      lower  → "this"   (all lowercase)
 *      title  → "This"   (first letter capitalised, rest lower)
 *      upper  → "THIS"   (all uppercase)
 *      mixed  → pass through unchanged
 *
 *  Rule 3 — Minimum edit distance
 *    Among remaining candidates, choose the one with the smallest Levenshtein
 *    distance from the original (case-insensitive comparison).  Ties preserve
 *    LT's original ranking order.
 *
 *  Rule 4 — Fallback
 *    If all filters eliminate every candidate, return LT's first suggestion.
 */

import type { ProcessedReplacement } from '../types/grammar.js';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Choose the most appropriate replacement for a given error token.
 *
 * @param original     The erroneous token exactly as it appears in the document
 * @param replacements LanguageTool's replacement list (ordered by LT confidence)
 * @returns            The best replacement string, or '' if the list is empty
 */
export function bestReplacement(
  original:     string,
  replacements: ReadonlyArray<ProcessedReplacement>
): string {
  if (replacements.length === 0) return inferFallback(original);
  if (replacements.length === 1) return replacements[0]!.value;

  const firstFallback = replacements[0]!.value;
  let candidates = replacements.map(r => r.value);

  // ── Rule 1: no-apostrophe preference ────────────────────────────────────────
  if (!hasApostrophe(original)) {
    const noApostrophe = candidates.filter(c => !hasApostrophe(c));
    // Only narrow the list if at least one candidate survives the filter
    if (noApostrophe.length > 0) candidates = noApostrophe;
  }

  // ── Rule 2: capitalisation matching ─────────────────────────────────────────
  const origCap = capPattern(original);
  if (origCap !== 'mixed') {
    const capMatched = candidates.filter(c => capPattern(c) === origCap);
    if (capMatched.length > 0) candidates = capMatched;
  }

  // ── Rule 3: minimum edit distance (stable: ties keep LT order) ──────────────
  if (candidates.length > 1) {
    const origLower = original.toLowerCase();
    let best    = candidates[0]!;
    let bestDist = levenshtein(origLower, best.toLowerCase());

    for (let i = 1; i < candidates.length; i++) {
      const dist = levenshtein(origLower, candidates[i]!.toLowerCase());
      if (dist < bestDist) {
        best     = candidates[i]!;
        bestDist = dist;
      }
    }
    return best;
  }

  return candidates[0] ?? firstFallback;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type CapPattern = 'lower' | 'upper' | 'title' | 'mixed';

function capPattern(s: string): CapPattern {
  if (!s) return 'lower';
  if (s === s.toUpperCase() && s !== s.toLowerCase()) return 'upper';
  const first = s[0] ?? '';
  if (first === first.toUpperCase() && s.slice(1) === s.slice(1).toLowerCase()) return 'title';
  if (s === s.toLowerCase()) return 'lower';
  return 'mixed';
}

function hasApostrophe(s: string): boolean {
  // Covers straight ('), curly right ('), and left (')
  return s.includes("'") || s.includes('’') || s.includes('‘');
}

/**
 * When LanguageTool provides no replacements, infer a candidate by stripping
 * the first (extra) word from a multi-word error token.
 *
 * Example: "We the" → "The"  (extra leading word removed, cap preserved)
 * Example: "is are" → "are"
 * Single-word tokens: return '' (no safe inference possible).
 */
function inferFallback(original: string): string {
  const tokens = original.trim().split(/\s+/);
  if (tokens.length < 2) return '';
  // Take all tokens except the first (remove the extra leading word)
  const candidate = tokens.slice(1).join(' ');
  // Match capitalisation of the original
  const origCap = capPattern(original);
  if (origCap === 'title' || origCap === 'upper') {
    return candidate.charAt(0).toUpperCase() + candidate.slice(1);
  }
  return candidate.charAt(0).toLowerCase() + candidate.slice(1);
}

/**
 * Standard Levenshtein edit distance (O(m*n) DP).
 * Operates on the full character sequence; caller should normalise case first.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j]   ?? i) + 1,
        (curr[j - 1] ?? j) + 1,
        (prev[j - 1] ?? 0) + cost
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n] ?? 0;
}