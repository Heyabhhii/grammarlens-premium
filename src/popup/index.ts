/**
 * GrammarLens — Popup
 */

document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('gl-status');
  if (statusEl) statusEl.textContent = 'GrammarLens is active';

  document.getElementById('gl-settings')?.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('gl-open-panel')?.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) chrome.sidePanel.open({ tabId: tabs[0].id });
    });
  });
});

export {};
