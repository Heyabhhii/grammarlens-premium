/**
 * LanguageToolClient — Raw HTTP Layer
 *
 * Thin wrapper responsible only for making the HTTP call to LanguageTool.
 * All caching, debouncing, retry logic, and mapping lives in
 * src/services/languagetool.ts.
 *
 * This module is kept for direct use in contexts that need a single,
 * bare fetch without the full service overhead (e.g. unit tests).
 */

export { fetchRaw } from './ltHttpClient.js';
