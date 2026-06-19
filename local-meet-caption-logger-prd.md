# Product Requirements Document: Local Meet Caption Logger

**Version:** 1.0  
**Date:** 19/06/2026  
**Owner:** Wasif  
**Target build agent:** Codex / coding agent  
**Product type:** Local-only Chrome extension for Google Meet captions  
**Working name:** Local Meet Caption Logger  
**Primary output:** `.txt` transcript containing speaker names, timestamps, and caption text

---

## 1. Codex Handover Prompt

Use the following as the task prompt for the coding agent:

> Build a complete Chrome Manifest V3 extension named **Local Meet Caption Logger** according to this PRD. The extension should run locally in Chrome, work on `https://meet.google.com/*`, read the already-visible Google Meet caption text from the page DOM, show a simple side-panel GUI, and let the user start, pause, resume, clear, and save a raw `.txt` transcript. Do not build audio recording, AI summaries, cloud sync, user accounts, telemetry, analytics, or backend services. Implement the MVP end to end with a clean project structure, TypeScript where practical, tests for transcript reduction/deduplication/export formatting, and a README with install/build/manual QA instructions.

---

## 2. Executive Summary

Local Meet Caption Logger is a small Chrome extension that captures the live captions already rendered inside Google Meet and saves them as a raw text transcript.

The user will manually turn on captions in Google Meet. The extension will observe caption text changes, extract speaker name plus spoken text, display the captured transcript in a simple GUI, and export the transcript to a `.txt` file.

This is intentionally not a full meeting recorder. It does not capture microphone audio, system audio, video, screen content, chat messages, or AI notes. It only captures visible captions from the user's own browser session.

---

## 3. Problem Statement

The user wants a free, local, dead-simple way to preserve Google Meet captions with speaker names so that the raw transcript can later be converted into AI notes using a separate tool.

Existing tools often add SaaS accounts, AI credits, monthly limits, bots joining meetings, cloud storage, or extra note-taking features. The desired tool should do one narrow job well:

> Capture visible Google Meet captions and save them as a plain text file.

---

## 4. Goals

### 4.1 Primary Goals

1. Capture Google Meet live captions from the browser DOM.
2. Store each captured line with:
   - local timestamp
   - speaker name, when detectable
   - spoken text
3. Display live capture status in a simple Chrome side panel.
4. Let the user control recording:
   - Start
   - Pause
   - Resume
   - Stop
   - Clear
   - Save `.txt`
5. Save transcript locally only.
6. Avoid external network calls.
7. Avoid accounts, login, subscriptions, analytics, tracking, and AI.

### 4.2 Secondary Goals

1. Autosave active session state locally to reduce data loss.
2. Recover an unfinished transcript after extension reload, browser refresh, or accidental side-panel close where possible.
3. Provide a small debug mode for diagnosing Google Meet DOM changes.
4. Keep the project maintainable by isolating Google Meet caption extraction logic in one adapter/module.

---

## 5. Non-Goals

The following must not be built in the MVP:

1. Audio recording.
2. Video recording.
3. Screen recording.
4. Real speech-to-text transcription.
5. Speaker diarization from audio.
6. AI summary generation.
7. Cloud sync.
8. Google Drive integration.
9. Gmail/Calendar integration.
10. Meeting bot attendance.
11. Multi-meeting dashboard.
12. Chrome Web Store publishing flow.
13. Cross-browser support.
14. Support for Zoom, Teams, Slack huddles, or other meeting tools.
15. Support for Google Meet chat messages.
16. Support for screenshots.

---

## 6. Target Users

### 6.1 Primary User

A developer or knowledge worker who attends Google Meet calls and wants raw transcripts for later note generation.

### 6.2 User Characteristics

- Comfortable installing an unpacked Chrome extension.
- Comfortable turning on Google Meet captions manually.
- Wants local-first tooling.
- Does not want SaaS dependency.
- Does not need polished AI meeting notes in v1.

---

## 7. Core User Journey

1. User joins a Google Meet meeting.
2. User turns on Google Meet captions.
3. User opens the extension side panel.
4. Extension detects that it is running on a Google Meet tab.
5. User clicks **Start**.
6. Extension begins watching visible captions.
7. Captions appear in the side panel as lines like:

   ```txt
   [10:31:04] Wasif: I pushed the backend changes.
   [10:31:12] Sarah: Okay, I will review the PR.
   ```

8. User can click **Pause** to temporarily stop adding new transcript lines.
9. User can click **Resume** to continue.
10. User clicks **Save TXT**.
11. Browser downloads a `.txt` transcript.
12. User later pastes that transcript into another AI tool to generate meeting notes.

---

## 8. Product Scope

### 8.1 MVP Scope

The MVP must include:

- Chrome MV3 extension.
- Runs only on `https://meet.google.com/*`.
- Content script that observes Meet caption DOM.
- Side panel UI.
- Start, Pause, Resume, Stop, Clear, Save TXT controls.
- Live status indicator.
- Transcript preview list.
- Speaker + text extraction.
- Local timestamping.
- Basic dedupe and caption-update handling.
- Local autosave.
- TXT export.
- README.
- Unit tests for non-DOM business logic.

### 8.2 V1.1 / Future Scope

Possible future features:

- Markdown export.
- JSON export.
- Copy transcript to clipboard.
- Keyboard shortcuts.
- Better meeting title extraction.
- Participant list awareness.
- Optional local-only AI note prompt template.
- Per-meeting history page.
- Import/export sessions.
- Chrome Web Store package preparation.

---

## 9. Technical Assumptions

1. Google Meet captions are visible in the DOM only after the user turns on captions.
2. The extension scrapes the user's local rendered captions, not Google Meet backend APIs.
3. Google Meet DOM structure is unstable and may change.
4. Caption text often mutates progressively while someone speaks.
5. A robust deduplication/replacement algorithm is required.
6. Speaker names may occasionally be missing, delayed, duplicated, or misattributed by the Google Meet UI.
7. The MVP should gracefully handle imperfect caption extraction rather than pretending it can be perfect.

---

## 10. Functional Requirements

### FR-001: Extension Installation

**Requirement:** The project must build into a valid Chrome Manifest V3 extension that can be loaded unpacked from `chrome://extensions`.

**Acceptance Criteria:**

- `npm install` succeeds.
- `npm run build` succeeds.
- Built extension directory can be loaded in Chrome Developer Mode.
- Extension icon/action appears in Chrome.
- Extension does not request broad host permissions beyond Google Meet.

---

### FR-002: Google Meet Page Targeting

**Requirement:** The extension must only run caption extraction on Google Meet pages.

**Accepted URL pattern:**

```txt
https://meet.google.com/*
```

**Acceptance Criteria:**

- Content script loads on Google Meet pages.
- Content script does not load on non-Meet pages.
- Side panel should show a non-Meet warning if opened outside a supported page.

---

### FR-003: Side Panel UI

**Requirement:** The extension must provide a simple Chrome side panel UI.

**UI sections:**

1. Header
   - Product name
   - Current status: Idle / Recording / Paused / Stopped
   - Supported page indicator
2. Meeting metadata
   - Meeting title, if detectable
   - Meeting URL or meeting code, if available
   - Started time, if recording started
3. Controls
   - Start
   - Pause
   - Resume
   - Stop
   - Clear
   - Save TXT
4. Caption status
   - Captions detected
   - No captions detected
   - Waiting for captions
5. Live preview
   - Most recent caption candidate
6. Transcript list
   - Captured lines
   - Auto-scroll toggle, optional
7. Footer
   - Line count
   - Autosave status
   - Last captured time

**Acceptance Criteria:**

- Buttons are enabled/disabled according to current state.
- UI remains usable at narrow side panel widths.
- Transcript list scrolls without freezing the panel.
- User can save transcript after stopping or while recording.

---

### FR-004: Recording State Machine

**Requirement:** The extension must implement a predictable recording lifecycle.

**States:**

```txt
IDLE      -> no active session
RECORDING -> actively appending captured caption lines
PAUSED    -> caption observer can continue, but transcript is not appended
STOPPED   -> session ended, transcript can be saved or cleared
```

**Allowed transitions:**

```txt
IDLE -> RECORDING
RECORDING -> PAUSED
PAUSED -> RECORDING
RECORDING -> STOPPED
PAUSED -> STOPPED
STOPPED -> RECORDING   // starts a new session after confirmation or clear
STOPPED -> IDLE        // after clear
```

**Acceptance Criteria:**

- Start creates a new session.
- Pause prevents new transcript lines from being stored.
- Resume continues storing lines.
- Stop marks session ended but keeps transcript visible.
- Clear removes transcript after confirmation if transcript has content.

---

### FR-005: Caption Detection

**Requirement:** The content script must detect visible Google Meet captions.

**Implementation Guidance:**

Use a `MutationObserver` attached to `document.body` with throttling/debouncing. The extractor should scan likely caption containers and produce normalized caption candidates.

**Caption candidate shape:**

```ts
interface CaptionCandidate {
  speaker: string | null;
  text: string;
  observedAt: number;
  rawText: string;
  sourceNodeHash?: string;
}
```

**Acceptance Criteria:**

- When captions are visible, the extension eventually emits caption candidates.
- When no captions are visible, the UI shows “No captions detected. Turn on Google Meet captions.”
- Caption extraction does not significantly slow down the Google Meet tab.
- The extractor is isolated in a module that can be updated if Google Meet changes its DOM.

---

### FR-006: Speaker Extraction

**Requirement:** The extension must extract speaker name when Google Meet exposes it in caption UI.

**Fallback behavior:**

If speaker is not detectable, use:

```txt
Unknown Speaker
```

**Acceptance Criteria:**

- Captured transcript line always has a speaker string.
- Speaker names are trimmed and normalized.
- Empty speaker names are not stored.
- Missing speaker does not crash capture.

---

### FR-007: Text Normalization

**Requirement:** Caption text must be normalized before storage.

**Normalization rules:**

- Trim leading/trailing whitespace.
- Collapse repeated whitespace into a single space.
- Remove empty lines.
- Preserve punctuation.
- Preserve unicode characters.
- Do not translate text.
- Do not summarize text.
- Do not alter speaker meaning.

**Acceptance Criteria:**

- Empty text is ignored.
- Repeated whitespace does not appear in saved transcript.
- Unicode/non-English captions remain intact.

---

### FR-008: Caption Update Deduplication

**Requirement:** The extension must avoid storing progressive caption mutations as duplicate transcript lines.

**Problem example:**

Google Meet may render caption updates like:

```txt
Wasif: I think
Wasif: I think we should
Wasif: I think we should merge this
```

The transcript should store only:

```txt
[10:31:04] Wasif: I think we should merge this
```

**Deduplication strategy:**

When a new candidate arrives:

1. Normalize speaker and text.
2. Compare against the latest stored line.
3. If same speaker and new text starts with previous text within an update window, replace previous text.
4. If same speaker and previous text starts with new text, ignore new text.
5. If exact duplicate seen recently, ignore.
6. If speaker changed, append a new line.
7. If text is meaningfully different, append a new line.

**Recommended update window:**

```txt
10 seconds
```

**Recommended exact duplicate memory window:**

```txt
30 seconds
```

**Acceptance Criteria:**

- Progressive caption updates do not create noisy repeated lines.
- Same speaker can still produce multiple lines over time.
- Speaker changes create new transcript lines.
- Unit tests cover replacement, ignore, append, and speaker-change cases.

---

### FR-009: Transcript Line Model

**Requirement:** Captured transcript lines must follow a stable internal model.

```ts
interface TranscriptLine {
  id: string;
  speaker: string;
  text: string;
  startedAt: number;
  updatedAt: number;
  revision: number;
}
```

**Field meanings:**

- `id`: generated unique ID.
- `speaker`: normalized speaker name or `Unknown Speaker`.
- `text`: normalized caption text.
- `startedAt`: first time this line was observed.
- `updatedAt`: last time this line was updated.
- `revision`: incremented when line text is replaced by a progressive caption update.

**Acceptance Criteria:**

- Every stored line has all required fields.
- Export uses `startedAt` for line timestamp.
- `updatedAt` changes when progressive text extends the same line.

---

### FR-010: Session Model

**Requirement:** The extension must store transcript data in a session object.

```ts
interface TranscriptSession {
  sessionId: string;
  status: 'IDLE' | 'RECORDING' | 'PAUSED' | 'STOPPED';
  meetingTitle: string | null;
  meetingUrl: string | null;
  meetingCode: string | null;
  startedAt: number | null;
  endedAt: number | null;
  lastCapturedAt: number | null;
  lines: TranscriptLine[];
}
```

**Acceptance Criteria:**

- Session starts empty.
- Start fills `sessionId`, `startedAt`, page metadata, and status.
- Stop fills `endedAt` and status.
- Export uses session metadata.

---

### FR-011: Autosave

**Requirement:** The active transcript session must be autosaved to Chrome local storage.

**Autosave rules:**

- Save after state transitions.
- Save after transcript changes, debounced.
- Recommended debounce: 1000ms.
- Show autosave status in UI.

**Acceptance Criteria:**

- If side panel is closed and reopened, current session is restored where practical.
- If Meet page refreshes, latest autosaved transcript can be restored manually or automatically.
- Autosave failures show a non-blocking error.

---

### FR-012: Save TXT Export

**Requirement:** User must be able to save the transcript as a `.txt` file.

**Filename format:**

```txt
meet-transcript_YYYY-MM-DD_HH-mm.txt
```

If meeting title is available:

```txt
meet-transcript_<slugified-title>_YYYY-MM-DD_HH-mm.txt
```

**TXT format:**

```txt
Local Meet Caption Logger Transcript
Meeting: <meeting title or Unknown>
Meeting URL: <url or Unknown>
Started: <local datetime>
Ended: <local datetime or Still recording at export>
Exported: <local datetime>
Line count: <number>

--- Transcript ---
[10:31:04] Wasif: I pushed the backend changes.
[10:31:12] Sarah: Okay, I will review the PR.
```

**Acceptance Criteria:**

- Save works while recording, paused, or stopped.
- Save creates a valid `.txt` file.
- File is UTF-8 encoded.
- Empty transcript export is either blocked or produces a clearly empty file after confirmation.

---

### FR-013: Privacy and Local-Only Behavior

**Requirement:** The extension must be local-only.

**Rules:**

- No backend.
- No external API calls.
- No analytics.
- No telemetry.
- No AI services.
- No remote scripts.
- No uploading transcripts.
- No hidden meeting bot.
- No access to microphone, camera, or screen capture APIs.

**Acceptance Criteria:**

- Network tab shows no outgoing requests from the extension during normal operation.
- Manifest does not request microphone, camera, tab capture, desktop capture, or broad site permissions.
- README clearly states data stays local.

---

### FR-014: Consent Reminder

**Requirement:** The UI should include a short reminder that the user is responsible for following meeting consent rules.

**Suggested copy:**

```txt
Reminder: only capture meeting captions when you have the right to do so. This tool stores captions locally on your device.
```

**Acceptance Criteria:**

- Reminder appears in onboarding or footer.
- Reminder is not intrusive.
- Reminder does not block use.

---

### FR-015: Error States

**Requirement:** The UI must gracefully handle common errors.

**Errors to handle:**

1. Not on Google Meet.
2. Captions not detected.
3. Could not connect to content script.
4. Storage unavailable or quota error.
5. Export failed.
6. Unsupported Chrome version.
7. Extension context invalidated after reload.

**Acceptance Criteria:**

- Errors appear as readable messages.
- Errors do not crash the side panel.
- User is given a clear next action where possible.

---

## 11. UX Requirements

### 11.1 Visual Style

Keep the UI calm, small, and utilitarian.

Suggested style:

- White or neutral background.
- Clear buttons.
- Compact transcript rows.
- Sticky controls at top.
- Monospace transcript text optional.
- No animation-heavy UI.

### 11.2 Button Behavior

| State | Start | Pause | Resume | Stop | Clear | Save TXT |
|---|---:|---:|---:|---:|---:|---:|
| IDLE | enabled | disabled | disabled | disabled | disabled | disabled |
| RECORDING | disabled | enabled | disabled | enabled | enabled | enabled if lines exist |
| PAUSED | disabled | disabled | enabled | enabled | enabled | enabled if lines exist |
| STOPPED | enabled/new session | disabled | disabled | disabled | enabled | enabled if lines exist |

### 11.3 Status Labels

Use these exact or similar labels:

```txt
Idle
Recording
Paused
Stopped
Captions detected
Waiting for captions
Not on Google Meet
Autosaved
Unsaved changes
Export failed
```

### 11.4 Empty States

**No active session:**

```txt
Open a Google Meet tab, turn on captions, then click Start.
```

**No captions detected:**

```txt
No captions detected yet. Turn on captions in Google Meet.
```

**Paused:**

```txt
Paused. New captions are visible but not being saved.
```

---

## 12. Architecture

### 12.1 Recommended Stack

- Chrome Manifest V3 extension.
- TypeScript preferred.
- Vanilla HTML/CSS/TypeScript preferred over React for MVP simplicity.
- Vite or equivalent build tool acceptable.
- Vitest or Jest for unit tests.
- No backend.
- No database.
- No external runtime services.

### 12.2 Recommended Modules

```txt
src/
  background/
    background.ts
  content/
    content.ts
    meetCaptionExtractor.ts
  sidepanel/
    sidepanel.html
    sidepanel.ts
    sidepanel.css
  shared/
    types.ts
    messages.ts
    transcriptReducer.ts
    exportTranscript.ts
    storage.ts
    time.ts
    slugify.ts
  tests/
    transcriptReducer.test.ts
    exportTranscript.test.ts
    slugify.test.ts
manifest.json
package.json
README.md
```

### 12.3 Message Flow

```txt
Google Meet DOM
  ↓
content script MutationObserver
  ↓ CAPTION_CANDIDATE
background service worker
  ↓ reduce/dedupe/session update
chrome.storage.local autosave
  ↓ SESSION_UPDATED
side panel UI
  ↓ user commands
background service worker
```

### 12.4 Message Types

```ts
type ExtensionMessage =
  | { type: 'CAPTION_CANDIDATE'; payload: CaptionCandidate }
  | { type: 'CAPTIONS_DETECTED'; payload: { detected: boolean; observedAt: number } }
  | { type: 'START_RECORDING'; payload: { tabId: number } }
  | { type: 'PAUSE_RECORDING'; payload: { tabId: number } }
  | { type: 'RESUME_RECORDING'; payload: { tabId: number } }
  | { type: 'STOP_RECORDING'; payload: { tabId: number } }
  | { type: 'CLEAR_SESSION'; payload: { tabId: number } }
  | { type: 'SAVE_TXT'; payload: { tabId: number } }
  | { type: 'GET_SESSION'; payload: { tabId: number } }
  | { type: 'SESSION_UPDATED'; payload: TranscriptSession }
  | { type: 'ERROR'; payload: { code: string; message: string } };
```

---

## 13. Caption Extraction Strategy

### 13.1 Principle

Do not depend on one brittle Google Meet CSS class if avoidable. Google Meet class names and DOM structure may change. Encapsulate all Meet-specific logic in `meetCaptionExtractor.ts`.

### 13.2 Suggested Algorithm

1. Observe DOM mutations.
2. Debounce extraction to avoid excessive scanning.
3. Identify visible candidate caption nodes.
4. Extract raw visible text.
5. Split raw text into speaker + caption text if possible.
6. Return normalized `CaptionCandidate`.
7. Emit only when candidate meaningfully changes.

### 13.3 Candidate Node Heuristics

The extractor may combine these heuristics:

- Visible nodes only.
- Nodes near bottom of viewport.
- Nodes with caption-like text length.
- Nodes that update frequently while captions are active.
- Nodes with accessible live-region attributes, where present.
- Nodes whose child text appears to contain speaker name plus spoken text.

### 13.4 Debug Mode

Add a lightweight debug option:

```js
localStorage.setItem('lmclDebug', '1')
```

When enabled, log candidate caption nodes and extracted candidates to the console.

**Acceptance Criteria:**

- Debug mode is disabled by default.
- Debug logs do not contain anything unless explicitly enabled.
- Debug mode helps diagnose selector failures after Meet UI changes.

---

## 14. Transcript Reducer Logic

### 14.1 Reducer Function

Implement pure reducer logic, independent of Chrome APIs:

```ts
function applyCaptionCandidate(
  session: TranscriptSession,
  candidate: CaptionCandidate,
  options?: TranscriptReducerOptions
): TranscriptSession
```

### 14.2 Reducer Rules

If session status is not `RECORDING`, do not append.

If candidate text is empty, ignore.

If speaker is missing, use `Unknown Speaker`.

If latest line has same speaker and candidate text extends latest line text within update window, replace latest line text and increment revision.

If latest line text extends candidate text, ignore candidate.

If exact speaker+text appears in recent duplicate memory window, ignore candidate.

Otherwise append a new line.

### 14.3 Unit Test Cases

Required tests:

1. Appends first line.
2. Ignores empty candidate.
3. Uses Unknown Speaker fallback.
4. Replaces progressive caption update.
5. Ignores shorter duplicate mutation.
6. Appends when speaker changes.
7. Appends when same speaker says a new unrelated sentence.
8. Does not append while paused.
9. Does not append while stopped.
10. Handles unicode text.

---

## 15. Storage Requirements

### 15.1 Storage Key

Use a namespaced key:

```txt
lmcl.sessionsByTab
```

or:

```txt
lmcl.activeSession
```

For MVP, a single active session is acceptable. For better tab handling, use tab-scoped sessions.

### 15.2 Storage Shape

```ts
interface StoredState {
  version: 1;
  sessionsByTabId: Record<string, TranscriptSession>;
  updatedAt: number;
}
```

### 15.3 Migration

MVP only needs version `1`, but code should not crash if storage is missing or malformed.

---

## 16. Permissions

### 16.1 Required Permissions

Use the smallest practical permission set.

Recommended manifest permissions:

```json
{
  "permissions": ["storage", "downloads", "sidePanel"],
  "host_permissions": ["https://meet.google.com/*"]
}
```

### 16.2 Avoid These Permissions

Do not request:

```txt
microphone
camera
desktopCapture
tabCapture
<all_urls>
history
cookies
identity
```

---

## 17. Manifest Requirements

Example target manifest shape:

```json
{
  "manifest_version": 3,
  "name": "Local Meet Caption Logger",
  "version": "0.1.0",
  "description": "Capture visible Google Meet captions locally and export them to a text file.",
  "permissions": ["storage", "downloads", "sidePanel"],
  "host_permissions": ["https://meet.google.com/*"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://meet.google.com/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "action": {
    "default_title": "Open Local Meet Caption Logger"
  }
}
```

The final generated paths may differ based on the build tool, but behavior must match.

---

## 18. Export Formatting

### 18.1 Formatter Function

Implement pure formatter logic:

```ts
function formatTranscriptAsTxt(session: TranscriptSession): string
```

### 18.2 Time Format

Use local time for readability:

```txt
HH:mm:ss
```

Session metadata can use:

```txt
YYYY-MM-DD HH:mm:ss
```

### 18.3 Example Output

```txt
Local Meet Caption Logger Transcript
Meeting: Weekly Engineering Sync
Meeting URL: https://meet.google.com/abc-defg-hij
Started: 2026-06-19 10:30:21
Ended: 2026-06-19 11:02:44
Exported: 2026-06-19 11:03:10
Line count: 3

--- Transcript ---
[10:31:04] Wasif: I pushed the backend changes.
[10:31:12] Sarah: Okay, I will review the PR.
[10:31:25] Ali: We still need to test the webhook case.
```

---

## 19. Performance Requirements

1. DOM observer callback must be debounced or throttled.
2. Avoid scanning the entire DOM on every mutation without limits.
3. Avoid storing unbounded duplicate candidates.
4. Side panel should remain responsive with at least 2,000 transcript lines.
5. Autosave should be debounced.
6. Transcript rendering should avoid unnecessary full re-renders where practical.

Recommended values:

```txt
DOM extraction debounce: 250ms
Autosave debounce: 1000ms
Duplicate memory window: 30 seconds
Progressive caption update window: 10 seconds
```

---

## 20. Accessibility Requirements

1. Buttons must be keyboard accessible.
2. Buttons must have clear labels.
3. Status changes should be readable as text, not color-only.
4. Transcript text should have sufficient contrast.
5. Do not rely only on icons.
6. Use semantic HTML where practical.

---

## 21. Security Requirements

1. No remote code execution.
2. No CDN scripts.
3. No external network requests.
4. No dynamic eval.
5. No unsafe inline scripts unless build system handles extension CSP safely.
6. No microphone/camera/screen permissions.
7. Keep host permissions scoped to `https://meet.google.com/*`.
8. Sanitize text before inserting into DOM; use `textContent`, not `innerHTML`, for transcript lines.

---

## 22. Testing Plan

### 22.1 Unit Tests

Test pure modules:

- `transcriptReducer.ts`
- `exportTranscript.ts`
- `slugify.ts`
- `time.ts`, where useful

### 22.2 DOM Extraction Tests

Use fixture-based tests where possible.

Create fake caption DOM snippets and test extraction:

1. Speaker + text in separate child nodes.
2. Speaker + text in combined raw text.
3. Missing speaker.
4. Empty text.
5. Multiple candidate nodes.

### 22.3 Manual QA

Manual test checklist:

1. Load unpacked extension in Chrome.
2. Open a non-Meet page.
3. Confirm side panel shows unsupported page message.
4. Join a Google Meet test call.
5. Turn on captions manually.
6. Open side panel.
7. Click Start.
8. Speak one short sentence.
9. Confirm line appears with speaker name and text.
10. Speak a longer sentence and confirm progressive updates collapse into one line.
11. Click Pause.
12. Speak while paused.
13. Confirm transcript does not grow.
14. Click Resume.
15. Speak again.
16. Confirm transcript grows.
17. Click Save TXT.
18. Confirm file downloads.
19. Open file and inspect formatting.
20. Refresh Meet tab and verify graceful behavior.
21. Reload extension and verify no crash.

---

## 23. Acceptance Criteria: MVP Definition of Done

The MVP is complete when:

1. Extension builds successfully.
2. Extension loads unpacked in Chrome.
3. Side panel opens from extension action.
4. On Google Meet with captions enabled, transcript lines appear.
5. Transcript includes speaker name where visible.
6. Transcript uses `Unknown Speaker` fallback when needed.
7. Start/Pause/Resume/Stop/Clear work correctly.
8. Progressive caption updates are deduped/replaced.
9. Save TXT downloads a valid text file.
10. Transcript data remains local.
11. No backend or external API calls exist.
12. README explains setup, usage, limitations, and privacy model.
13. Tests pass.
14. Code is organized around replaceable caption extraction logic.

---

## 24. README Requirements

The README must include:

1. What the extension does.
2. What it does not do.
3. Privacy statement.
4. Installation steps:
   - `npm install`
   - `npm run build`
   - Open `chrome://extensions`
   - Enable Developer Mode
   - Load unpacked build folder
5. Usage steps:
   - Join Google Meet
   - Turn on captions
   - Open side panel
   - Start recording
   - Save TXT
6. Known limitations:
   - Requires Google Meet captions to be visible
   - Google Meet DOM changes may break extraction
   - Speaker names depend on Meet caption UI
   - Not a legal/compliance tool
7. Debug mode instructions.
8. Test commands.
9. Build commands.

---

## 25. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---:|---|
| Google Meet DOM changes | High | Isolate extractor in one module; add debug mode |
| Captions not enabled | High | UI warning and onboarding copy |
| Progressive captions duplicate lines | Medium | Reducer replacement/dedupe logic |
| Speaker name missing | Medium | Unknown Speaker fallback |
| Storage quota | Low for MVP | Use text-only storage; allow clearing |
| User expects full recording | Medium | README and UI clarify captions-only |
| Side panel closed during meeting | Medium | Background/session storage where practical; autosave |
| Extension permissions feel scary | Medium | Minimal permissions and clear README |

---

## 26. Implementation Milestones

### Milestone 1: Project Bootstrap

- Create extension project.
- Add manifest.
- Add build/test scripts.
- Add README skeleton.

### Milestone 2: UI Shell

- Side panel layout.
- State labels.
- Buttons.
- Placeholder transcript list.

### Milestone 3: Message Bus and Session State

- Define shared types.
- Implement background message handling.
- Implement start/pause/resume/stop/clear state transitions.
- Implement storage.

### Milestone 4: Caption Extractor

- Add content script.
- Add MutationObserver.
- Emit caption candidates.
- Show captions detected/waiting state.

### Milestone 5: Reducer and Deduplication

- Implement transcript reducer.
- Add unit tests.
- Integrate with background state.

### Milestone 6: Export

- Implement TXT formatter.
- Implement download behavior.
- Add export tests.

### Milestone 7: QA and Polish

- Manual QA.
- Error messages.
- Debug mode.
- README finalization.

---

## 27. Suggested Codex Task Breakdown

Ask Codex to implement in these chunks:

1. Bootstrap a Chrome MV3 extension project.
2. Add side panel UI with static controls and state handling.
3. Add shared session types and reducer tests.
4. Implement reducer/dedupe logic.
5. Add background service worker and message bus.
6. Add content script and caption extraction adapter.
7. Wire caption candidates into session state.
8. Add autosave/restore.
9. Add TXT export and download.
10. Add README and manual QA checklist.
11. Run tests and build.
12. Fix lint/build/test failures.

---

## 28. Hard Constraints for the Coding Agent

The coding agent must not:

1. Add a backend.
2. Add an AI API.
3. Add OpenAI API calls.
4. Add Google API calls.
5. Add analytics.
6. Add tracking.
7. Add microphone/camera permissions.
8. Add `<all_urls>` permission.
9. Store transcript outside local extension storage unless user explicitly saves TXT.
10. Use `innerHTML` for untrusted caption text.
11. Depend on a single unwrapped Meet CSS selector across the whole app.

---

## 29. Example AI Notes Prompt for Later Use

This is not part of the extension, but useful for the user after export:

```txt
Convert this raw meeting transcript into concise engineering notes.

Return:
1. Summary
2. Decisions made
3. Action items with owners
4. Blockers / risks
5. Follow-up questions
6. Timeline / deadlines mentioned

Keep speaker names where relevant.
Do not invent missing details.

Transcript:
[paste transcript here]
```

---

## 30. Final Product Principle

Build the boring version first.

The extension should not try to be smart. It should not try to become a meeting assistant. It should quietly capture the words already visible on the screen, keep them local, and let the user save them.

