/**
 * GrammarLens — Types barrel
 *
 * Re-exports all canonical types from grammar.ts.
 * Code that imports from '../types/index.js' continues to work.
 */

import type {
  SupportedLanguage,
  SuggestionCategory,
} from './grammar.js';

export type {
  SupportedLanguage,
  SuggestionCategory,
  SuggestionSeverity,
  SuggestionStatus,
  DifficultyLevel,
  WrenMartinExplanation,
  ProcessedReplacement,
  ProcessedSuggestion,
  CheckRequest,
  CheckResult,
  CacheEntry,
  LTReplacement,
  LTContext,
  LTRuleCategory,
  LTRuleUrl,
  LTRule,
  LTMatch,
  LTDetectedLanguage,
  LTLanguage,
  LTSoftware,
  LTResponse,
  LanguageSwitchEvent,
  LTErrorCode,
} from './grammar.js';

export {
  LANGUAGE_TO_LT_CODE,
  LANGUAGE_DISPLAY_NAMES,
  LanguageToolError,
} from './grammar.js';

// ─── Legacy aliases (kept for backward compatibility with Phase 1 stubs) ──────

/**
 * @deprecated Use ProcessedSuggestion from grammar.ts
 */
export type Suggestion = import('./grammar.js').ProcessedSuggestion;

// ─── Platform Types (not in grammar.ts) ───────────────────────────────────────

export type Platform =
  | 'google-docs'
  | 'gmail'
  | 'linkedin'
  | 'notion'
  | 'wordpress'
  | 'generic';

export interface DOMTextNode {
  node: Text;
  startOffset: number;
}

export interface TextRange {
  startIndex: number;
  endIndex: number;
}

// ─── Message Types ────────────────────────────────────────────────────────────

export type MessageType =
  | 'CHECK_TEXT'
  | 'CHECK_TEXT_RESULT'
  | 'APPLY_FIX_GDOCS'
  | 'APPLY_FIX_RESULT'
  | 'GET_AUTH_TOKEN'
  | 'AUTH_TOKEN_RESULT'
  | 'GET_AUTH_STATUS'
  | 'APPLY_FIX_RESULT'
  | 'CHECK_GDOCS_DOCUMENT'
  | 'GDOCS_DOC_RESULT'
  | 'OPEN_SIDE_PANEL'
  | 'SUGGESTIONS_UPDATED'
  | 'TOGGLE_PANEL'
  | 'SWITCH_LANGUAGE'
  | 'JUMP_TO_ERROR'
  | 'SHOW_WORD_LOOKUP'
  | 'CLEAR_CACHE'
  | 'FIX_CURRENT'
  | 'NEXT_SUGGESTION'
  | 'PREV_SUGGESTION'
  | 'RECHECK_DOC';

export interface Message<T = unknown> {
  type: MessageType;
  payload?: T;
  error?: string;
}

// ─── Writing Intelligence ─────────────────────────────────────────────────────

export type ToneType =
  | 'professional'
  | 'casual'
  | 'academic'
  | 'persuasive'
  | 'friendly'
  | 'formal';

export interface ReadabilityScore {
  score: number;
  level: string;
  sentenceComplexity: 'low' | 'medium' | 'high';
  paragraphComplexity: 'low' | 'medium' | 'high';
}

export interface WritingIntelligence {
  readability: ReadabilityScore;
  detectedTone: ToneType;
  passiveVoiceCount: number;
  repeatedWords: string[];
  longSentences: number;
  wordyPhrases: string[];
}

// ─── User Preferences ─────────────────────────────────────────────────────────

export interface UserPreferences {
  language: SupportedLanguage;
  enabledCategories: SuggestionCategory[];
  groqApiKey?: string;
  dismissedRules: string[];
  onboardingComplete: boolean;
}
