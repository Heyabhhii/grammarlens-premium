/**
 * GrammarLens — Settings Store
 *
 * Single source of truth for all user-configurable settings.
 * Uses chrome.storage.sync so settings roam across devices.
 */

export type SupportedLanguage =
  | 'en-US' | 'en-GB' | 'en-AU'
  | 'de' | 'fr' | 'es' | 'pt' | 'it';

export interface HighlightColors {
  error:    string;  // solid underline — grammar/misspelling
  spelling: string;  // dotted underline — misspelling only
  style:    string;  // solid underline — style issues
  clarity:  string;  // solid underline — clarity/engagement
  warning:  string;  // solid underline — non-critical
}

export interface AISettings {
  /** Enable Groq AI context corrections */
  enabled:             boolean;
  /** Groq API key (stored in sync; user-provided) */
  groqApiKey:          string;
  /** Minimum AI confidence to accept the correction (0.0–1.0) */
  confidenceThreshold: number;
}

export interface GrammarLensSettings {
  /** BCP-47 language code sent to LanguageTool */
  language:         SupportedLanguage;
  /** Trigger grammar check automatically after typing stops */
  autoCheck:        boolean;
  /** Milliseconds of typing silence before the check fires */
  checkIntervalMs:  number;
  /** Show extra diagnostic information in the sidebar panel */
  diagnosticsMode:  boolean;
  /** Show Wren & Martin chapter references in suggestion cards */
  showWrenMartin:   boolean;
  /** Custom highlight underline colours (CSS hex strings) */
  highlightColors:  HighlightColors;
  /** AI context correction settings */
  ai:               AISettings;
}

export const DEFAULT_SETTINGS: GrammarLensSettings = {
  language:        'en-US',
  autoCheck:       true,
  checkIntervalMs: 1500,
  diagnosticsMode: false,
  showWrenMartin:  true,
  highlightColors: {
    error:    '#ef4444',
    spelling: '#ef4444',
    style:    '#7c3aed',
    clarity:  '#3b82f6',
    warning:  '#f97316',
  },
  ai: {
    enabled:             false,    // Off by default — user must opt in + provide key
    groqApiKey:          '',
    confidenceThreshold: 0.85,
  },
};

const STORAGE_KEY = 'gl_settings';

/** Load settings from chrome.storage.sync, merging with defaults. */
export function loadSettings(): Promise<GrammarLensSettings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(STORAGE_KEY, (result: Record<string, unknown>) => {
      const stored = result[STORAGE_KEY] as Partial<GrammarLensSettings> | undefined;
      if (!stored) {
        resolve({ ...DEFAULT_SETTINGS });
        return;
      }
      resolve({
        ...DEFAULT_SETTINGS,
        ...stored,
        highlightColors: {
          ...DEFAULT_SETTINGS.highlightColors,
          ...(stored.highlightColors ?? {}),
        },
        ai: {
          ...DEFAULT_SETTINGS.ai,
          ...(stored.ai ?? {}),
        },
      });
    });
  });
}

/** Persist settings to chrome.storage.sync. */
export function saveSettings(settings: GrammarLensSettings): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: settings }, resolve);
  });
}

/** Reset settings to factory defaults. */
export function resetSettings(): Promise<void> {
  return saveSettings({ ...DEFAULT_SETTINGS });
}
