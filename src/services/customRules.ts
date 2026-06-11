/**
 * GrammarLens — Custom Grammar Rule Engine
 *
 * Pattern-based rules for common errors LanguageTool misses.
 * Runs synchronously, zero API calls, zero latency.
 */

import type { ProcessedSuggestion, SuggestionCategory, SuggestionSeverity } from '../types/grammar.js';

interface RuleDef {
  id:             string;
  pattern:        RegExp;
  message:        string;
  ltCategoryId:   string;
  category:       SuggestionCategory;
  severity:       SuggestionSeverity;
  issueType:      string;
  getReplacement: (m: RegExpExecArray) => string;
  explanation:    string;
}

const RULES: RuleDef[] = [

  // ── Redundant prepositions ────────────────────────────────────────────────

  {
    id: 'DISCUSS_ABOUT',
    pattern: /\b(discuss|discusses|discussed|discussing|mention|mentions|mentioned|mentioning|describe|describes|described|describing|explain|explains|explained|explaining|emphasize|emphasises|emphasizes|emphasized|emphasised|emphasizing|emphasising|consider|considers|considered|considering)\s+about\b/gi,
    message: 'Remove redundant "about"',
    ltCategoryId: 'REDUNDANT_PREPOSITION',
    category: 'correctness',
    severity: 'error',
    issueType: 'grammar',
    getReplacement: m => m[1]!,
    explanation: 'This verb already implies "about". E.g., "discuss about" → "discuss".',
  },
  {
    id: 'OFF_OF',
    pattern: /\boff\s+of\b/gi,
    message: '"off of" → "off"',
    ltCategoryId: 'REDUNDANT_PREPOSITION',
    category: 'correctness',
    severity: 'error',
    issueType: 'grammar',
    getReplacement: () => 'off',
    explanation: '"Off of" is redundant. Use just "off".',
  },
  {
    id: 'REPEAT_AGAIN',
    pattern: /\brepeat\s+again\b/gi,
    message: '"Repeat" already means "do again"',
    ltCategoryId: 'REDUNDANT',
    category: 'clarity',
    severity: 'warning',
    issueType: 'style',
    getReplacement: () => 'repeat',
    explanation: '"Repeat again" is redundant.',
  },
  {
    id: 'REVERT_BACK',
    pattern: /\brevert\s+back\b/gi,
    message: '"Revert" already means "go back"',
    ltCategoryId: 'REDUNDANT',
    category: 'clarity',
    severity: 'warning',
    issueType: 'style',
    getReplacement: () => 'revert',
    explanation: '"Revert back" is redundant.',
  },
  {
    id: 'RETURN_BACK',
    pattern: /\breturn\s+back\b/gi,
    message: '"Return" already means "come back"',
    ltCategoryId: 'REDUNDANT',
    category: 'clarity',
    severity: 'warning',
    issueType: 'style',
    getReplacement: () => 'return',
    explanation: '"Return back" is redundant.',
  },

  // ── Pronoun case ──────────────────────────────────────────────────────────

  {
    id: 'BETWEEN_X_AND_I',
    pattern: /\bbetween\s+(\w+)\s+and\s+I\b/gi,
    message: 'Use "me" not "I" after a preposition',
    ltCategoryId: 'PRONOUN_CASE',
    category: 'correctness',
    severity: 'error',
    issueType: 'grammar',
    getReplacement: m => `between ${m[1]} and me`,
    explanation: 'Prepositions (between, for, with) take object pronouns: me, him, her, us, them.',
  },
  {
    id: 'BETWEEN_I_AND_X',
    pattern: /\bbetween\s+I\s+and\s+(\w+)\b/gi,
    message: 'Use "me" not "I" after a preposition',
    ltCategoryId: 'PRONOUN_CASE',
    category: 'correctness',
    severity: 'error',
    issueType: 'grammar',
    getReplacement: m => `between me and ${m[1]}`,
    explanation: 'Prepositions take object pronouns: me, him, her, us, them.',
  },

  // ── Common word errors ────────────────────────────────────────────────────

  {
    id: 'IRREGARDLESS',
    pattern: /\birregardless\b/gi,
    message: '"regardless" is the correct word',
    ltCategoryId: 'NONSTANDARD',
    category: 'correctness',
    severity: 'error',
    issueType: 'grammar',
    getReplacement: m => /^[A-Z]/.test(m[0]) ? 'Regardless' : 'regardless',
    explanation: '"Irregardless" is not standard English. Use "regardless".',
  },
  {
    id: 'COULD_CARE_LESS',
    pattern: /\bcould care less\b/gi,
    message: 'Did you mean "couldn\'t care less"?',
    ltCategoryId: 'IDIOM',
    category: 'correctness',
    severity: 'error',
    issueType: 'grammar',
    getReplacement: () => "couldn't care less",
    explanation: '"Could care less" means you do care. The correct idiom is "couldn\'t care less".',
  },
  {
    id: 'COMPRISED_OF',
    pattern: /\bcomprised of\b/gi,
    message: 'Use "composed of" or "comprises"',
    ltCategoryId: 'WORD_CHOICE',
    category: 'correctness',
    severity: 'error',
    issueType: 'grammar',
    getReplacement: () => 'composed of',
    explanation: '"Comprised of" is nonstandard. Use "composed of" or "comprises X".',
  },
  {
    id: 'ALOT',
    pattern: /\balot\b/gi,
    message: '"a lot" is two words',
    ltCategoryId: 'SPELLING',
    category: 'correctness',
    severity: 'error',
    issueType: 'misspelling',
    getReplacement: () => 'a lot',
    explanation: '"Alot" is not a word. Write it as two words: "a lot".',
  },

  // ── Informal / style ──────────────────────────────────────────────────────

  {
    id: 'TRY_AND',
    pattern: /\btry and (?=[a-z])/gi,
    message: 'Use "try to" in formal writing',
    ltCategoryId: 'INFORMAL',
    category: 'delivery',
    severity: 'warning',
    issueType: 'style',
    getReplacement: () => 'try to ',
    explanation: '"Try to" is preferred over "try and" in formal writing.',
  },

  // ── Wordiness ─────────────────────────────────────────────────────────────

  {
    id: 'DUE_TO_FACT',
    pattern: /\bdue to the fact that\b/gi,
    message: 'Use "because" — more concise',
    ltCategoryId: 'WORDINESS',
    category: 'clarity',
    severity: 'warning',
    issueType: 'style',
    getReplacement: () => 'because',
    explanation: '"Due to the fact that" is wordy. Replace with "because".',
  },
  {
    id: 'IN_ORDER_TO',
    pattern: /\bin order to\b/gi,
    message: '"in order" is redundant — use "to"',
    ltCategoryId: 'WORDINESS',
    category: 'clarity',
    severity: 'warning',
    issueType: 'style',
    getReplacement: () => 'to',
    explanation: '"In order to" is usually just "to".',
  },
  {
    id: 'AT_THIS_POINT',
    pattern: /\bat this point in time\b/gi,
    message: 'Use "now" or "currently"',
    ltCategoryId: 'WORDINESS',
    category: 'clarity',
    severity: 'warning',
    issueType: 'style',
    getReplacement: () => 'now',
    explanation: '"At this point in time" is wordy. Use "now".',
  },
  {
    id: 'ON_DAILY_BASIS',
    pattern: /\bon a daily basis\b/gi,
    message: 'Use "daily"',
    ltCategoryId: 'WORDINESS',
    category: 'clarity',
    severity: 'warning',
    issueType: 'style',
    getReplacement: () => 'daily',
    explanation: '"On a daily basis" is wordy.',
  },
  {
    id: 'ON_REGULAR_BASIS',
    pattern: /\bon a regular basis\b/gi,
    message: 'Use "regularly"',
    ltCategoryId: 'WORDINESS',
    category: 'clarity',
    severity: 'warning',
    issueType: 'style',
    getReplacement: () => 'regularly',
    explanation: '"On a regular basis" is wordy.',
  },
  {
    id: 'PAST_HISTORY',
    pattern: /\bpast history\b/gi,
    message: '"History" already refers to the past',
    ltCategoryId: 'REDUNDANT',
    category: 'clarity',
    severity: 'warning',
    issueType: 'style',
    getReplacement: () => 'history',
    explanation: '"Past history" is redundant.',
  },
  {
    id: 'FUTURE_PLANS',
    pattern: /\bfuture plans\b/gi,
    message: '"Plans" already implies the future',
    ltCategoryId: 'REDUNDANT',
    category: 'clarity',
    severity: 'warning',
    issueType: 'style',
    getReplacement: () => 'plans',
    explanation: '"Future plans" is redundant.',
  },
  {
    id: 'END_RESULT',
    pattern: /\bend result\b/gi,
    message: '"Result" is sufficient',
    ltCategoryId: 'REDUNDANT',
    category: 'clarity',
    severity: 'warning',
    issueType: 'style',
    getReplacement: () => 'result',
    explanation: '"End result" is redundant.',
  },
  {
    id: 'PERIOD_OF_TIME',
    pattern: /\bperiod of time\b/gi,
    message: 'Use "period" or "time"',
    ltCategoryId: 'WORDINESS',
    category: 'clarity',
    severity: 'warning',
    issueType: 'style',
    getReplacement: () => 'period',
    explanation: '"Period" already implies time.',
  },

  // ── Fewer vs Less ──────────────────────────────────────────────────────────

  {
    id: 'LESS_COUNTABLE',
    pattern: /\bless than (\d+) (people|persons|items|things|cars|books|words|pages|hours|days|weeks|months|years|dollars|euros|employees|students|customers|users|products|files|documents|cases|instances|mistakes|errors|issues|problems|questions|answers|results|tasks|steps|options|choices|candidates|members|teams|groups|companies|countries|cities)\b/gi,
    message: 'Use "fewer" with countable nouns',
    ltCategoryId: 'FEWER_LESS',
    category: 'correctness',
    severity: 'error',
    issueType: 'grammar',
    getReplacement: m => `fewer than ${m[1]} ${m[2]}`,
    explanation: 'Use "fewer" with countable nouns (people, items, days) and "less" with uncountable nouns (water, time, money).',
  },
];

// ─── Public API ─────────────────────────────────────────────────────────────────

export function checkCustomRules(text: string): ProcessedSuggestion[] {
  const results: ProcessedSuggestion[] = [];
  const now = Date.now();

  for (const rule of RULES) {
    // Reset lastIndex for global regexes
    const regex = new RegExp(rule.pattern.source, 'gi');
    let m: RegExpExecArray | null;

    while ((m = regex.exec(text)) !== null) {
      const matchText   = m[0];
      const replacement = rule.getReplacement(m);
      if (!replacement || matchText.toLowerCase() === replacement.toLowerCase()) continue;

      const offset = m.index;

      results.push({
        id:           `custom_${rule.id}_${offset}`,
        offset,
        length:       matchText.length,
        errorText:    matchText,
        message:      rule.message,
        shortMessage: rule.message,
        category:     rule.category,
        severity:     rule.severity,
        replacements: [{ value: replacement, shortDescription: rule.explanation }],
        status:       'new',
        ruleId:       rule.id,
        ruleDescription: rule.explanation,
        ltCategoryId:    rule.ltCategoryId,
        ltCategoryName:  rule.ltCategoryId.replace(/_/g, ' '),
        issueType:       rule.issueType,
        wrenMartin:      null,
        sentence:        getSentence(text, offset, matchText.length),
        createdAt:       now,
      });
    }
  }

  // Sort by offset ascending
  return results.sort((a, b) => a.offset - b.offset);
}

function getSentence(text: string, offset: number, length: number): string {
  const s = text.lastIndexOf('.', offset - 1);
  const e = text.indexOf('.', offset + length);
  return text.slice(s < 0 ? 0 : s + 1, e < 0 ? text.length : e + 1).trim().slice(0, 200);
}
