namespace LMCL {
  interface Elements {
    supportText: HTMLElement;
    statusPill: HTMLElement;
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
    captionStatus: mustGetElement("captionStatus"),
    autoScrollToggle: mustGetElement("autoScrollToggle"),
    latestCandidate: mustGetElement("latestCandidate"),
    transcriptList: mustGetElement("transcriptList"),
    lineCount: mustGetElement("lineCount"),
    autosaveStatus: mustGetElement("autosaveStatus"),
    lastCapturedAt: mustGetElement("lastCapturedAt"),
    errorText: mustGetElement("errorText")
  };

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

    if (response?.ok && response.filename) {
      setError(`Saved ${response.filename}`);
      return;
    }

    setError(response?.error?.message || "Command failed.");
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
        speaker.textContent = `${line.speaker}:`;

        const text = document.createElement("span");
        text.textContent = ` ${line.text}`;

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

  function render(state: TabRuntimeState): void {
    currentState = state;
    const session = state.session;
    const hasLines = session.lines.length > 0;
    const status = statusLabel(session.status);

    elements.statusPill.textContent = status;
    elements.statusPill.className = `status-pill ${session.status.toLowerCase()}`;
    elements.supportText.textContent = state.supported ? "Google Meet tab connected" : "Not on Google Meet";
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

    const state = message.payload as TabRuntimeState;
    if (!currentState || currentState.tabId === state.tabId) {
      render(state);
    }

    return false;
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      void refreshState();
    }
  });

  void refreshState();
}
