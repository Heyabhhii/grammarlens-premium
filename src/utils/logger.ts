/**
 * GrammarLens — Structured Logger
 *
 * Levels: info | warn | error
 * - info/warn only output to console when diagnosticsMode is enabled
 * - error always outputs to console (never silenced)
 * - All entries buffered in memory (last 200) for the diagnostics panel
 * - Writes recent errors to chrome.storage.local so the settings page can read them
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp:  number;
  level:      LogLevel;
  module:     string;
  message:    string;
  data?:      unknown;
}

const MAX_BUFFER        = 200;
const STORAGE_ERROR_KEY = 'gl_recent_errors';
const MAX_STORED_ERRORS = 20;

export class Logger {
  private buffer:          LogEntry[] = [];
  private diagnosticsMode  = false;

  // ── Configuration ──────────────────────────────────────────────────────────

  setDiagnosticsMode(enabled: boolean): void {
    this.diagnosticsMode = enabled;
  }

  // ── Logging ────────────────────────────────────────────────────────────────

  info(module: string, message: string, data?: unknown): void {
    this.append('info', module, message, data);
    if (this.diagnosticsMode) {
      console.log(`[GL:${module}]`, message, data ?? '');
    }
  }

  warn(module: string, message: string, data?: unknown): void {
    this.append('warn', module, message, data);
    if (this.diagnosticsMode) {
      console.warn(`[GL:${module}]`, message, data ?? '');
    }
  }

  error(module: string, message: string, data?: unknown): void {
    this.append('error', module, message, data);
    // Errors always surface to the console regardless of diagnostics mode
    console.error(`[GL:${module}]`, message, data ?? '');
    this.persistError(module, message, data);
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  getLogs(): ReadonlyArray<LogEntry> {
    return [...this.buffer];
  }

  getByLevel(level: LogLevel): LogEntry[] {
    return this.buffer.filter((e) => e.level === level);
  }

  getLastError(): LogEntry | null {
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      const e = this.buffer[i];
      if (e?.level === 'error') return e;
    }
    return null;
  }

  getLastN(n: number): LogEntry[] {
    return this.buffer.slice(-n);
  }

  clearLogs(): void {
    this.buffer = [];
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private append(level: LogLevel, module: string, message: string, data?: unknown): void {
    const entry: LogEntry = { timestamp: Date.now(), level, module, message };
    if (data !== undefined) entry.data = data;

    this.buffer.push(entry);
    if (this.buffer.length > MAX_BUFFER) this.buffer.shift();
  }

  private persistError(module: string, message: string, data?: unknown): void {
    // Best-effort write to storage for settings page to display
    try {
      if (typeof chrome === 'undefined' || !chrome.storage) return;
      chrome.storage.local.get(STORAGE_ERROR_KEY, (result: Record<string, unknown>) => {
        const stored = (result[STORAGE_ERROR_KEY] as LogEntry[] | undefined) ?? [];
        stored.push({ timestamp: Date.now(), level: 'error', module, message, data });
        if (stored.length > MAX_STORED_ERRORS) stored.splice(0, stored.length - MAX_STORED_ERRORS);
        chrome.storage.local.set({ [STORAGE_ERROR_KEY]: stored });
      });
    } catch { /* ignore storage errors in settings page context */ }
  }
}

/** Shared singleton — import this everywhere rather than constructing new instances. */
export const logger = new Logger();
