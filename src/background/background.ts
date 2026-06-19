namespace LMCL {
  const MEET_URL_PREFIX = "https://meet.google.com/";
  const AUTOSAVE_DEBOUNCE_MS = 1_000;

  const sessionsByTabId: Record<string, TranscriptSession> = {};
  const captionsByTabId: Record<string, CaptionDetectionState> = {};
  const autosaveStatusByTabId: Record<string, AutosaveStatus> = {};
  const autosaveErrorByTabId: Record<string, string | null> = {};
  const runtimeErrorByTabId: Record<string, ExtensionError | null> = {};

  let storageLoaded = false;
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

  function tabKey(tabId: number | null | undefined): string {
    return String(tabId ?? "active");
  }

  function isMeetUrl(url: string | null | undefined): boolean {
    return typeof url === "string" && url.startsWith(MEET_URL_PREFIX);
  }

  function getMeetingCode(url: string | null | undefined): string | null {
    if (!isMeetUrl(url)) {
      return null;
    }

    try {
      const parsedUrl = new URL(url || "");
      const firstPathPart = parsedUrl.pathname.split("/").filter(Boolean)[0] || "";
      return firstPathPart || null;
    } catch {
      return null;
    }
  }

  function createSessionId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function getSession(tabId: number | null | undefined): TranscriptSession {
    const key = tabKey(tabId);
    if (!sessionsByTabId[key]) {
      sessionsByTabId[key] = createEmptySession();
    }

    return sessionsByTabId[key];
  }

  function setSession(tabId: number, session: TranscriptSession): void {
    sessionsByTabId[tabKey(tabId)] = session;
  }

  function getCaptionState(tabId: number | null | undefined): CaptionDetectionState {
    const key = tabKey(tabId);
    if (!captionsByTabId[key]) {
      captionsByTabId[key] = {
        detected: false,
        observedAt: null,
        latestCandidate: null
      };
    }

    return captionsByTabId[key];
  }

  async function ensureStorageLoaded(): Promise<void> {
    if (storageLoaded) {
      return;
    }

    const stored = await loadStoredState();
    Object.assign(sessionsByTabId, stored.sessionsByTabId);
    storageLoaded = true;
  }

  async function flushAutosave(): Promise<void> {
    if (!storageLoaded) {
      return;
    }

    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }

    for (const key of Object.keys(sessionsByTabId)) {
      autosaveStatusByTabId[key] = "saving";
      autosaveErrorByTabId[key] = null;
    }

    try {
      await saveStoredState(sessionsByTabId);
      for (const key of Object.keys(sessionsByTabId)) {
        autosaveStatusByTabId[key] = "saved";
        autosaveErrorByTabId[key] = null;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Storage unavailable or quota exceeded.";
      for (const key of Object.keys(sessionsByTabId)) {
        autosaveStatusByTabId[key] = "error";
        autosaveErrorByTabId[key] = message;
      }
    }
  }

  function scheduleAutosave(tabId: number): void {
    autosaveStatusByTabId[tabKey(tabId)] = "dirty";
    autosaveErrorByTabId[tabKey(tabId)] = null;

    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
    }

    autosaveTimer = setTimeout(() => {
      void flushAutosave().then(() => broadcastTabState(tabId));
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  async function getActiveTab(): Promise<any | null> {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tabs?.[0] ?? null;
  }

  async function getTab(tabId: number | null | undefined): Promise<any | null> {
    if (typeof tabId !== "number") {
      return getActiveTab();
    }

    try {
      return await chrome.tabs.get(tabId);
    } catch {
      return null;
    }
  }

  function metadataFromTab(tab: any | null): MeetingMetadata {
    const url = typeof tab?.url === "string" ? tab.url : null;
    const title = typeof tab?.title === "string" && tab.title.trim() ? tab.title.trim() : null;

    return {
      meetingTitle: title,
      meetingUrl: isMeetUrl(url) ? url : null,
      meetingCode: getMeetingCode(url)
    };
  }

  function buildTabState(tab: any | null, tabIdOverride?: number | null): TabRuntimeState {
    const tabId = typeof tabIdOverride === "number" ? tabIdOverride : typeof tab?.id === "number" ? tab.id : null;
    const key = tabKey(tabId);
    const supported = isMeetUrl(tab?.url);

    return {
      tabId,
      supported,
      canConnectToContentScript: supported,
      session: cloneSession(getSession(tabId)),
      captions: { ...getCaptionState(tabId) },
      autosaveStatus: autosaveStatusByTabId[key] ?? "saved",
      autosaveError: autosaveErrorByTabId[key] ?? null,
      error: runtimeErrorByTabId[key] ?? null
    };
  }

  async function broadcastTabState(tabId: number): Promise<void> {
    const tab = await getTab(tabId);
    Promise.resolve(chrome.runtime.sendMessage({
      type: MessageType.TAB_STATE_UPDATED,
      payload: buildTabState(tab, tabId)
    })).catch(() => {
      // No side panel is open. This is expected during normal use.
    });
  }

  async function askContentForMetadata(tabId: number): Promise<MeetingMetadata | null> {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: MessageType.GET_PAGE_METADATA });
      if (response?.ok && response.metadata) {
        runtimeErrorByTabId[tabKey(tabId)] = null;
        return response.metadata;
      }
    } catch {
      runtimeErrorByTabId[tabKey(tabId)] = {
        code: "CONTENT_SCRIPT_UNAVAILABLE",
        message: "Could not connect to the Google Meet content script. Refresh the Meet tab, then reopen the side panel."
      };
    }

    return null;
  }

  async function startRecording(tabId: number): Promise<TabRuntimeState> {
    const tab = await getTab(tabId);
    const tabMetadata = metadataFromTab(tab);
    const contentMetadata = isMeetUrl(tab?.url) ? await askContentForMetadata(tabId) : null;
    const metadata = contentMetadata ?? tabMetadata;
    const startedAt = Date.now();

    const session: TranscriptSession = {
      sessionId: createSessionId(),
      status: "RECORDING",
      meetingTitle: metadata.meetingTitle,
      meetingUrl: metadata.meetingUrl,
      meetingCode: metadata.meetingCode,
      startedAt,
      endedAt: null,
      lastCapturedAt: null,
      lines: []
    };

    setSession(tabId, session);
    await flushAutosave();
    await broadcastTabState(tabId);
    return buildTabState(tab, tabId);
  }

  async function updateStatus(tabId: number, status: RecordingStatus): Promise<TabRuntimeState> {
    const tab = await getTab(tabId);
    const session = getSession(tabId);
    const now = Date.now();
    const nextSession: TranscriptSession = {
      ...session,
      status,
      endedAt: status === "STOPPED" ? now : status === "RECORDING" ? null : session.endedAt
    };

    setSession(tabId, nextSession);
    await flushAutosave();
    await broadcastTabState(tabId);
    return buildTabState(tab, tabId);
  }

  async function clearSession(tabId: number): Promise<TabRuntimeState> {
    const tab = await getTab(tabId);
    setSession(tabId, createEmptySession());
    captionsByTabId[tabKey(tabId)] = {
      detected: false,
      observedAt: null,
      latestCandidate: null
    };
    runtimeErrorByTabId[tabKey(tabId)] = null;
    await flushAutosave();
    await broadcastTabState(tabId);
    return buildTabState(tab, tabId);
  }

  async function saveTxt(tabId: number): Promise<{ ok: true; filename: string } | { ok: false; error: ExtensionError }> {
    const session = getSession(tabId);

    if (session.lines.length === 0) {
      return {
        ok: false,
        error: {
          code: "EMPTY_TRANSCRIPT",
          message: "There are no transcript lines to save yet."
        }
      };
    }

    try {
      const text = formatTranscriptAsTxt(session);
      const filename = createTranscriptFilename(session);
      const url = `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
      await chrome.downloads.download({
        url,
        filename,
        saveAs: true,
        conflictAction: "uniquify"
      });
      return { ok: true, filename };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed.";
      return {
        ok: false,
        error: {
          code: "EXPORT_FAILED",
          message
        }
      };
    }
  }

  function readPayloadTabId(message: ExtensionMessage, sender: any): number | null {
    const payload = message.payload as { tabId?: unknown } | undefined;
    if (typeof payload?.tabId === "number") {
      return payload.tabId;
    }

    if (typeof sender?.tab?.id === "number") {
      return sender.tab.id;
    }

    return null;
  }

  async function handleCaptionCandidate(tabId: number, candidate: CaptionCandidate): Promise<void> {
    const captionState = getCaptionState(tabId);
    captionState.detected = true;
    captionState.observedAt = candidate.observedAt;
    captionState.latestCandidate = candidate;

    const previousSession = getSession(tabId);
    const nextSession = applyCaptionCandidate(previousSession, candidate);
    if (nextSession !== previousSession) {
      setSession(tabId, nextSession);
      scheduleAutosave(tabId);
    }

    await broadcastTabState(tabId);
  }

  async function handleCaptionsDetected(tabId: number, detected: boolean, observedAt: number): Promise<void> {
    const captionState = getCaptionState(tabId);
    captionState.detected = detected;
    captionState.observedAt = observedAt;
    await broadcastTabState(tabId);
  }

  async function handleMessage(message: ExtensionMessage, sender: any): Promise<unknown> {
    await ensureStorageLoaded();

    const tabId = readPayloadTabId(message, sender);

    switch (message.type) {
      case MessageType.GET_ACTIVE_TAB_STATE: {
        const tab = await getActiveTab();
        return { ok: true, state: buildTabState(tab) };
      }
      case MessageType.GET_SESSION: {
        const tab = await getTab(tabId);
        return { ok: true, state: buildTabState(tab, tabId) };
      }
      case MessageType.START_RECORDING: {
        if (typeof tabId !== "number") {
          return { ok: false, error: { code: "NO_ACTIVE_TAB", message: "Open a Google Meet tab, then try again." } };
        }
        return { ok: true, state: await startRecording(tabId) };
      }
      case MessageType.PAUSE_RECORDING: {
        if (typeof tabId !== "number") {
          return { ok: false, error: { code: "NO_ACTIVE_TAB", message: "No active tab found." } };
        }
        return { ok: true, state: await updateStatus(tabId, "PAUSED") };
      }
      case MessageType.RESUME_RECORDING: {
        if (typeof tabId !== "number") {
          return { ok: false, error: { code: "NO_ACTIVE_TAB", message: "No active tab found." } };
        }
        return { ok: true, state: await updateStatus(tabId, "RECORDING") };
      }
      case MessageType.STOP_RECORDING: {
        if (typeof tabId !== "number") {
          return { ok: false, error: { code: "NO_ACTIVE_TAB", message: "No active tab found." } };
        }
        return { ok: true, state: await updateStatus(tabId, "STOPPED") };
      }
      case MessageType.CLEAR_SESSION: {
        if (typeof tabId !== "number") {
          return { ok: false, error: { code: "NO_ACTIVE_TAB", message: "No active tab found." } };
        }
        return { ok: true, state: await clearSession(tabId) };
      }
      case MessageType.SAVE_TXT: {
        if (typeof tabId !== "number") {
          return { ok: false, error: { code: "NO_ACTIVE_TAB", message: "No active tab found." } };
        }
        return saveTxt(tabId);
      }
      case MessageType.CAPTION_CANDIDATE: {
        if (typeof tabId === "number") {
          await handleCaptionCandidate(tabId, message.payload as CaptionCandidate);
        }
        return { ok: true };
      }
      case MessageType.CAPTIONS_DETECTED: {
        const payload = message.payload as { detected?: unknown; observedAt?: unknown } | undefined;
        if (typeof tabId === "number") {
          await handleCaptionsDetected(
            tabId,
            Boolean(payload?.detected),
            typeof payload?.observedAt === "number" ? payload.observedAt : Date.now()
          );
        }
        return { ok: true };
      }
      default:
        return {
          ok: false,
          error: {
            code: "UNKNOWN_MESSAGE",
            message: `Unsupported message type: ${message.type}`
          }
        };
    }
  }

  chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender: any, sendResponse: (response: unknown) => void) => {
    handleMessage(message, sender)
      .then(sendResponse)
      .catch((error) => {
        const messageText = error instanceof Error ? error.message : "Unexpected extension error.";
        sendResponse({
          ok: false,
          error: {
            code: "UNEXPECTED_ERROR",
            message: messageText
          }
        });
      });

    return true;
  });

  chrome.runtime.onInstalled.addListener(() => {
    if (chrome.sidePanel?.setPanelBehavior) {
      Promise.resolve(chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })).catch(() => {
        // Older Chrome versions may not support this helper.
      });
    }
  });

  chrome.action.onClicked.addListener((tab: any) => {
    if (chrome.sidePanel?.open && typeof tab?.id === "number") {
      Promise.resolve(chrome.sidePanel.open({ tabId: tab.id })).catch(() => {
        // The default side panel path still works from Chrome's side panel UI.
      });
    }
  });
}
