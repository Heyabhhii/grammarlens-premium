/**
 * GrammarLens — SuggestionCard Component
 *
 * Creates a fully interactive suggestion card element for injection into
 * the sidebar's Shadow DOM. Cards support expand/collapse, Wren & Martin
 * explanations, replacement chips, and fix/dismiss actions.
 *
 * Returns a raw HTMLElement — no framework, no external dependencies.
 */

import type { ProcessedSuggestion, SuggestionSeverity, SuggestionCategory } from '../types/grammar.js';
import { bestReplacement } from '../utils/bestReplacement.js';

// ─── Public API ───────────────────────────────────────────────────────────────

export interface CardCallbacks {
  onFix:     (id: string, replacement: string) => void;
  onDismiss: (id: string) => void;
  onExpand:  (id: string) => void;
}

/**
 * Build and return a suggestion card <div> ready to be inserted into the
 * Shadow DOM suggestion list.
 */
export function createSuggestionCard(
  suggestion: ProcessedSuggestion,
  callbacks: CardCallbacks
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'gl-card';
  card.dataset['suggestionId'] = suggestion.id;

  // Build collapsed header row
  card.appendChild(buildHeader(suggestion));

  // Build expandable body
  card.appendChild(buildBody(suggestion, callbacks));

  // Toggle expand on header click
  const header = card.querySelector<HTMLElement>('.gl-card-header');
  if (header) {
    header.addEventListener('click', (e) => {
      // Don't toggle if the user clicked a button inside the header
      if ((e.target as HTMLElement).closest('button')) return;
      toggleExpand(card);
    });

    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleExpand(card);
      }
    });
  }

  return card;
}

// ─── Header (always visible) ──────────────────────────────────────────────────

function buildHeader(s: ProcessedSuggestion): HTMLElement {
  const header = document.createElement('div');
  header.className = 'gl-card-header';
  header.setAttribute('role', 'button');
  header.setAttribute('tabindex', '0');
  header.setAttribute('aria-expanded', 'false');
  header.setAttribute('aria-label', `${s.errorText}: ${s.shortMessage}`);

  // Dot indicator
  const dot = document.createElement('span');
  dot.className = `gl-card-dot ${dotClass(s.severity, s.category)}`;
  dot.setAttribute('aria-hidden', 'true');

  // Summary text
  const summary = document.createElement('div');
  summary.className = 'gl-card-summary';

  const errorText = document.createElement('span');
  errorText.className = 'gl-card-error-text';
  errorText.textContent = s.errorText;

  const msg = document.createElement('div');
  msg.className = 'gl-card-message';
  msg.textContent = s.shortMessage;
  msg.title = s.shortMessage;

  summary.appendChild(errorText);
  summary.appendChild(msg);

  // Chevron icon
  const chevron = document.createElement('span');
  chevron.className = 'gl-card-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>`;

  header.appendChild(dot);
  header.appendChild(summary);
  header.appendChild(chevron);

  return header;
}

// ─── Body (revealed on expand) ────────────────────────────────────────────────

function buildBody(s: ProcessedSuggestion, callbacks: CardCallbacks): HTMLElement {
  const body = document.createElement('div');
  body.className = 'gl-card-body';
  body.setAttribute('aria-hidden', 'true');

  const inner = document.createElement('div');
  inner.className = 'gl-card-body-inner';

  // Full message
  if (s.message !== s.shortMessage) {
    const fullMsg = document.createElement('p');
    fullMsg.className = 'gl-card-full-message';
    fullMsg.textContent = s.message;
    inner.appendChild(fullMsg);
  }

  // Wren & Martin block
  if (s.wrenMartin) {
    inner.appendChild(buildWrenMartin(s));
  }

  // Replacement chips
  if (s.replacements.length > 0) {
    inner.appendChild(buildReplacements(s, callbacks));
  }

  // Fix / Dismiss actions
  inner.appendChild(buildActions(s, callbacks));

  body.appendChild(inner);
  return body;
}

function buildWrenMartin(s: ProcessedSuggestion): HTMLElement {
  const wm = s.wrenMartin!;

  const block = document.createElement('div');
  block.className = 'gl-wm-block';

  const chapter = document.createElement('div');
  chapter.className = 'gl-wm-chapter';
  chapter.textContent = wm.chapter;

  const rule = document.createElement('div');
  rule.className = 'gl-wm-rule';
  rule.textContent = wm.rule;

  const explanation = document.createElement('p');
  explanation.className = 'gl-wm-explanation';
  explanation.textContent = wm.explanation;

  const examples = document.createElement('div');
  examples.className = 'gl-wm-examples';

  const correct = document.createElement('div');
  correct.className = 'gl-wm-example gl-wm-example--correct';
  correct.textContent = `✓ ${wm.correctExample}`;

  const wrong = document.createElement('div');
  wrong.className = 'gl-wm-example gl-wm-example--wrong';
  wrong.textContent = `✗ ${wm.incorrectExample}`;

  examples.appendChild(correct);
  examples.appendChild(wrong);

  const difficulty = document.createElement('span');
  difficulty.className = `gl-difficulty gl-difficulty--${wm.difficulty}`;
  difficulty.textContent = wm.difficulty.charAt(0).toUpperCase() + wm.difficulty.slice(1);

  block.appendChild(chapter);
  block.appendChild(rule);
  block.appendChild(explanation);
  block.appendChild(examples);
  block.appendChild(difficulty);

  return block;
}

function buildReplacements(s: ProcessedSuggestion, callbacks: CardCallbacks): HTMLElement {
  const container = document.createElement('div');
  container.className = 'gl-replacements';

  const label = document.createElement('span');
  label.className = 'gl-replacement-label';
  label.textContent = 'Suggestions:';
  container.appendChild(label);

  // Show up to 5 replacements to keep the card readable
  s.replacements.slice(0, 5).forEach((rep) => {
    const chip = document.createElement('button');
    chip.className = 'gl-replacement-chip';
    chip.textContent = rep.value;
    chip.title = rep.shortDescription || rep.value;
    chip.setAttribute('aria-label', `Apply "${rep.value}"`);
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      callbacks.onFix(s.id, rep.value);
    });
    container.appendChild(chip);
  });

  return container;
}

function buildActions(s: ProcessedSuggestion, callbacks: CardCallbacks): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'gl-card-actions';

  // Use bestReplacement to avoid LT ranking issues (e.g. "The's" before "This")
  const firstReplacement = bestReplacement(s.errorText, s.replacements);

  const fixBtn = document.createElement('button');
  fixBtn.className = 'gl-btn gl-btn--fix';
  fixBtn.textContent = firstReplacement ? `Fix: "${firstReplacement}"` : 'Fix';
  fixBtn.setAttribute('aria-label', `Fix: replace with "${firstReplacement}"`);
  if (!firstReplacement) fixBtn.disabled = true;
  fixBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (firstReplacement) callbacks.onFix(s.id, firstReplacement);
  });

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'gl-btn gl-btn--dismiss';
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.setAttribute('aria-label', 'Dismiss this suggestion');
  dismissBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    callbacks.onDismiss(s.id);
  });

  actions.appendChild(fixBtn);
  actions.appendChild(dismissBtn);

  return actions;
}

// ─── Expand / Collapse ────────────────────────────────────────────────────────

function toggleExpand(card: HTMLElement): void {
  const isExpanded = card.classList.contains('gl-card--expanded');
  const header     = card.querySelector<HTMLElement>('.gl-card-header');
  const body       = card.querySelector<HTMLElement>('.gl-card-body');

  card.classList.toggle('gl-card--expanded', !isExpanded);

  if (header) header.setAttribute('aria-expanded', String(!isExpanded));
  if (body)   body.setAttribute('aria-hidden',     String(isExpanded));
}

export function collapseCard(card: HTMLElement): void {
  card.classList.remove('gl-card--expanded');
  const header = card.querySelector<HTMLElement>('.gl-card-header');
  const body   = card.querySelector<HTMLElement>('.gl-card-body');
  if (header) header.setAttribute('aria-expanded', 'false');
  if (body)   body.setAttribute('aria-hidden', 'true');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dotClass(severity: SuggestionSeverity, category: SuggestionCategory): string {
  if (severity === 'error')   return 'gl-card-dot--error';
  if (category === 'clarity') return 'gl-card-dot--clarity';
  if (category === 'engagement') return 'gl-card-dot--engagement';
  if (category === 'delivery')   return 'gl-card-dot--delivery';
  return 'gl-card-dot--warning';
}
