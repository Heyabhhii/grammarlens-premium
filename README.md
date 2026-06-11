# GrammarLens Premium

> Free, production-grade grammar and spelling checker for Google Docs — with optional AI-powered corrections.

![Version](https://img.shields.io/badge/version-1.0.0-7c3aed)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

- **Real-time grammar & spelling** — powered by LanguageTool (3,000+ rules)
- **22+ custom grammar rules** — catches errors LanguageTool misses (fewer/less, discuss about, irregardless, etc.)
- **AI context engine** — optional Groq API key enables sentence-aware corrections (figures out *choosing* vs *chasing* from context)
- **One-click fixes** — applies corrections directly via the Google Docs API, no copy-paste
- **Bulk fix** — Fix All Grammar / Fix All Spelling buttons
- **Dismiss & remember** — dismiss false positives; they never come back
- **Plain-English explanations** — every suggestion explains the grammar rule

## Installation

### From Chrome Web Store *(recommended)*
[Install GrammarLens Premium](#) ← update after publishing

### From source
```bash
git clone https://github.com/YOUR_USERNAME/grammarlens-premium.git
cd grammarlens-premium
npm install
npm run build
```
Then load `dist/` as an unpacked extension in `chrome://extensions`.

## Setup

1. Open a Google Doc
2. Click the **GL** icon in the toolbar → sign in with Google
3. The suggestion panel opens automatically as you type

### Enable AI Mode (optional)
1. Click the ⚙ icon → Settings
2. Paste your free [Groq API key](https://console.groq.com) (`gsk_...`)
3. Toggle **AI Context Engine** on

## Tech Stack

| Layer | Technology |
|---|---|
| Extension | Chrome MV3, TypeScript, Webpack |
| Grammar engine | LanguageTool public API |
| Custom rules | 22-rule regex engine |
| AI corrections | Groq (llama-3.1-8b-instant) |
| Doc integration | Google Docs API v1 + OAuth2 |
| UI | Shadow DOM panel, no React |

## Project Structure

```
src/
├── background/     # Service worker — orchestrates all API calls
├── content/        # Content script — runs inside Google Docs
├── panel/          # Sidebar UI (Shadow DOM)
├── services/       # LanguageTool, Groq, Google Docs API, custom rules
├── settings/       # Options page
├── types/          # Shared TypeScript types
└── utils/          # Logger, settings store, best-replacement
```

## Privacy

- Document text is sent to **LanguageTool's public API** for grammar checking
- AI mode sends text to **Groq** only when you provide your own API key
- No backend — nothing is stored on our servers
- Google OAuth is used only to apply fixes via the official Docs API
- Full privacy policy: `public/privacy-policy.html`

## License

MIT — see [LICENSE](LICENSE)

---

Built by [Antier Solutions](https://antiersolutions.com)
