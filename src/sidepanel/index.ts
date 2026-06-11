/**
 * GrammarLens — Side Panel
 *
 * Grammarly-style right-side panel.
 * Tabs: All | Correctness | Clarity | Engagement | Delivery
 * Suggestion cards, Wren & Martin explanations, bulk actions.
 */

import type { Suggestion } from '../types/index.js';

let suggestions: Suggestion[] = [];

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initBulkActions();
  loadSuggestions();
});

function initTabs(): void {
  const tabs = document.querySelectorAll<HTMLElement>('[data-tab]');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      filterSuggestions(tab.dataset['tab'] ?? 'all');
    });
  });
}

function initBulkActions(): void {
  // TODO: wire Fix All / Dismiss All / Recheck buttons
}

function loadSuggestions(): void {
  // TODO: request suggestions from content script / storage
  renderSuggestions(suggestions);
}

function filterSuggestions(category: string): void {
  const filtered = category === 'all'
    ? suggestions
    : suggestions.filter((s) => s.category === category);
  renderSuggestions(filtered);
}

function renderSuggestions(items: Suggestion[]): void {
  const container = document.getElementById('gl-suggestions-list');
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `<p class="gl-empty">No suggestions. Your writing looks great!</p>`;
    return;
  }

  container.innerHTML = items.map(renderCard).join('');

  // Attach click handlers
  container.querySelectorAll<HTMLElement>('[data-suggestion-id]').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.dataset['suggestionId'];
      if (id) onCardClick(id);
    });
  });
}

function renderCard(s: Suggestion): string {
  const dotColor = s.severity === 'error' ? '#ef4444'
    : s.category === 'clarity' ? '#7c3aed'
    : '#f97316';

  return `
    <div class="gl-card" data-suggestion-id="${s.id}" role="button" tabindex="0">
      <span class="gl-dot" style="background:${dotColor}"></span>
      <div class="gl-card-body">
        <span class="gl-error-word">${escapeHtml(s.errorText)}</span>
        <p class="gl-message">${escapeHtml(s.shortMessage)}</p>
      </div>
      <div class="gl-card-actions">
        <button class="gl-btn-fix" data-id="${s.id}">Fix</button>
        <button class="gl-btn-dismiss" data-id="${s.id}">Dismiss</button>
      </div>
    </div>`;
}

function onCardClick(id: string): void {
  chrome.runtime.sendMessage({ type: 'JUMP_TO_ERROR', payload: { id } });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export {};
