/**
 * GrammarLens — Performance Monitor
 *
 * Tracks timing for:
 *   grammar_check   — LT API round-trip (background)
 *   highlight_render — highlight span creation (content)
 *   navigation      — scroll + flash (content)
 *   fix_apply       — Google Docs API batchUpdate (background)
 *
 * Writes aggregated summaries to chrome.storage.local so the
 * settings page can display them without a live message channel.
 */

export interface PerfSample {
  durationMs: number;
  timestamp:  number;
}

export interface PerfSummary {
  count:  number;
  avgMs:  number;
  minMs:  number;
  maxMs:  number;
  lastMs: number;
}

const MAX_SAMPLES       = 50;
const STORAGE_PERF_KEY  = 'gl_perf_metrics';

export class PerformanceMonitor {
  private metrics = new Map<string, PerfSample[]>();

  /**
   * Start a timer. Returns a zero-argument function that stops it.
   * The stop function returns the elapsed milliseconds.
   */
  startTimer(name: string): () => number {
    const t0 = performance.now();
    return (): number => {
      const ms = Math.round(performance.now() - t0);
      this.record(name, ms);
      return ms;
    };
  }

  record(name: string, durationMs: number): void {
    const samples = this.metrics.get(name) ?? [];
    samples.push({ durationMs, timestamp: Date.now() });
    if (samples.length > MAX_SAMPLES) samples.shift();
    this.metrics.set(name, samples);
  }

  getSummary(name: string): PerfSummary | null {
    const samples = this.metrics.get(name);
    if (!samples || samples.length === 0) return null;
    const times = samples.map((s) => s.durationMs);
    return {
      count:  samples.length,
      avgMs:  Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      minMs:  Math.min(...times),
      maxMs:  Math.max(...times),
      lastMs: times[times.length - 1] ?? 0,
    };
  }

  getAllSummaries(): Record<string, PerfSummary> {
    const result: Record<string, PerfSummary> = {};
    for (const name of this.metrics.keys()) {
      const s = this.getSummary(name);
      if (s) result[name] = s;
    }
    return result;
  }

  /** Persist current summaries to storage for the settings page. */
  persistToStorage(): void {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage) return;
      chrome.storage.local.set({ [STORAGE_PERF_KEY]: this.getAllSummaries() });
    } catch { /* ignore */ }
  }

  reset(): void {
    this.metrics.clear();
  }
}

/** Shared singleton. */
export const perfMonitor = new PerformanceMonitor();
