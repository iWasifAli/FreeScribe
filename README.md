# ZolvatScribe

ZolvatScribe is a local-only Chrome Manifest V3 extension that captures Google Meet captions already visible in your browser and saves them as a raw `.txt` transcript.

It reads caption text from the Google Meet page DOM. It does not record audio, video, screen content, microphone input, chat messages, or use any AI service.

## Privacy

ZolvatScribe stores transcript state in `chrome.storage.local` and only writes a file when you click **Save TXT**. There is no backend, telemetry, analytics, account system, cloud sync, Google API integration, or external network request from the extension.

Requested permissions are limited to:

- `storage`
- `downloads`
- `sidePanel`
- `https://meet.google.com/*`

The extension does not request microphone, camera, desktop capture, tab capture, history, cookies, identity, or `<all_urls>`.

## Install

```bash
npm install
npm run build
```

Then load the unpacked extension:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `dist` folder from this project.
5. Pin or open **ZolvatScribe** from Chrome's extension UI.

## Usage

1. Join a Google Meet call at `https://meet.google.com/*`.
2. Turn on Google Meet captions manually.
3. Open the ZolvatScribe side panel.
4. Click **Start**.
5. Use **Pause**, **Resume**, **Stop**, and **Clear** as needed.
6. Click **Save TXT** to download a transcript.

Transcript lines are saved in this shape:

```txt
[10:31:04] Wasif: I pushed the backend changes.
[10:31:12] Sarah: Okay, I will review the PR.
```

Downloaded files use:

```txt
meet-transcript_YYYY-MM-DD_HH-mm.txt
meet-transcript_<meeting-title>_YYYY-MM-DD_HH-mm.txt
```

## Commands

```bash
npm run build
npm test
```

`npm run build` writes the unpacked Chrome extension to `dist`.

`npm test` runs unit tests for transcript reduction, deduplication, filename slugging, and TXT export formatting.

## Debug Mode

If Google Meet changes its caption DOM, enable debug logs in the Meet tab console:

```js
localStorage.setItem("zolvatScribeDebug", "1")
```

Reload the Meet tab and watch for `[ZolvatScribe]` logs. Disable debug mode with:

```js
localStorage.removeItem("zolvatScribeDebug")
```

The older PRD key is also supported:

```js
localStorage.setItem("lmclDebug", "1")
```

## Known Limitations

- Google Meet captions must be visible in the page.
- Caption extraction depends on Google Meet's rendered DOM and may need updates if Meet changes its UI.
- Speaker names depend on what Google Meet exposes in the caption UI.
- Progressive captions are deduplicated heuristically, so imperfect lines are possible.
- This is not a legal, compliance, or consent-management tool.

Reminder: only capture meeting captions when you have the right to do so.

## Manual QA

1. Run `npm install`.
2. Run `npm run build`.
3. Load `dist` as an unpacked extension in Chrome.
4. Open a non-Meet page and confirm the side panel shows **Not on Google Meet**.
5. Open a Google Meet test call.
6. Turn on captions manually.
7. Open the ZolvatScribe side panel.
8. Click **Start**.
9. Speak a short sentence and confirm a transcript line appears.
10. Speak a longer sentence and confirm progressive updates collapse into one line.
11. Click **Pause** and confirm new captions do not add transcript lines.
12. Click **Resume** and confirm transcript capture continues.
13. Click **Stop** and confirm the transcript remains visible.
14. Click **Save TXT** and inspect the downloaded file.
15. Refresh the Meet tab and confirm the extension handles reconnecting without crashing.
16. Reload the extension and confirm autosaved state restores where practical.
