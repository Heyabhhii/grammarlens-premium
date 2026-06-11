/**
 * ltHttpClient — Bare LanguageTool HTTP fetch
 *
 * Single-responsibility module: one function, one job.
 * No caching, no retries, no debounce — that all lives in the service layer.
 */

import type { LTResponse } from '../types/grammar.js';

const LT_API_URL     = 'https://api.languagetool.org/v2/check';
const REQUEST_TIMEOUT = 8000;

/**
 * Send a single, raw POST request to the LanguageTool API.
 * Throws on non-2xx status or network failure.
 *
 * @param text        Plain text to check
 * @param ltLanguage  LanguageTool language code (e.g. "en-US", "de-DE")
 * @param signal      Optional AbortSignal from the caller
 */
export async function fetchRaw(
  text: string,
  ltLanguage: string,
  signal?: AbortSignal
): Promise<LTResponse> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT);

  const combined = combineSignals(
    [signal, timeoutController.signal].filter((s): s is AbortSignal => s !== undefined)
  );

  try {
    const body = new URLSearchParams({
      text,
      language:    ltLanguage,
      enabledOnly: 'false',
      level:       'default',
    });

    const response = await fetch(LT_API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
      signal:  combined,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`LT HTTP ${response.status}: ${await response.text()}`);
    }

    return response.json() as Promise<LTResponse>;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/** Merge multiple AbortSignals into one (fires when any fires). */
function combineSignals(signals: AbortSignal[]): AbortSignal {
  if (signals.length === 0) return new AbortController().signal;
  if (signals.length === 1) return signals[0]!;

  const controller = new AbortController();
  const abort = (): void => controller.abort();

  for (const s of signals) {
    if (s.aborted) {
      controller.abort();
      break;
    }
    s.addEventListener('abort', abort, { once: true });
  }

  return controller.signal;
}
