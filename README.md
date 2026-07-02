# FreeScribe

FreeScribe is a local-first Chrome Manifest V3 extension for capturing Google Meet captions that are already visible in the browser, exporting them as a plain text transcript, and optionally generating Gemini-powered meeting notes.

FreeScribe is a solo-built open-source project by Wasif Ali from Pakistan 🇵🇰.

## Overview

FreeScribe is designed for teams that need a simple way to preserve meeting captions without introducing a recording service, cloud sync layer, or bot participant. The extension runs in Chrome, watches the rendered Google Meet caption UI only during an active user-started capture session, stores transcript state locally, keeps a local meeting library, and lets the user download transcript and notes files on demand.

The extension does not record audio, video, screen content, microphone input, camera input, chat messages, or Google account data. It only reads caption text that Google Meet has already rendered into the page after the user enables captions in the meeting.

## Features

- Capture visible Google Meet captions from `https://meet.google.com/*`.
- Start, pause, resume, stop, clear, copy, and save transcript sessions from a Chrome side panel.
- Autosave transcript sessions into a local meeting library for crash and tab-close recovery.
- Link an optional `.txt` file per meeting so FreeScribe can periodically rewrite the latest transcript after the user grants file permission.
- Browse, search, reopen, export, and delete previous meetings from the side panel.
- Export transcript output as a raw `.txt` file.
- Optionally generate a Gemini executive summary, action items, and Minutes of Meeting from the captured transcript.
- Copy or save generated AI meeting notes as Markdown when AI is enabled for the local build.
- Include timestamps and speaker labels when Google Meet exposes them in the caption UI.
- Deduplicate progressive caption updates so partial caption revisions collapse into cleaner transcript lines.
- Generate readable transcript filenames based on date, time, and meeting title when available.
- Run without a backend server, account system, analytics SDK, or telemetry.
- Keep AI disabled by default when no Gemini API key is configured.

## Privacy Model

FreeScribe is local-first. Transcript capture, transcript storage, and transcript export work without any external AI service.

Transcript state is stored locally in the browser using extension storage and IndexedDB. Saved meetings may persist across browser restarts until they are deleted by the user or removed with the extension. Caption text capture starts only after the user clicks **Start recording**. Capture is stopped when the user pauses, stops, or clears the active session.

A transcript file is written only when the user clicks **Save transcript** or links a transcript autosave file through the browser file picker. Linked file autosave rewrites that user-selected file periodically when the transcript changes. If AI is disabled or no Gemini key is configured, the extension does not send transcript content to Google APIs, third-party APIs, AI services, or any other remote service.

When `FREESCRIBE_AI_ENABLED=true` and `FREESCRIBE_GEMINI_API_KEY` is present at build time, clicking **Generate notes** sends the current transcript, speaker names, transcript timestamps, meeting title, and meeting start/end metadata to the Gemini API to generate an executive summary, action items, and MoM. The Google Meet URL is not sent to Gemini. Generated notes are stored locally with the transcript session. The API key is injected into the unpacked `dist` extension for local use, so do not publish a build containing a personal key.

Requested Chrome permissions are limited to:

- `storage`
- `downloads`
- `sidePanel`
- `https://meet.google.com/*`
- `https://generativelanguage.googleapis.com/*` only in builds where Gemini AI is configured

The extension does not request microphone, camera, desktop capture, tab capture, browsing history, cookies, identity, or `<all_urls>` permissions.

## How It Works

Google Meet captions are rendered into the meeting page after captions are enabled by the user. FreeScribe injects a content script on Google Meet pages, waits for the user to start capture, observes caption-like live regions in the DOM, normalizes caption text, and sends transcript events to the extension side panel.

The side panel owns the user workflow and transcript state. It can start or pause capture, display the current transcript, browse the local meeting library, ask Chrome to download exported files, link a user-selected transcript autosave file, and request optional Gemini meeting notes through the extension background worker when AI is configured.

Because the extension depends on Google Meet's rendered caption UI, changes to Google Meet's DOM structure may require updates to the caption extraction logic.

## Requirements

- Node.js 20 or newer
- npm
- Google Chrome or a Chromium browser with Manifest V3 extension support
- A Google Meet session with captions enabled manually by the user

## Installation

FreeScribe is currently intended for local installation from source. It is not currently packaged for Chrome Web Store distribution.

Clone the repository and install dependencies:

```bash
npm install
```

Build the unpacked extension:

```bash
npm run build
```

Load the extension in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `dist` folder generated by `npm run build`.
5. Pin or open **FreeScribe** from Chrome's extension UI.

## Usage

1. Join a Google Meet call at `https://meet.google.com/*`.
2. Turn on Google Meet captions manually.
3. Open the FreeScribe side panel.
4. Click **Start recording**.
5. Use **Pause**, **Resume**, **Stop**, and **Clear** as needed.
6. Use the copy button to copy the transcript when needed.
7. Click **Save transcript** to download the transcript.
8. Click **Link autosave file** to choose a `.txt` file FreeScribe should keep updated for this meeting.
9. Open **Library** to search previous meetings, restore a meeting into the active view, export files, or delete local records.
10. If Gemini AI is enabled for your build, click **Generate notes** to create summary, action items, and MoM from the current transcript.
11. Use the AI notes copy or save buttons to export generated notes as Markdown.

Transcript lines are saved in this format:

```txt
[10:31:04] Wasif: I pushed the backend changes.
[10:31:12] Sarah: Okay, I will review the PR.
```

Downloaded files use one of these filename formats:

```txt
meet-transcript_YYYY-MM-DD_HH-mm.txt
meet-transcript_<meeting-title>_YYYY-MM-DD_HH-mm.txt
```

Generated AI notes use one of these filename formats:

```txt
meet-notes_YYYY-MM-DD_HH-mm.md
meet-notes_<meeting-title>_YYYY-MM-DD_HH-mm.md
```

## Development

Install dependencies:

```bash
npm install
```

Optional Gemini configuration:

```bash
cp .env.example .env
```

Set these values in `.env` before building:

```env
FREESCRIBE_AI_ENABLED=true
FREESCRIBE_GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.5-flash
```

To build FreeScribe without AI, leave `FREESCRIBE_AI_ENABLED=false` from `.env.example`, omit `.env`, or set:

```env
FREESCRIBE_AI_ENABLED=false
```

No-key or disabled builds keep transcript capture/export working and do not add the Gemini host permission to `dist/manifest.json`. A generic `GEMINI_API_KEY` from your shell is intentionally ignored; FreeScribe only reads `FREESCRIBE_GEMINI_API_KEY` when AI is explicitly enabled.

Run the full build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Build only the shared TypeScript used by tests:

```bash
npm run build:test
```

Clean generated build output:

```bash
npm run clean
```

Create a versioned local-install ZIP in `release/`:

```bash
npm run package
```

`npm run build` compiles the background script, content script, and side panel script, then copies static extension assets into `dist`.

## Project Structure

```txt
.
├── assets/
├── manifest.json
├── package.json
├── scripts/
├── src/
│   ├── background/
│   ├── content/
│   ├── shared/
│   └── sidepanel/
├── tests/
└── tsconfig.*.json
```

Key areas:

- `src/content/` contains the Google Meet caption extraction logic.
- `src/sidepanel/` contains the Chrome side panel UI and transcript workflow.
- `src/background/` contains the Manifest V3 service worker.
- `src/shared/` contains reusable transcript, storage, meeting library, file autosave, messaging, time, slugging, and export utilities.
- `tests/` contains Node test coverage for transcript reduction, caption deduplication, filename slugging, TXT export formatting, AI artifact formatting, meeting library behavior, file autosave thresholds, and storage migration.
- `scripts/` contains build support scripts for cleaning, copying extension assets, optional environment injection, manifest permission generation, and packaging release ZIPs.

## Testing

Run automated tests with:

```bash
npm test
```

The test suite currently covers:

- Transcript reduction behavior
- Progressive caption deduplication
- Filename slug generation
- Plain text transcript export formatting
- AI artifact parsing and Markdown export formatting
- Meeting library search, sorting, and repeated meeting-code records
- Linked file autosave threshold behavior
- Stored session migration, including no-AI defaults

CI runs `npm ci`, `npm test`, `npm run build`, and `npm run package` for pushes and pull requests.

Manual QA is still important because the most integration-sensitive behavior depends on Google Meet's live rendered caption DOM.

## Manual QA Checklist

1. Run `npm install`.
2. Run `npm run build`.
3. Load `dist` as an unpacked extension in Chrome.
4. Open a non-Meet page and confirm the side panel shows **Not on Google Meet**.
5. Open a Google Meet test call.
6. Turn on captions manually.
7. Open the FreeScribe side panel.
8. Click **Start recording**.
9. Speak a short sentence and confirm a transcript line appears.
10. Speak a longer sentence and confirm progressive updates collapse into one line.
11. Click **Pause** and confirm new captions do not add transcript lines.
12. Click **Resume** and confirm transcript capture continues.
13. Click **Stop** and confirm the transcript remains visible.
14. Click **Save transcript** and inspect the downloaded file.
15. Click **Link autosave file**, choose a `.txt` file, speak more captions, and confirm the selected file is rewritten.
16. Close the Meet tab or side panel, reopen FreeScribe, and confirm the meeting appears in **Library**.
17. Search the Library, open a meeting detail, copy/export transcript, restore it on a Meet tab, and delete a test record.
18. With no Gemini key configured, confirm the AI notes panel is disabled and transcript controls still work.
19. With `FREESCRIBE_GEMINI_API_KEY` configured and the extension rebuilt, click **Generate notes** and confirm summary, actions, and MoM render.
20. Copy and save generated AI notes, then inspect the Markdown output.
21. Refresh the Meet tab and confirm the extension handles reconnecting without crashing.
22. Reload the extension and confirm autosaved state restores where practical.

## Debugging

If Google Meet changes its caption DOM, enable debug logs in the Meet tab console:

```js
localStorage.setItem("freeScribeDebug", "1")
```

Reload the Meet tab and watch for `[FreeScribe]` logs.

Disable debug mode with:

```js
localStorage.removeItem("freeScribeDebug")
```

The older PRD key is also supported:

```js
localStorage.setItem("lmclDebug", "1")
```

## Known Limitations

- Google Meet captions must be visible in the page before they can be captured.
- Caption extraction depends on Google Meet's rendered caption DOM and may need updates if Meet changes its UI.
- Speaker names depend on what Google Meet exposes in the caption UI.
- Progressive captions are deduplicated heuristically, so imperfect transcript lines are possible.
- The extension does not capture Google Meet chat messages.
- Linked file autosave requires a browser with File System Access support and user-granted permission for the selected file.
- If Chrome revokes or loses access to a linked file, FreeScribe keeps the local meeting library copy and asks the user to reconnect file autosave.
- Gemini notes require a local build with `FREESCRIBE_GEMINI_API_KEY` and `FREESCRIBE_AI_ENABLED=true`.
- Direct-extension Gemini builds embed the API key in `dist/background.js`; use a backend proxy before distributing keyed builds publicly.
- AI-generated notes can be incomplete or inaccurate and should be reviewed against the transcript.
- The extension does not provide participant consent flows, legal notices, compliance controls, or retention policy enforcement.
- This project is not a legal, compliance, or consent-management tool.

Only capture meeting captions when you have the right to do so and when doing so complies with applicable laws, policies, and meeting expectations.

## Security and Privacy Reporting

Please do not include private meeting content, Gemini API keys, credentials, access tokens, keyed build output, or sensitive transcript data in public issues or pull requests.

Security and privacy concerns should be reported through the process in `SECURITY.md`.

## Contributing

Contribution guidelines are documented in `CONTRIBUTING.md`. By contributing, you agree that your contribution is licensed under the Apache License 2.0.

## Maintainers

FreeScribe is maintained as an open-source project by Wasif Ali.

Solo-built by Wasif Ali from Pakistan 🇵🇰.

## License

FreeScribe is licensed under the Apache License 2.0. See `LICENSE`.
