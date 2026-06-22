namespace LMCL {
  interface Elements {
    supportText: HTMLElement;
    statusPill: HTMLElement;
    themeToggle: HTMLButtonElement;
    meetingTitle: HTMLElement;
    meetingCode: HTMLElement;
    startedAt: HTMLElement;
    startButton: HTMLButtonElement;
    pauseButton: HTMLButtonElement;
    resumeButton: HTMLButtonElement;
    stopButton: HTMLButtonElement;
    clearButton: HTMLButtonElement;
    saveButton: HTMLButtonElement;
    copyButton: HTMLButtonElement;
    generateAiNotesButton: HTMLButtonElement;
    copyAiNotesButton: HTMLButtonElement;
    saveAiNotesButton: HTMLButtonElement;
    aiStatusText: HTMLElement;
    aiGeneratedMeta: HTMLElement;
    aiSummaryText: HTMLElement;
    aiActionItemsList: HTMLOListElement;
    aiMomContent: HTMLElement;
    aiTabSummary: HTMLButtonElement;
    aiTabActions: HTMLButtonElement;
    aiTabMom: HTMLButtonElement;
    aiPanelSummary: HTMLElement;
    aiPanelActions: HTMLElement;
    aiPanelMom: HTMLElement;
    captionStatus: HTMLElement;
    autoScrollToggle: HTMLInputElement;
    latestCandidate: HTMLElement;
    transcriptList: HTMLOListElement;
    lineCount: HTMLElement;
    autosaveStatus: HTMLElement;
    lastCapturedAt: HTMLElement;
    errorText: HTMLElement;
  }

  let currentState: TabRuntimeState | null = null;
  let copyFeedbackTimer: number | undefined;
  let aiCopyFeedbackTimer: number | undefined;
  type AiTab = "summary" | "actions" | "mom";
  let currentAiTab: AiTab = "summary";
  type ThemeMode = "light" | "dark";
  const THEME_STORAGE_KEY = "freeScribe.theme";

  function mustGetElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing element: ${id}`);
    }

    return element as T;
  }

  const elements: Elements = {
    supportText: mustGetElement("supportText"),
    statusPill: mustGetElement("statusPill"),
    themeToggle: mustGetElement("themeToggle"),
    meetingTitle: mustGetElement("meetingTitle"),
    meetingCode: mustGetElement("meetingCode"),
    startedAt: mustGetElement("startedAt"),
    startButton: mustGetElement("startButton"),
    pauseButton: mustGetElement("pauseButton"),
    resumeButton: mustGetElement("resumeButton"),
    stopButton: mustGetElement("stopButton"),
    clearButton: mustGetElement("clearButton"),
    saveButton: mustGetElement("saveButton"),
    copyButton: mustGetElement("copyButton"),
    generateAiNotesButton: mustGetElement("generateAiNotesButton"),
    copyAiNotesButton: mustGetElement("copyAiNotesButton"),
    saveAiNotesButton: mustGetElement("saveAiNotesButton"),
    aiStatusText: mustGetElement("aiStatusText"),
    aiGeneratedMeta: mustGetElement("aiGeneratedMeta"),
    aiSummaryText: mustGetElement("aiSummaryText"),
    aiActionItemsList: mustGetElement("aiActionItemsList"),
    aiMomContent: mustGetElement("aiMomContent"),
    aiTabSummary: mustGetElement("aiTabSummary"),
    aiTabActions: mustGetElement("aiTabActions"),
    aiTabMom: mustGetElement("aiTabMom"),
    aiPanelSummary: mustGetElement("aiPanelSummary"),
    aiPanelActions: mustGetElement("aiPanelActions"),
    aiPanelMom: mustGetElement("aiPanelMom"),
    captionStatus: mustGetElement("captionStatus"),
    autoScrollToggle: mustGetElement("autoScrollToggle"),
    latestCandidate: mustGetElement("latestCandidate"),
    transcriptList: mustGetElement("transcriptList"),
    lineCount: mustGetElement("lineCount"),
    autosaveStatus: mustGetElement("autosaveStatus"),
    lastCapturedAt: mustGetElement("lastCapturedAt"),
    errorText: mustGetElement("errorText")
  };

  function isThemeMode(value: string | null): value is ThemeMode {
    return value === "light" || value === "dark";
  }

  function getStoredTheme(): ThemeMode | null {
    try {
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      return isThemeMode(storedTheme) ? storedTheme : null;
    } catch {
      return null;
    }
  }

  function getSystemTheme(): ThemeMode {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function setTheme(theme: ThemeMode): void {
    document.documentElement.dataset.theme = theme;
    const nextTheme = theme === "dark" ? "light" : "dark";
    const label = `Switch to ${nextTheme} mode`;
    elements.themeToggle.setAttribute("aria-label", label);
    elements.themeToggle.title = label;
  }

  function saveTheme(theme: ThemeMode): void {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Theme persistence is optional; the active panel can still switch modes.
    }
  }

  function toggleTheme(): void {
    const currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const nextTheme: ThemeMode = currentTheme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    saveTheme(nextTheme);
  }

  function statusLabel(status: RecordingStatus): string {
    switch (status) {
      case "RECORDING":
        return "Recording";
      case "PAUSED":
        return "Paused";
      case "STOPPED":
        return "Stopped";
      case "IDLE":
        return "Idle";
    }
  }

  function formatLineCount(count: number): string {
    return count === 1 ? "1 line" : `${count} lines`;
  }

  function setError(message: string | null): void {
    elements.errorText.textContent = message || "";
  }

  async function sendMessage(type: string, payload: Record<string, unknown> = {}): Promise<any> {
    try {
      return await chrome.runtime.sendMessage({ type, payload });
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "EXTENSION_CONTEXT_INVALIDATED",
          message: error instanceof Error ? error.message : "Extension context invalidated. Reload the extension and reopen the side panel."
        }
      };
    }
  }

  async function refreshState(): Promise<void> {
    const response = await sendMessage(MessageType.GET_ACTIVE_TAB_STATE);
    if (response?.ok && response.state) {
      render(response.state);
      return;
    }

    setError(response?.error?.message || "Unable to read the active tab state.");
  }

  async function runCommand(type: string): Promise<void> {
    if (!currentState?.tabId) {
      setError("Open a Google Meet tab, then try again.");
      return;
    }

    const response = await sendMessage(type, { tabId: currentState.tabId });
    if (response?.ok && response.state) {
      render(response.state);
      return;
    }

    if (response?.ok && response.filename && typeof response.text === "string") {
      await downloadTranscript(response.text, response.filename);
      return;
    }

    setError(response?.error?.message || "Command failed.");
  }

  async function downloadTranscript(text: string, filename: string): Promise<void> {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    try {
      await chrome.downloads.download({
        url,
        filename,
        saveAs: true,
        conflictAction: "uniquify"
      });
      setError(`Saved ${filename}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Export failed.");
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }
  }

  function buttonState(status: RecordingStatus, supported: boolean, hasLines: boolean): void {
    elements.startButton.disabled = !supported || status === "RECORDING" || status === "PAUSED";
    elements.pauseButton.disabled = status !== "RECORDING";
    elements.resumeButton.disabled = status !== "PAUSED";
    elements.stopButton.disabled = status !== "RECORDING" && status !== "PAUSED";
    elements.clearButton.disabled = !hasLines && status === "IDLE";
    elements.saveButton.disabled = !hasLines;
    elements.copyButton.disabled = !hasLines;

    if (!supported) {
      elements.startButton.textContent = "Open Google Meet";
      elements.startButton.title = "Open a Google Meet tab to start recording.";
    } else if (status === "RECORDING") {
      elements.startButton.textContent = "Recording active";
      elements.startButton.title = "Recording is already active.";
    } else if (status === "PAUSED") {
      elements.startButton.textContent = "Recording paused";
      elements.startButton.title = "Resume or stop the current recording before starting again.";
    } else {
      elements.startButton.textContent = "Start recording";
      elements.startButton.title = "Start saving visible Google Meet captions.";
    }

    elements.pauseButton.title = elements.pauseButton.disabled ? "Pause is available while recording." : "Pause recording.";
    elements.resumeButton.title = elements.resumeButton.disabled ? "Resume is available while paused." : "Resume recording.";
    elements.stopButton.title = elements.stopButton.disabled ? "Stop is available while recording or paused." : "Stop recording.";
    elements.clearButton.title = elements.clearButton.disabled ? "Nothing to clear yet." : "Clear the current transcript.";
    elements.saveButton.title = elements.saveButton.disabled ? "No transcript lines to save yet." : "Save the transcript as a text file.";
    elements.copyButton.title = elements.copyButton.disabled ? "No transcript lines to copy yet." : "Copy transcript.";
  }

  function copyTextWithFallback(text: string): boolean {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.left = "-1000px";
    document.body.appendChild(textarea);
    textarea.select();

    try {
      return document.execCommand("copy");
    } finally {
      textarea.remove();
    }
  }

  function showCopyFeedback(): void {
    if (copyFeedbackTimer !== undefined) {
      window.clearTimeout(copyFeedbackTimer);
    }

    elements.copyButton.classList.remove("copy-success");
    void elements.copyButton.offsetWidth;
    elements.copyButton.classList.add("copy-success");
    elements.copyButton.setAttribute("aria-label", "Transcript copied");
    elements.copyButton.title = "Copied";

    copyFeedbackTimer = window.setTimeout(() => {
      elements.copyButton.classList.remove("copy-success");
      elements.copyButton.setAttribute("aria-label", "Copy transcript");
      elements.copyButton.title = elements.copyButton.disabled ? "No transcript lines to copy yet." : "Copy transcript.";
      copyFeedbackTimer = undefined;
    }, 900);
  }

  function showAiCopyFeedback(): void {
    if (aiCopyFeedbackTimer !== undefined) {
      window.clearTimeout(aiCopyFeedbackTimer);
    }

    elements.copyAiNotesButton.classList.remove("copy-success");
    void elements.copyAiNotesButton.offsetWidth;
    elements.copyAiNotesButton.classList.add("copy-success");
    elements.copyAiNotesButton.setAttribute("aria-label", "AI meeting notes copied");
    elements.copyAiNotesButton.title = "Copied";

    aiCopyFeedbackTimer = window.setTimeout(() => {
      elements.copyAiNotesButton.classList.remove("copy-success");
      elements.copyAiNotesButton.setAttribute("aria-label", "Copy AI meeting notes");
      elements.copyAiNotesButton.title = elements.copyAiNotesButton.disabled
        ? "Generate AI meeting notes before copying."
        : "Copy AI meeting notes.";
      aiCopyFeedbackTimer = undefined;
    }, 900);
  }

  async function copyTranscript(): Promise<void> {
    if (!currentState?.session.lines.length) {
      setError("No transcript lines to copy yet.");
      return;
    }

    const text = formatTranscriptAsTxt(currentState.session);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (!copyTextWithFallback(text)) {
        throw new Error("Clipboard API is unavailable.");
      }

      setError("Copied transcript");
      showCopyFeedback();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Copy failed.");
    }
  }

  async function copyAiNotes(): Promise<void> {
    if (!currentState?.session.aiArtifacts) {
      setError("Generate AI meeting notes before copying them.");
      return;
    }

    const text = formatMeetingArtifactsAsMarkdown(currentState.session);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (!copyTextWithFallback(text)) {
        throw new Error("Clipboard API is unavailable.");
      }

      setError("Copied AI meeting notes");
      showAiCopyFeedback();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Copy failed.");
    }
  }

  function renderTranscript(lines: TranscriptLine[]): void {
    const shouldScroll = elements.autoScrollToggle.checked;
    const fragment = document.createDocumentFragment();

    if (lines.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-row";
      empty.textContent = currentState?.session.status === "PAUSED"
        ? "Paused. New captions are visible but not being saved."
        : "Open a Google Meet tab, turn on captions, then click Start recording.";
      fragment.appendChild(empty);
    } else {
      for (const line of lines) {
        const row = document.createElement("li");
        row.className = "transcript-row";

        const time = document.createElement("span");
        time.className = "transcript-time";
        time.textContent = formatClockTime(line.startedAt);

        const body = document.createElement("span");
        body.className = "transcript-body";

        const speaker = document.createElement("span");
        speaker.className = "transcript-speaker";
        speaker.textContent = line.speaker;

        const text = document.createElement("span");
        text.className = "transcript-caption";
        text.textContent = line.text;

        body.append(speaker, text);
        row.append(time, body);
        fragment.appendChild(row);
      }
    }

    elements.transcriptList.replaceChildren(fragment);

    if (shouldScroll) {
      elements.transcriptList.scrollTop = elements.transcriptList.scrollHeight;
    }
  }

  function renderCaptionStatus(state: TabRuntimeState): void {
    if (!state.supported) {
      elements.captionStatus.textContent = "Not on Google Meet";
      elements.latestCandidate.textContent = "Open a supported Google Meet tab to capture captions.";
      return;
    }

    if (!state.canConnectToContentScript) {
      elements.captionStatus.textContent = "Refresh required";
      elements.latestCandidate.textContent = "Refresh the Google Meet tab so the extension can reconnect.";
      return;
    }

    if (state.captions.detected) {
      elements.captionStatus.textContent = "Captions detected";
    } else if (state.session.status === "RECORDING" || state.session.status === "PAUSED") {
      elements.captionStatus.textContent = "Waiting for captions";
    } else {
      elements.captionStatus.textContent = "No captions detected";
    }

    if (state.captions.latestCandidate) {
      const candidate = state.captions.latestCandidate;
      elements.latestCandidate.textContent = `${candidate.speaker || UNKNOWN_SPEAKER}: ${candidate.text}`;
    } else {
      elements.latestCandidate.textContent = "No captions detected yet. Turn on captions in Google Meet.";
    }
  }

  function setAiTab(tab: AiTab): void {
    currentAiTab = tab;
    const tabs: Array<[AiTab, HTMLButtonElement, HTMLElement]> = [
      ["summary", elements.aiTabSummary, elements.aiPanelSummary],
      ["actions", elements.aiTabActions, elements.aiPanelActions],
      ["mom", elements.aiTabMom, elements.aiPanelMom]
    ];

    for (const [tabName, tabButton, panel] of tabs) {
      const active = tabName === tab;
      tabButton.classList.toggle("active", active);
      tabButton.setAttribute("aria-selected", active ? "true" : "false");
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    }
  }

  function renderActionItems(items: AiActionItem[]): void {
    const fragment = document.createDocumentFragment();

    if (items.length === 0) {
      const empty = document.createElement("li");
      empty.className = "ai-empty-row";
      empty.textContent = "No action items identified.";
      fragment.appendChild(empty);
    } else {
      for (const item of items) {
        const row = document.createElement("li");
        row.className = "ai-action-row";

        const task = document.createElement("div");
        task.className = "ai-action-task";
        task.textContent = item.task;

        const meta = document.createElement("div");
        meta.className = "ai-action-meta";
        meta.textContent = [
          item.owner ? `Owner: ${item.owner}` : "Owner: Unassigned",
          item.dueDate ? `Due: ${item.dueDate}` : "Due: Unspecified",
          `Priority: ${item.priority}`,
          `Status: ${item.status || "open"}`
        ].join(" | ");

        row.append(task, meta);
        fragment.appendChild(row);
      }
    }

    elements.aiActionItemsList.replaceChildren(fragment);
  }

  function appendMomSection(fragment: DocumentFragment, title: string, items: string[], emptyText: string): void {
    const heading = document.createElement("h3");
    heading.textContent = title;
    fragment.appendChild(heading);

    const list = document.createElement("ul");
    list.className = "ai-mom-list";

    const values = items.length > 0 ? items : [emptyText];
    for (const value of values) {
      const item = document.createElement("li");
      item.textContent = value;
      if (items.length === 0) {
        item.className = "ai-muted-item";
      }
      list.appendChild(item);
    }

    fragment.appendChild(list);
  }

  function renderMom(minutes: AiMinutesOfMeeting): void {
    const fragment = document.createDocumentFragment();
    const overview = document.createElement("p");
    overview.className = "ai-body-text";
    overview.textContent = minutes.overview || "No overview generated.";
    fragment.appendChild(overview);

    appendMomSection(fragment, "Attendees", minutes.attendees, "No attendees identified.");
    appendMomSection(fragment, "Key topics", minutes.keyTopics, "No key topics identified.");
    appendMomSection(fragment, "Decisions", minutes.decisions, "No decisions identified.");
    appendMomSection(fragment, "Risks", minutes.risks, "No risks identified.");
    appendMomSection(fragment, "Next steps", minutes.nextSteps, "No next steps identified.");

    elements.aiMomContent.replaceChildren(fragment);
  }

  function renderAiArtifacts(session: TranscriptSession): void {
    const artifacts = session.aiArtifacts;

    if (!artifacts) {
      elements.aiGeneratedMeta.textContent = "No AI notes generated yet.";
      elements.aiSummaryText.textContent = "No AI notes generated yet.";
      renderActionItems([]);
      renderMom({
        overview: "",
        attendees: [],
        keyTopics: [],
        decisions: [],
        risks: [],
        nextSteps: []
      });
      return;
    }

    elements.aiGeneratedMeta.textContent = `Generated ${formatLocalDateTime(artifacts.generatedAt)} with ${artifacts.model}`;
    elements.aiSummaryText.textContent = artifacts.executiveSummary || "No executive summary generated.";
    renderActionItems(artifacts.actionItems);
    renderMom(artifacts.minutesOfMeeting);
  }

  function renderAiSection(state: TabRuntimeState): void {
    const session = state.session;
    const hasLines = session.lines.length > 0;
    const hasArtifacts = Boolean(session.aiArtifacts);
    const hasCurrentArtifacts = hasCurrentAiArtifacts(session);
    const isGenerating = state.ai.generationStatus === "generating";
    const canGenerate = hasLines && state.ai.enabled && state.ai.configured && !isGenerating;

    elements.generateAiNotesButton.disabled = !canGenerate;
    elements.copyAiNotesButton.disabled = !hasArtifacts;
    elements.saveAiNotesButton.disabled = !hasArtifacts;
    elements.copyAiNotesButton.title = hasArtifacts ? "Copy AI meeting notes." : "Generate AI meeting notes before copying.";
    elements.saveAiNotesButton.title = hasArtifacts ? "Save AI meeting notes as Markdown." : "Generate AI meeting notes before saving.";

    if (!state.ai.enabled) {
      elements.generateAiNotesButton.textContent = "AI disabled";
      elements.generateAiNotesButton.title = "AI meeting notes are disabled for this build.";
      elements.aiStatusText.textContent = "AI disabled for this build.";
    } else if (!state.ai.configured) {
      elements.generateAiNotesButton.textContent = "Add Gemini key";
      elements.generateAiNotesButton.title = "Set FREESCRIBE_GEMINI_API_KEY in .env, rebuild, and reload the extension.";
      elements.aiStatusText.textContent = "Gemini key missing in this build.";
    } else if (!hasLines) {
      elements.generateAiNotesButton.textContent = "Generate notes";
      elements.generateAiNotesButton.title = "Capture transcript lines before generating notes.";
      elements.aiStatusText.textContent = "Capture captions first.";
    } else if (isGenerating) {
      elements.generateAiNotesButton.textContent = "Generating...";
      elements.generateAiNotesButton.title = "AI meeting notes are being generated.";
      elements.aiStatusText.textContent = "Generating notes...";
    } else if (hasArtifacts && !hasCurrentArtifacts) {
      elements.generateAiNotesButton.textContent = "Regenerate notes";
      elements.generateAiNotesButton.title = "Regenerate notes for the latest transcript.";
      elements.aiStatusText.textContent = "Transcript changed since notes were generated.";
    } else if (hasArtifacts) {
      elements.generateAiNotesButton.textContent = "Regenerate notes";
      elements.generateAiNotesButton.title = "Generate a fresh version of the AI meeting notes.";
      elements.aiStatusText.textContent = "AI notes ready.";
    } else {
      elements.generateAiNotesButton.textContent = "Generate notes";
      elements.generateAiNotesButton.title = "Generate summary, action items, and MoM from the transcript.";
      elements.aiStatusText.textContent = "Ready.";
    }

    elements.aiGeneratedMeta.classList.toggle("stale", hasArtifacts && !hasCurrentArtifacts);
    renderAiArtifacts(session);
    setAiTab(currentAiTab);
  }

  function render(state: TabRuntimeState): void {
    currentState = state;
    const session = state.session;
    const hasLines = session.lines.length > 0;
    const status = statusLabel(session.status);

    elements.statusPill.textContent = status;
    elements.statusPill.className = `status-pill ${session.status.toLowerCase()}`;
    elements.supportText.textContent = state.supported
      ? state.canConnectToContentScript
        ? "Google Meet tab ready"
        : "Refresh the Meet tab to reconnect"
      : "Not on Google Meet";
    elements.meetingTitle.textContent = session.meetingTitle || "Unknown";
    elements.meetingCode.textContent = session.meetingCode || "Unknown";
    elements.startedAt.textContent = session.startedAt ? formatLocalDateTime(session.startedAt) : "Not started";
    elements.lineCount.textContent = formatLineCount(session.lines.length);
    elements.autosaveStatus.textContent = state.autosaveStatus === "error"
      ? "Autosave error"
      : state.autosaveStatus === "dirty"
        ? "Unsaved changes"
        : state.autosaveStatus === "saving"
          ? "Saving..."
          : "Autosaved";
    elements.lastCapturedAt.textContent = session.lastCapturedAt
      ? `Last captured: ${formatClockTime(session.lastCapturedAt)}`
      : "Last captured: Never";

    buttonState(session.status, state.supported, hasLines);
    renderCaptionStatus(state);
    renderTranscript(session.lines);
    renderAiSection(state);

    const errorMessage = state.error?.message || state.autosaveError || "";
    if (errorMessage) {
      setError(errorMessage);
    } else if (
      elements.errorText.textContent?.startsWith("Saved ") ||
      elements.errorText.textContent?.startsWith("Copied ")
    ) {
      // Keep a recent success message visible until another state change has useful information.
    } else {
      setError(null);
    }
  }

  elements.startButton.addEventListener("click", () => {
    if (currentState?.session.status === "STOPPED" && currentState.session.lines.length > 0) {
      const confirmed = confirm("Start a new session and replace the current transcript?");
      if (!confirmed) {
        return;
      }
    }

    void runCommand(MessageType.START_RECORDING);
  });

  elements.pauseButton.addEventListener("click", () => void runCommand(MessageType.PAUSE_RECORDING));
  elements.resumeButton.addEventListener("click", () => void runCommand(MessageType.RESUME_RECORDING));
  elements.stopButton.addEventListener("click", () => void runCommand(MessageType.STOP_RECORDING));
  elements.saveButton.addEventListener("click", () => void runCommand(MessageType.SAVE_TXT));
  elements.copyButton.addEventListener("click", () => void copyTranscript());
  elements.generateAiNotesButton.addEventListener("click", () => void runCommand(MessageType.GENERATE_MEETING_ARTIFACTS));
  elements.copyAiNotesButton.addEventListener("click", () => void copyAiNotes());
  elements.saveAiNotesButton.addEventListener("click", () => void runCommand(MessageType.SAVE_AI_NOTES_MD));
  elements.themeToggle.addEventListener("click", toggleTheme);

  elements.aiTabSummary.addEventListener("click", () => setAiTab("summary"));
  elements.aiTabActions.addEventListener("click", () => setAiTab("actions"));
  elements.aiTabMom.addEventListener("click", () => setAiTab("mom"));

  elements.clearButton.addEventListener("click", () => {
    if (currentState?.session.lines.length) {
      const confirmed = confirm("Clear the current transcript?");
      if (!confirmed) {
        return;
      }
    }

    void runCommand(MessageType.CLEAR_SESSION);
  });

  chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (message.type !== MessageType.TAB_STATE_UPDATED) {
      return false;
    }

    const payload = message.payload as TabRuntimeState | { activeTabUpdate?: boolean; state?: TabRuntimeState };
    const state = "state" in payload && payload.state ? payload.state : payload as TabRuntimeState;
    const isActiveTabUpdate = "activeTabUpdate" in payload && payload.activeTabUpdate === true;
    if (isActiveTabUpdate || !currentState || currentState.tabId === state.tabId) {
      render(state);
    }

    return false;
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      void refreshState();
    }
  });

  setTheme(getStoredTheme() || getSystemTheme());
  void refreshState();
}
