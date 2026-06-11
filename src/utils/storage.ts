/**
 * Storage utilities
 * Wraps chrome.storage.local with typed helpers and promise-based API.
 */

import type { UserPreferences } from '../types/index.js';

const PREFS_KEY = 'gl_preferences';
const TOKEN_KEY = 'gl_oauth_token';

const DEFAULT_PREFS: UserPreferences = {
  language: 'en-US',
  enabledCategories: ['correctness', 'clarity', 'engagement', 'delivery'],
  dismissedRules: [],
  onboardingComplete: false,
};

export async function getPreferences(): Promise<UserPreferences> {
  return new Promise((resolve) => {
    chrome.storage.local.get(PREFS_KEY, (result) => {
      const stored = result[PREFS_KEY] as Partial<UserPreferences> | undefined;
      resolve({ ...DEFAULT_PREFS, ...stored });
    });
  });
}

export async function setPreferences(
  prefs: Partial<UserPreferences>
): Promise<void> {
  const current = await getPreferences();
  return new Promise((resolve) => {
    chrome.storage.local.set({ [PREFS_KEY]: { ...current, ...prefs } }, resolve);
  });
}

export async function getOAuthToken(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(TOKEN_KEY, (result) => {
      resolve((result[TOKEN_KEY] as string | undefined) ?? null);
    });
  });
}

export async function setOAuthToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [TOKEN_KEY]: token }, resolve);
  });
}

export async function clearOAuthToken(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(TOKEN_KEY, resolve);
  });
}
