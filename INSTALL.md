# GrammarLens Premium — Installation Guide

---

## Prerequisites

- Google Chrome (version 109 or newer)
- A Google account
- Node.js 18+ and npm 9+ (only needed if you want to rebuild from source)

---

## Option A — Load the pre-built extension (quickest)

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Navigate to your `GrammarLens` folder and select the **`dist`** subfolder
5. GrammarLens Premium should now appear in your extension list

---

## Option B — Build from source then load

```bash
# 1. Navigate to the project folder
cd Desktop/GrammarLens

# 2. Install dependencies
npm install

# 3. Build the extension
npm run build:dev

# 4. Load in Chrome
# chrome://extensions → Load unpacked → select the dist/ folder
```

---

## Setting up Google OAuth (required for Fix button)

The Fix button writes corrections directly to your Google Doc via the Google Docs API. This requires OAuth authentication.

### Step 1 — Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **New Project** → name it `GrammarLens` → click **Create**

### Step 2 — Enable Google Docs API

1. Go to **APIs & Services** → **Library**
2. Search for **Google Docs API** → click **Enable**

### Step 3 — Create OAuth credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **OAuth client ID**
3. If prompted, configure the **OAuth consent screen** first:
   - User type: **External**
   - App name: `GrammarLens`
   - Fill in your email for support and developer contact
   - Click through remaining steps
4. Back on Create OAuth client ID:
   - Application type: **Chrome Extension**
   - Name: `GrammarLens`
   - Extension ID: find this at `chrome://extensions` under your loaded extension
5. Click **Create** → copy the **Client ID**

### Step 4 — Add Client ID to manifest

Open `dist/manifest.json` (and `manifest.json` in the root), find:

```json
"client_id": "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"
```

Replace with your actual Client ID. Then reload the extension at `chrome://extensions`.

### Step 5 — Sign in

1. Open any Google Doc
2. Click the purple **GL button** (bottom-right)
3. Expand **GRAMMARLENS STATUS** at the bottom of the panel
4. Click **Sign in with Google**

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Alt + G` | Open / close suggestion panel |
| `Alt + N` | Next suggestion |
| `Alt + P` | Previous suggestion |
| `Alt + R` | Recheck document |

---

## Settings

Right-click the GrammarLens toolbar icon → **Options** (or click **Settings** in the popup) to open the settings page. You can configure:

- Checking language
- Auto-check on/off
- Check delay
- Wren & Martin explanations on/off
- Custom highlight colours (for future use)

---

## Rebuilding after code changes

```bash
cd Desktop/GrammarLens
npm run build:dev
```

Then go to `chrome://extensions` and click the **reload ↺** button on GrammarLens.

> **Note:** After every rebuild, if Chrome reports path errors, open `dist/manifest.json` and verify `"service_worker": "background.js"` and `"js": ["content.js"]` (without the `dist/` prefix).

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Extension won't load ("too many shortcuts") | Open `dist/manifest.json`, remove `"suggested_key"` from `"fix-current"` |
| Extension won't load ("could not load javascript") | Open `dist/manifest.json`, change `dist/content.js` → `content.js` and `dist/background.js` → `background.js` |
| No suggestions appear | Open DevTools (F12) on the Google Doc and check the Console for `[GL:CONTENT]` logs |
| Fix button does nothing | Ensure you are signed in (check GRAMMARLENS STATUS in the panel) |
| "Google Docs API not enabled" error | Follow Step 2 above to enable the API in Google Cloud Console |
| "Not authenticated" error | Click Sign in with Google in the diagnostics panel |
