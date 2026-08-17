# Alterer — Smart Download Organizer

Alterer is a Chrome extension that automatically renames and organizes your downloads into folders, using context from the page you downloaded from and rules you control. It runs entirely on your device — no accounts, no backend, no network calls, and no data ever leaves your browser.

---

## What it does

Every time a download starts, Alterer:

1. Looks at the page and context the download came from (search query, video title, repository name, etc.)
2. Checks your rules and folder mappings to decide where the file belongs
3. Generates a clean, safe filename if a rule asks for one
4. Handles duplicate names automatically, according to your chosen strategy
5. Saves the file straight into the right folder inside your Downloads directory

If nothing matches, the file is left exactly as Chrome would normally save it — Alterer never blocks or interferes with a download that it doesn't have a rule for.

### Example

| Site | Original filename | Result |
|---|---|---|
| Google Images search for "dog" | `a1b2c3.jpg` | `Downloads/Images/dog.jpg` |
| Google Images search for "cute golden retriever puppy" | `x9f8e7.jpg` | `Downloads/Images/cute_golden_retriever_puppy.jpg` |
| GitHub repo `facebook/react` | `react-main.zip` | `Downloads/GitHub/react.zip` |
| LeetCode problem "Two Sum" | `solution.cpp` | `Downloads/LeetCode/Two_Sum.cpp` |
| College portal PDF | `DBMS_Final_Notes.pdf` | `Downloads/PDFs/DBMS_Final_Notes.pdf` |
| Unrecognized file type | `randomfile.exe` | `Downloads/randomfile.exe` (untouched) |

Duplicate downloads are numbered automatically: `dog.jpg` → `dog (1).jpg` → `dog (2).jpg`.

---

## Features

- **Automatic organization** by file type (Images, PDFs, Videos, Music, Archives, Code, Documents, and more)
- **Site-aware rules** for Google Images, YouTube, GitHub, LeetCode, and Reddit out of the box
- **Custom rule builder** — define your own `WHEN <website/file type> THEN <rename + folder>` rules
- **Editable folder mapping** — change or add extension → folder destinations at any time
- **Smart duplicate handling** — choose between `name (1).ext`, `name_1.ext`, keep original, or overwrite
- **Safe filename sanitization** — strips invalid characters, emoji, and reserved names; keeps filenames within a configurable length
- **Dashboard** with activity overview, category/source breakdowns, searchable history, and full settings
- **Light, dark, and system themes**
- **On/off switch** — organizing can be disabled instantly without uninstalling
- **Privacy-first** — everything is stored locally via `chrome.storage.local`; no external requests are ever made

---

## Installation

Since this extension isn't (yet) published on the Chrome Web Store, install it in developer mode:

1. Download and unzip the extension folder.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked**.
5. Select the `smart-download-organizer` folder.
6. Pin the extension to your toolbar for quick access.

---

## Usage

### Toolbar popup
Click the Alterer icon to see:
- A quick on/off toggle for the organizer
- Today's activity count
- Your most recent organized downloads
- Shortcuts to **History** and **Settings**

### Dashboard
Open the full dashboard from the popup, or via `chrome://extensions` → Alterer → **Extension options**.

- **Overview** — totals, category breakdown, and top sources
- **Rules** — enable/disable/edit built-in site rules, or add your own
- **Folder Mapping** — edit which file extensions go to which folders
- **History** — search and filter everything Alterer has organized
- **Settings** — duplicate handling, filename casing, max filename length, notifications, theme, and reset/erase options

### Adding a custom rule
1. Go to **Rules → + Add Rule**.
2. Set the **WHEN** condition (a specific website and/or file type).
3. Set the **THEN** action (how to rename the file, and which folder to save it to).
4. Save. Your rule takes priority over the built-in site and file-type rules.

**Rule priority (highest to lowest):**
1. Your custom rules
2. Built-in website + file-type rules
3. Built-in website-only rules
4. Default file-type → folder mapping
5. No match — file stays in the Downloads root, untouched

---

## Project structure

```
Alterer/
├── manifest.json          # Manifest V3 configuration
├── background.js          # Service worker — wires up the download pipeline
├── popup.html / .css / .js       # Toolbar popup
├── options.html / .css / .js     # Full dashboard
├── theme.css               # Shared design tokens (light/dark/system)
├── js/
│   ├── storage.js              # Settings, rules, folder map, history persistence
│   ├── context-tracker.js      # Tracks tab/navigation context
│   ├── rule-engine.js          # Rule matching and priority resolution
│   ├── filename-generator.js   # Expands rename templates ({query}, {title}, etc.)
│   ├── sanitization.js         # Safe filename/folder sanitization
│   ├── folder-manager.js       # Destination folder resolution
│   ├── duplicate-handler.js    # Duplicate filename strategies
│   ├── download-manager.js     # Orchestrates the full pipeline
│   ├── history.js              # Records and filters organized downloads
│   ├── stats.js                # Dashboard statistics
│   ├── utilities.js            # Shared helper functions
│   └── parsers/                # Per-site context extraction
│       ├── index.js
│       ├── google.js
│       ├── youtube.js
│       ├── github.js
│       ├── leetcode.js
│       ├── reddit.js
│       └── generic.js
└── assets/icons/            # Toolbar and store icons
```

---

## Permissions

| Permission | Why it's needed |
|---|---|
| `downloads` | To intercept and rename/relocate downloads |
| `storage` | To save your settings, rules, and history locally |
| `tabs` | To read the URL/title of the tab a download came from |
| `webNavigation` | To track page context for site-aware rules |
| `notifications` | To optionally notify you when a file is organized |

Alterer makes no network requests of any kind. All data — settings, rules, and history — is stored locally in your browser via `chrome.storage.local` and is never transmitted anywhere.

---

## Reliability

Organizing is designed to never get in the way of a download:

- If the organizer is off, or no rule matches, the file downloads exactly as Chrome normally would.
- Any unexpected error during planning falls back to Chrome's default filename rather than blocking the download.
- Folders are created automatically by Chrome only when a file actually needs to go there — nothing is created up front.

---
