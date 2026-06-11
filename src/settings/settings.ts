/**
 * GrammarLens — Settings Page Controller
 *
 * Handles load/save/reset of user settings and populates
 * live diagnostics and performance data from chrome.storage.local.
 */

import {
  loadSettings,
  saveSettings,
  resetSettings,
  type GrammarLensSettings,
} from '../utils/settingsStore.js';

// ─── Storage keys (must match background/content scripts) ─────────────────────

const STORAGE_PERF_KEY   = 'gl_perf_metrics';
const STORAGE_ERROR_KEY  = 'gl_recent_errors';
const STORAGE_DIAG_KEY   = 'gl_diagnostics';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function showToast(message: string, durationMs = 2500): void {
  const toast = el<HTMLDivElement>('toast');
  toast.textContent = message;
  toast.classList.add('toast--visible');
  setTimeout(() => toast.classList.remove('toast--visible'), durationMs);
}

// ─── Load Settings into Form ──────────────────────────────────────────────────

async function populateForm(): Promise<void> {
  const settings = await loadSettings();

  (el<HTMLSelectElement>('language')).value       = settings.language;
  (el<HTMLInputElement>('autoCheck')).checked      = settings.autoCheck;
  (el<HTMLSelectElement>('checkInterval')).value   = String(settings.checkIntervalMs);
  (el<HTMLInputElement>('showWrenMartin')).checked = settings.showWrenMartin;
  (el<HTMLInputElement>('diagnosticsMode')).checked = settings.diagnosticsMode;

  // AI settings
  const ai = settings.ai;
  (el<HTMLInputElement>('aiEnabled')).checked  = ai.enabled;
  (el<HTMLInputElement>('aiGroqKey')).value    = ai.groqApiKey;
  (el<HTMLInputElement>('aiThreshold')).value  = String(ai.confidenceThreshold);
  loadAIDiagnostics();

  const colors = settings.highlightColors;
  setColorPicker('colorError',    colors.error);
  setColorPicker('colorSpelling', colors.spelling);
  setColorPicker('colorStyle',    colors.style);
  setColorPicker('colorClarity',  colors.clarity);
  setColorPicker('colorWarning',  colors.warning);
}

function setColorPicker(id: string, hex: string): void {
  const input = el<HTMLInputElement>(id);
  const label = el<HTMLSpanElement>(`${id}Hex`);
  input.value       = hex;
  label.textContent = hex;
}

// ─── Collect Form Values ──────────────────────────────────────────────────────

function collectForm(): GrammarLensSettings {
  return {
    language:        (el<HTMLSelectElement>('language')).value as GrammarLensSettings['language'],
    autoCheck:       (el<HTMLInputElement>('autoCheck')).checked,
    checkIntervalMs: parseInt((el<HTMLSelectElement>('checkInterval')).value, 10),
    showWrenMartin:  (el<HTMLInputElement>('showWrenMartin')).checked,
    diagnosticsMode: (el<HTMLInputElement>('diagnosticsMode')).checked,
    highlightColors: {
      error:    (el<HTMLInputElement>('colorError')).value,
      spelling: (el<HTMLInputElement>('colorSpelling')).value,
      style:    (el<HTMLInputElement>('colorStyle')).value,
      clarity:  (el<HTMLInputElement>('colorClarity')).value,
      warning:  (el<HTMLInputElement>('colorWarning')).value,
    },
    ai: {
      enabled:             (el<HTMLInputElement>('aiEnabled')).checked,
      groqApiKey:          (el<HTMLInputElement>('aiGroqKey')).value.trim(),
      confidenceThreshold: parseFloat((el<HTMLInputElement>('aiThreshold')).value) || 0.85,
    },
  };
}

// ─── Diagnostics ──────────────────────────────────────────────────────────────

function loadDiagnostics(): void {
  chrome.storage.local.get(
    [STORAGE_DIAG_KEY, STORAGE_PERF_KEY, STORAGE_ERROR_KEY],
    (result: Record<string, unknown>) => {
      renderDiagnostics(result[STORAGE_DIAG_KEY] as Record<string, unknown> | undefined);
      renderPerfTable(result[STORAGE_PERF_KEY] as Record<string, unknown> | undefined);
      renderErrorLog(result[STORAGE_ERROR_KEY] as Array<{timestamp:number; level:string; module:string; message:string}> | undefined);
    }
  );
}

function renderDiagnostics(data?: Record<string, unknown>): void {
  const oauth   = data?.authStatus as string | undefined;
  const account = data?.accountEmail as string | undefined;
  const docId   = data?.documentId as string | undefined;
  const chars   = data?.charCount as number | undefined;
  const sugs    = data?.suggestionCount as number | undefined;
  const lastMs  = data?.lastCheckMs as number | undefined;
  const errMsg  = data?.lastApiError as string | undefined;

  const authCell = el('diag-oauth');
  if (oauth === 'authenticated') {
    authCell.innerHTML = '<span class="badge-ok">✓ Connected</span>';
  } else if (oauth === 'unauthenticated') {
    authCell.innerHTML = '<span class="badge-error">✗ Not signed in</span>';
  } else {
    authCell.textContent = '—';
  }

  el('diag-account').textContent    = account ?? '—';
  el('diag-docid').textContent      = docId ? (docId.length > 24 ? docId.slice(0,22) + '…' : docId) : '—';
  el('diag-charcount').textContent  = chars != null ? `${chars.toLocaleString()} chars` : '—';
  el('diag-suggestions').textContent = sugs != null ? String(sugs) : '—';
  el('diag-lastcheck').textContent  = lastMs != null ? new Date(lastMs).toLocaleTimeString() : '—';

  const errCell = el('diag-error');
  if (errMsg) {
    errCell.innerHTML = `<span class="badge-error">${escHtml(errMsg)}</span>`;
  } else {
    errCell.innerHTML = '<span class="badge-ok">None</span>';
  }
}

function renderPerfTable(data?: Record<string, unknown>): void {
  const tbody = el<HTMLTableSectionElement>('perf-table-body');
  if (!data || Object.keys(data).length === 0) return;

  const rows: string[] = [];
  for (const [name, summary] of Object.entries(data)) {
    const s = summary as { lastMs: number; avgMs: number; minMs: number; maxMs: number; count: number };
    const status =
      s.avgMs < 500  ? 'badge-ok' :
      s.avgMs < 1500 ? 'badge-warn' : 'badge-error';

    rows.push(`<tr>
      <td class="label-col">${escHtml(name.replace(/_/g, ' '))}</td>
      <td class="${status}">${s.lastMs}</td>
      <td>${s.avgMs}</td>
      <td>${s.minMs}</td>
      <td>${s.maxMs}</td>
      <td>${s.count}</td>
    </tr>`);
  }
  tbody.innerHTML = rows.join('');
}

function renderErrorLog(entries?: Array<{timestamp:number; level:string; module:string; message:string}>): void {
  const viewer = el('log-viewer');
  if (!entries || entries.length === 0) {
    viewer.textContent = 'No errors logged.';
    return;
  }
  viewer.innerHTML = [...entries].reverse().map((e) => {
    const time  = new Date(e.timestamp).toLocaleTimeString();
    const level = e.level === 'error' ? 'log-entry-error'
                : e.level === 'warn'  ? 'log-entry-warn'
                : 'log-entry-info';
    return `<div class="${level}">[${time}] [${escHtml(e.module)}] ${escHtml(e.message)}</div>`;
  }).join('');
}

// ─── AI Diagnostics ───────────────────────────────────────────────────────────

function loadAIDiagnostics(): void {
  chrome.storage.local.get('gl_ai_diag', (result: Record<string, unknown>) => {
    const d = result['gl_ai_diag'] as {
      totalCalls?: number; cacheHits?: number;
      totalLatencyMs?: number; callCount?: number; fallbackUsed?: number;
    } | undefined;

    const set = (id: string, val: string): void => {
      const el_ = document.getElementById(id);
      if (el_) el_.textContent = val;
    };

    if (!d || !d.totalCalls) {
      set('diag-ai-calls',    '—');
      set('diag-ai-cache',    '—');
      set('diag-ai-latency',  '—');
      set('diag-ai-fallback', '—');
      return;
    }

    const avg = d.callCount && d.callCount > 0
      ? `${Math.round((d.totalLatencyMs ?? 0) / d.callCount)}ms`
      : '—';
    const hitPct = d.totalCalls > 0
      ? ` (${Math.round(((d.cacheHits ?? 0) / d.totalCalls) * 100)}%)`
      : '';

    set('diag-ai-calls',    String(d.totalCalls ?? 0));
    set('diag-ai-cache',    `${d.cacheHits ?? 0}${hitPct}`);
    set('diag-ai-latency',  avg);
    set('diag-ai-fallback', String(d.fallbackUsed ?? 0));
  });
}

// ─── Event Wiring ─────────────────────────────────────────────────────────────

function bindEvents(): void {
  // Color pickers: update hex label live
  ['colorError','colorSpelling','colorStyle','colorClarity','colorWarning'].forEach((id) => {
    el<HTMLInputElement>(id).addEventListener('input', (e) => {
      const val = (e.target as HTMLInputElement).value;
      el<HTMLSpanElement>(`${id}Hex`).textContent = val;
    });
  });

  // Save
  el('btn-save').addEventListener('click', async () => {
    const settings = collectForm();
    await saveSettings(settings);
    showToast('✓ Settings saved');
  });

  // Reset
  el('btn-reset').addEventListener('click', async () => {
    if (!confirm('Reset all settings to defaults?')) return;
    await resetSettings();
    await populateForm();
    showToast('Settings reset to defaults');
  });

  // Cancel — go back
  el('btn-cancel').addEventListener('click', () => {
    window.close();
  });

  // Refresh perf
  el('btn-refresh-perf').addEventListener('click', () => {
    loadDiagnostics();
    showToast('Metrics refreshed');
  });

  // Clear error log
  el('btn-clear-log').addEventListener('click', () => {
    chrome.storage.local.remove('gl_recent_errors', () => {
      el('log-viewer').textContent = 'No errors logged.';
      showToast('Error log cleared');
    });
  });

  // Test Groq API key
  el('btn-test-ai').addEventListener('click', async () => {
    const key = (el<HTMLInputElement>('aiGroqKey')).value.trim();
    if (!key) { showToast('Enter a Groq API key first'); return; }
    const btn = el<HTMLButtonElement>('btn-test-ai');
    btn.textContent = 'Testing…';
    btn.disabled    = true;
    try {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant', temperature: 0.1, max_tokens: 10,
          messages: [{ role: 'user', content: 'Reply: {"ok":true}' }],
        }),
      });
      if (resp.ok) { showToast('✓ Groq API key is valid'); }
      else         { showToast(`Key invalid: HTTP ${resp.status}`); }
    } catch (e) {
      showToast(`Connection failed: ${String(e).slice(0, 60)}`);
    } finally {
      btn.textContent = 'Test key';
      btn.disabled    = false;
    }
  });

  // Clear AI cache
  el('btn-clear-ai-cache').addEventListener('click', () => {
    chrome.storage.local.remove('gl_ai_cache', () => {
      showToast('AI cache cleared');
      loadAIDiagnostics();
    });
  });
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function escHtml(str: string): string {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  void populateForm();
  loadDiagnostics();
  bindEvents();
});

export {};
