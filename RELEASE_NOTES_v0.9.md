# GrammarLens Premium — Release Notes v0.9 (Beta)

**Release date:** June 2026  
**Build:** Development  
**Status:** Internal Beta

---

## What's new in v0.9

### Core features

- **Real-time grammar checking** via LanguageTool public API — checks 1.5 seconds after typing stops
- **Google Docs API integration** — applies fixes directly to your document via `batchUpdate`, no copy-pasting
- **Sequential fix queue** — multiple fixes execute one at a time, each fetching the latest document state before applying, preventing position corruption
- **Wren & Martin explanations** — 35 grammar rules mapped to chapter references, plain-English explanations, correct/incorrect examples, and difficulty levels (Beginner / Intermediate / Advanced)
- **8 language support** — English US/UK/AU, German, French, Spanish, Portuguese, Italian

### User interface

- **Grammarly-style sidebar** — slide-in panel with suggestion cards, category tabs (All / Correctness / Clarity / Engagement / Delivery), language selector
- **Suggestion cards** — expandable cards showing error text, grammar rule, Wren & Martin reference, and replacement options
- **Fix button** — applies correction via Google Docs API with toast confirmation
- **Bulk Fix Grammar / Fix Spelling** — fix all errors of a type in one action with progress feedback
- **Dismiss / Dismiss All** — hide suggestions you want to ignore
- **Toast notifications** — green success toast and red error toast after every fix operation
- **Diagnostics panel** — shows OAuth status, active Google account, document ID, and API errors

### Technical

- **Chrome MV3** compliant — uses service worker, no persistent background page
- **OAuth 2.0** via `chrome.identity.getAuthToken` — token cached in memory, auto-refreshes on 401
- **Canonical text pipeline** — grammar checks use the Google Docs API text (not DOM extraction), ensuring LT offsets and API indices always match
- **Document size protection** — documents over 20k characters show a size warning; over 50k are checked in paragraph-boundary chunks
- **SPA navigation handling** — detects Google Docs tab changes and reinitialises cleanly
- **Race condition protection** — generation counter discards stale check responses from concurrent requests

---

## Known limitations in v0.9

| Limitation | Detail |
|---|---|
| **No inline underlines** | Google Docs uses canvas rendering. Document text has no DOM text nodes so underlines cannot be positioned. Suggestions are shown in the sidebar only. |
| **OAuth required for Fix** | Grammar checking and suggestions work without sign-in. Applying fixes requires Google OAuth (Documents scope). |
| **Single-author fix safety** | If a collaborator edits the document between a grammar check and a fix click, the fix may land at the wrong position. |
| **LanguageTool public API limits** | The free public API allows ~20 requests/minute. Heavy use may trigger rate limiting (handled gracefully with retry). |
| **"cat cat cat" not flagged** | LanguageTool's repeated-word rule does not fire on all noun repetitions. Known LT behaviour. |
| **Google Workspace accounts** | OAuth consent screen must be configured for Workspace domains separately. |
| **Icons** | Current icons are minimal PNGs. Production-quality artwork needed before Chrome Web Store submission. |
| **Privacy policy** | A hosted URL is required for Chrome Web Store. The policy file is included but needs to be deployed. |

---

## Breaking changes from earlier builds

- Removed inline highlight engine (canvas mode incompatibility)
- Removed navigation manager (no highlight registry to navigate)
- `CHECK_GDOCS_DOCUMENT` now requires authentication; falls back to DOM text if auth unavailable
- Fix button no longer sends `APPLY_FIX` message — uses `adapter.requestFix()` with callback

---

## Before Chrome Web Store submission (remaining blockers)

1. **Host privacy policy** at a public URL and add it to the store listing
2. **Verify OAuth consent screen** with Google (or add test users for limited release)
3. **Create production icons** (128×128 minimum, 440×280 store tile recommended)
4. **Add store listing assets** — at least one 1280×800 screenshot
5. **Change `manifest.json` version** from `0.9.0` for release

---

## Tested on

- Chrome 124–148 (Windows 10)
- Google Docs with the new tabs UI (`?tab=t.0`)
- Documents up to ~5,000 words
- Grammar categories: subject-verb agreement, tense, articles, prepositions, spelling

---

## Credits

Developed by **Antier Solutions**  
Grammar rules: *High School English Grammar & Composition* — P.C. Wren & H. Martin  
Grammar engine: [LanguageTool](https://languagetool.org) (open-source, LGPL)
