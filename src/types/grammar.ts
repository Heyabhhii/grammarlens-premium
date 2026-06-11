/**
 * GrammarLens — Grammar Type Definitions
 *
 * All types related to grammar checking, LanguageTool API responses,
 * processed suggestions, caching, and error handling.
 */

// ─── Supported Languages ──────────────────────────────────────────────────────

export type SupportedLanguage =
  | 'en-US'
  | 'en-GB'
  | 'en-AU'
  | 'de'
  | 'fr'
  | 'es'
  | 'pt'
  | 'it';

/** Maps our language keys to LanguageTool API language codes */
export const LANGUAGE_TO_LT_CODE: Record<SupportedLanguage, string> = {
  'en-US': 'en-US',
  'en-GB': 'en-GB',
  'en-AU': 'en-AU',
  'de':    'de-DE',
  'fr':    'fr',
  'es':    'es',
  'pt':    'pt-PT',
  'it':    'it',
};

export const LANGUAGE_DISPLAY_NAMES: Record<SupportedLanguage, string> = {
  'en-US': 'English (US)',
  'en-GB': 'English (UK)',
  'en-AU': 'English (AU)',
  'de':    'German',
  'fr':    'French',
  'es':    'Spanish',
  'pt':    'Portuguese',
  'it':    'Italian',
};

// ─── Raw LanguageTool API Types ───────────────────────────────────────────────

export interface LTReplacement {
  value: string;
  shortDescription?: string;
}

export interface LTContext {
  text: string;
  /** Offset of the error within `context.text` */
  offset: number;
  length: number;
}

export interface LTRuleCategory {
  id: string;
  name: string;
}

export interface LTRuleUrl {
  value: string;
}

export interface LTRule {
  id: string;
  subId?: string;
  description: string;
  /** One of: grammar, misspelling, typographical, style, whitespace, uncategorized */
  issueType: string;
  category: LTRuleCategory;
  urls?: LTRuleUrl[];
  isPremium?: boolean;
}

export interface LTMatch {
  message: string;
  shortMessage: string;
  /** Byte offset in the submitted text */
  offset: number;
  length: number;
  replacements: LTReplacement[];
  context: LTContext;
  sentence?: string;
  rule: LTRule;
  ignoreForIncompleteSentence?: boolean;
  contextForSureMatch?: number;
}

export interface LTDetectedLanguage {
  name: string;
  code: string;
  confidence: number;
  source: string;
}

export interface LTLanguage {
  name: string;
  code: string;
  detectedLanguage?: LTDetectedLanguage;
}

export interface LTSoftware {
  name: string;
  version: string;
  buildDate: string;
  apiVersion: number;
  premium: boolean;
  premiumHint: string;
  status: string;
}

export interface LTResponse {
  software: LTSoftware;
  warnings?: { incompleteResults: boolean };
  language: LTLanguage;
  matches: LTMatch[];
}

// ─── Processed / Internal Suggestion Types ────────────────────────────────────

/** Broad display category shown in the side panel */
export type SuggestionCategory =
  | 'correctness'
  | 'clarity'
  | 'engagement'
  | 'delivery';

/** Visual indicator and sort weight */
export type SuggestionSeverity = 'error' | 'warning' | 'style';

/** Lifecycle state of a suggestion during a session */
export type SuggestionStatus =
  | 'new'
  | 'reviewed'
  | 'fixed'
  | 'dismissed'
  | 'ignored';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

export interface WrenMartinExplanation {
  rule: string;
  chapter: string;
  explanation: string;
  correctExample: string;
  incorrectExample: string;
  difficulty: DifficultyLevel;
}

export interface ProcessedReplacement {
  value: string;
  shortDescription: string;
}

export interface ProcessedSuggestion {
  id: string;
  /** Absolute character offset in the full document text */
  offset: number;
  length: number;
  /** The erroneous text slice */
  errorText: string;
  message: string;
  shortMessage: string;
  category: SuggestionCategory;
  severity: SuggestionSeverity;
  replacements: ProcessedReplacement[];
  status: SuggestionStatus;
  ruleId: string;
  ruleDescription: string;
  ltCategoryId: string;
  ltCategoryName: string;
  issueType: string;
  wrenMartin: WrenMartinExplanation | null;
  /** Source sentence for context */
  sentence: string;
  createdAt: number;
}

// ─── Check Request / Result ───────────────────────────────────────────────────

export interface CheckRequest {
  /** Full plain-text content to check */
  text: string;
  language: SupportedLanguage;
  /** Optional — used for cache keying per document */
  documentId?: string;
  /** If true, skip cache and force a fresh API call */
  forceRefresh?: boolean;
}

export interface CheckResult {
  suggestions: ProcessedSuggestion[];
  language: SupportedLanguage;
  /** Total character count checked */
  checkedLength: number;
  /** True if the result was served from cache */
  fromCache: boolean;
  /** API response time in ms (0 if cached) */
  latencyMs: number;
  checkedAt: number;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

export interface CacheEntry {
  result: CheckResult;
  /** Unix timestamp when this entry expires */
  expiry: number;
}

// ─── Error Types ──────────────────────────────────────────────────────────────

export type LTErrorCode =
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'MAX_RETRIES_EXCEEDED'
  | 'ABORTED';

export class LanguageToolError extends Error {
  constructor(
    public readonly code: LTErrorCode,
    message: string,
    public readonly httpStatus?: number,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'LanguageToolError';
  }
}

// ─── Language Switch Event ────────────────────────────────────────────────────

export interface LanguageSwitchEvent {
  previous: SupportedLanguage;
  next: SupportedLanguage;
}
