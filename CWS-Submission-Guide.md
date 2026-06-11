# GrammarLens Premium — Chrome Web Store Submission Guide

## Pre-submission Checklist

- [x] manifest.json is MV3
- [x] No unused permissions (`scripting` removed)
- [x] Icons: 16, 32, 48, 128px
- [x] Privacy policy HTML exists (`public/privacy-policy.html`)
- [x] Single purpose: grammar/spelling correction for Google Docs
- [x] ZIP built: `GrammarLens-v1.0.0-cws.zip` (48KB, no source maps)

---

## Store Listing Copy

### Name
```
GrammarLens Premium
```

### Short Description (≤132 chars)
```
Free grammar, spelling & style checker for Google Docs. AI-powered corrections with Wren & Martin explanations.
```
*(112 chars)*

### Detailed Description
```
GrammarLens Premium is a free, production-grade writing assistant built exclusively for Google Docs.

✦ WHAT IT DOES
• Checks grammar and spelling using LanguageTool (3,000+ rules)
• Applies context-aware AI corrections via Groq (optional — bring your own free API key)
• Catches errors Grammarly misses with 22+ custom grammar rules (e.g. "discuss about", "less/fewer", redundant words)
• Explains every suggestion in plain English — including Wren & Martin–style grammar rules
• Fix individual issues or click "Fix All Grammar" / "Fix All Spelling" in one tap

✦ HOW IT WORKS
GrammarLens reads your Google Doc text, checks it against LanguageTool's public API, and shows suggestions in a clean sidebar panel — no copy-paste required. Fixes are applied directly to your document via the Google Docs API.

✦ AI MODE (OPTIONAL)
Add a free Groq API key in Settings to enable AI-powered context corrections. The AI understands what word you *meant* to type — not just the nearest spelling match.

✦ PRIVACY
• Your text is sent to LanguageTool's public API (languagetool.org) for grammar checking
• AI mode sends text to Groq's API only when you provide your own API key
• No data is stored on our servers — we have no backend
• Google OAuth is used only to apply fixes via the official Docs API
• Full privacy policy: [your hosted URL here]

✦ PERMISSIONS EXPLAINED
• Google Docs access: required to read document text and apply fixes
• Storage: saves your settings and AI cache locally on your device
• Identity: used for Google sign-in to authenticate with the Docs API

✦ FREE & OPEN
No subscription. No paywall. No ads.
```

---

## Permission Justifications
*(Required in the CWS Developer Dashboard under "Privacy" tab)*

| Permission | Justification |
|---|---|
| `storage` | Stores user settings (language, AI key, confidence threshold) and AI response cache locally. No data leaves the device via this permission. |
| `identity` | Used to obtain a Google OAuth token so the extension can authenticate with the Google Docs API and apply text fixes on the user's behalf. |
| `activeTab` | Required to open the settings page when the user clicks the settings link in the popup. |
| `sidePanel` | Opens the GrammarLens suggestion panel in Chrome's native side panel UI. |
| `contextMenus` | Adds a "Check with GrammarLens" right-click menu item for quick access. |

**Host permissions:**
| Host | Justification |
|---|---|
| `https://docs.google.com/*` | Extension runs on Google Docs pages only |
| `https://api.languagetool.org/*` | Grammar checking API (public, no key required) |
| `https://docs.googleapis.com/*` | Google Docs API — reads document content and applies fixes |
| `https://www.googleapis.com/*` | Google user profile API — used for sign-in display name/email |
| `https://api.groq.com/*` | AI correction API — only called when user provides their own API key |

---

## Single Purpose Statement
*(Required field in CWS dashboard)*
```
GrammarLens Premium checks grammar, spelling, and style in Google Docs and applies corrections directly to the document via the Google Docs API.
```

---

## Required Assets to Prepare

### Screenshots (required: min 1, max 5 — 1280×800 or 640×400 px)
Suggested shots to take:
1. **Panel open** — sidebar showing 3–4 suggestions on a doc with realistic text
2. **Fix applied** — toast notification "✓ Fixed" visible
3. **Settings page** — showing language selector + Groq API key field
4. **AI correction** — suggestion card showing AI-corrected word with explanation
5. **Fix All in action** — bulk fix button highlighted

### Promotional Images (optional but recommended)
- Small promo tile: **440×280 px**
- Marquee: **1400×560 px**

### Privacy Policy URL
Host `public/privacy-policy.html` at a public URL (GitHub Pages, Vercel, etc.) and paste that URL into the CWS Privacy tab.

**Quick option — GitHub Pages:**
1. Push the repo to GitHub
2. Enable Pages on the `main` branch
3. Privacy policy URL will be: `https://<username>.github.io/<repo>/public/privacy-policy.html`

---

## Submission Steps

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Pay one-time $5 developer registration fee (if not already done)
3. Click **Add new item** → upload `GrammarLens-v1.0.0-cws.zip`
4. Fill in Store Listing tab (name, descriptions, screenshots)
5. Fill in Privacy tab (privacy policy URL, permission justifications)
6. Fill in Distribution tab (all regions, no age rating needed)
7. Click **Submit for review** — typical review time: 1–3 business days

---

## Post-Submission

- CWS review checks for policy violations, unused permissions, and data use
- If rejected, the most common reason is missing/vague permission justifications — the table above covers this
- Version bump for updates: change `"version"` in `manifest.json`, rebuild ZIP, upload as new version
