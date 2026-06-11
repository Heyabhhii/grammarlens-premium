/**
 * GrammarLens — LanguageSelector Component
 *
 * Renders a <label>/<select> pair for the 8 supported languages.
 * Persists the selection to chrome.storage.local and dispatches
 * a SWITCH_LANGUAGE message to the background service worker.
 */

import {
  LANGUAGE_DISPLAY_NAMES,
  LANGUAGE_TO_LT_CODE,
} from '../types/grammar.js';
import type { SupportedLanguage } from '../types/grammar.js';

// Ordered list for the dropdown
const LANGUAGE_OPTIONS: SupportedLanguage[] = [
  'en-US', 'en-GB', 'en-AU',
  'de', 'fr', 'es', 'pt', 'it',
];

const STORAGE_KEY = 'gl_language';

export class LanguageSelector {
  private select: HTMLSelectElement | null = null;
  private currentLanguage: SupportedLanguage = 'en-US';
  private readonly onChangeCb: (lang: SupportedLanguage) => void;

  constructor(onChangeCb: (lang: SupportedLanguage) => void) {
    this.onChangeCb = onChangeCb;
    this.loadStoredLanguage();
  }

  /**
   * Render the language selector into the given container element.
   * Safe to call multiple times — clears previous content first.
   */
  renderInto(container: HTMLElement): void {
    container.innerHTML = '';

    const label = document.createElement('label');
    label.className = 'gl-lang-label';
    label.htmlFor = 'gl-lang-select';
    label.textContent = 'Language:';

    this.select = document.createElement('select');
    this.select.id = 'gl-lang-select';
    this.select.className = 'gl-lang-select';
    this.select.setAttribute('aria-label', 'Select checking language');

    LANGUAGE_OPTIONS.forEach((code) => {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = LANGUAGE_DISPLAY_NAMES[code];
      option.selected = code === this.currentLanguage;
      this.select!.appendChild(option);
    });

    this.select.addEventListener('change', () => {
      const value = this.select!.value as SupportedLanguage;
      if (this.isValidLanguage(value)) {
        this.setLanguage(value);
      }
    });

    container.appendChild(label);
    container.appendChild(this.select);
  }

  /** Programmatically update the displayed language without firing onChange. */
  setLanguageDisplay(language: SupportedLanguage): void {
    this.currentLanguage = language;
    if (this.select) {
      this.select.value = language;
    }
  }

  getCurrentLanguage(): SupportedLanguage {
    return this.currentLanguage;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private setLanguage(language: SupportedLanguage): void {
    if (language === this.currentLanguage) return;
    this.currentLanguage = language;

    this.persistLanguage(language);

    // Notify the background service worker
    chrome.runtime.sendMessage(
      { type: 'SWITCH_LANGUAGE', payload: { language } },
      // Response is informational only; ignore errors here
      () => { void chrome.runtime.lastError; }
    );

    this.onChangeCb(language);
  }

  private loadStoredLanguage(): void {
    try {
      chrome.storage.local.get(STORAGE_KEY, (result: Record<string, unknown>) => {
        const stored = result[STORAGE_KEY] as string | undefined;
        if (stored && this.isValidLanguage(stored)) {
          this.currentLanguage = stored;
          if (this.select) this.select.value = stored;
        }
      });
    } catch {
      // chrome.storage unavailable (e.g. unit test context) — use default
    }
  }

  private persistLanguage(language: SupportedLanguage): void {
    try {
      chrome.storage.local.set({ [STORAGE_KEY]: language });
    } catch {
      // Ignore in non-extension contexts
    }
  }

  private isValidLanguage(value: string): value is SupportedLanguage {
    return value in LANGUAGE_TO_LT_CODE;
  }
}
