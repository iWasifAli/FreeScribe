namespace LMCL {
  const MEET_URL_PREFIX = "https://meet.google.com/";
  const AUTOSAVE_DEBOUNCE_MS = 1_000;

  const sessionsByTabId: Record<string, TranscriptSession> = {};
  const sessionsByMeetingKey: Record<string, TranscriptSession> = {};
  const captionsByTabId: Record<string, CaptionDetectionState> = {};
  const autosaveStatusByTabId: Record<string, AutosaveStatus> = {};
  const autosaveErrorByTabId: Record<string, string | null> = {};
  const runtimeErrorByTabId: Record<string, ExtensionError | null> = {};
  const contentScriptAvailableByTabId: Record<string, boolean> = {};

  let storageLoaded = false;
  let storageLoadPromise: Promise<void> | null = null;
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

  function meetingKeyFromParts(meetingUrl: string | null | undefined, meetingCode: string | null | undefined): string | null {
    if (meetingCode) {
      return `code:${meetingCode}`;
    }

    if (isMeetUrl(meetingUrl)) {
      try {
        const parsedUrl = new URL(meetingUrl || "");
        return `url:${parsedUrl.origin}${parsedUrl.pathname}`;
      } catch {
        return `url:${meetingUrl}`;
      }
    }

    return null;
  }

  function meetingKeyFromSession(session: TranscriptSession): string | null {
    return meetingKeyFromParts(session.meetingUrl, session.meetingCode);
  }

  function meetingKeyFromMetadata(metadata: MeetingMetadata): string | null {
    return meetingKeyFromParts(metadata.meetingUrl, metadata.meetingCode);
  }

  function isMeaningfulSession(session: TranscriptSession): boolean {
    return Boolean(session.sessionId || session.startedAt || session.lines.length > 0 || session.status !== "IDLE");
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

    const meetingKey = meetingKeyFromSession(session);
    if (meetingKey && isMeaningfulSession(session)) {
      sessionsByMeetingKey[meetingKey] = cloneSession(session);
    }
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

    if (!storageLoadPromise) {
      storageLoadPromise = loadStoredState().then((stored) => {
        Object.assign(sessionsByTabId, stored.sessionsByTabId);
        Object.assign(sessionsByMeetingKey, stored.sessionsByMeetingKey);

        for (const session of Object.values(stored.sessionsByTabId)) {
          const meetingKey = meetingKeyFromSession(session);
          if (meetingKey && isMeaningfulSession(session) && !sessionsByMeetingKey[meetingKey]) {
            sessionsByMeetingKey[meetingKey] = cloneSession(session);
          }
        }

        storageLoaded = true;
      });
    }

    await storageLoadPromise;
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
      await saveStoredState(sessionsByTabId, sessionsByMeetingKey);
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

  function reconcileSessionForTab(tabId: number | null, metadata: MeetingMetadata): void {
    if (typeof tabId !== "number") {
      return;
    }

    const key = tabKey(tabId);
    if (isMeaningfulSession(sessionsByTabId[key] || createEmptySession())) {
      return;
    }

    const meetingKey = meetingKeyFromMetadata(metadata);
    const recoveredSession = meetingKey ? sessionsByMeetingKey[meetingKey] : null;
    if (recoveredSession) {
      sessionsByTabId[key] = cloneSession(recoveredSession);
    }
  }

  function buildTabState(tab: any | null, tabIdOverride?: number | null): TabRuntimeState {
    const tabId = typeof tabIdOverride === "number" ? tabIdOverride : typeof tab?.id === "number" ? tab.id : null;
    const key = tabKey(tabId);
    const supported = isMeetUrl(tab?.url);
    const metadata = metadataFromTab(tab);

    if (supported) {
      reconcileSessionForTab(tabId, metadata);
    }

    return {
      tabId,
      supported,
      canConnectToContentScript: supported && contentScriptAvailableByTabId[key] !== false,
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

  async function broadcastActiveTabState(tabId: number): Promise<void> {
    const tab = await getTab(tabId);
    Promise.resolve(chrome.runtime.sendMessage({
      type: MessageType.TAB_STATE_UPDATED,
      payload: {
        activeTabUpdate: true,
        state: buildTabState(tab, tabId)
      }
    })).catch(() => {
      // No side panel is open. This is expected during normal use.
    });
  }

  async function startContentCapture(tabId: number): Promise<MeetingMetadata | null> {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: MessageType.START_CAPTURE });
      if (response?.ok && response.metadata) {
        runtimeErrorByTabId[tabKey(tabId)] = null;
        contentScriptAvailableByTabId[tabKey(tabId)] = true;
        return response.metadata;
      }
    } catch {
      runtimeErrorByTabId[tabKey(tabId)] = {
        code: "CONTENT_SCRIPT_UNAVAILABLE",
        message: "Could not connect to the Google Meet content script. Refresh the Meet tab, then reopen the side panel."
      };
      contentScriptAvailableByTabId[tabKey(tabId)] = false;
    }

    return null;
  }

  async function stopContentCapture(tabId: number): Promise<void> {
    try {
      await chrome.tabs.sendMessage(tabId, { type: MessageType.STOP_CAPTURE });
      contentScriptAvailableByTabId[tabKey(tabId)] = true;
    } catch {
      contentScriptAvailableByTabId[tabKey(tabId)] = false;
    }
  }

  function errorResponse(code: string, message: string): { ok: false; error: ExtensionError } {
    return { ok: false, error: { code, message } };
  }

  async function restartContentCaptureAfterReload(tabId: number, updatedTab: any | null): Promise<void> {
    await ensureStorageLoaded();

    const tab = isMeetUrl(updatedTab?.url) ? updatedTab : await getTab(tabId);
    if (!isMeetUrl(tab?.url)) {
      await broadcastTabState(tabId);
      return;
    }

    const session = getSession(tabId);
    if (session.status !== "RECORDING") {
      await broadcastTabState(tabId);
      return;
    }

    await startContentCapture(tabId);
    await broadcastTabState(tabId);
  }

  async function startRecording(tabId: number): Promise<{ ok: true; state: TabRuntimeState } | { ok: false; error: ExtensionError }> {
    const tab = await getTab(tabId);
    if (!isMeetUrl(tab?.url)) {
      return errorResponse("UNSUPPORTED_TAB", "Open a Google Meet tab, then try again.");
    }

    const existingSession = getSession(tabId);
    if (existingSession.status === "RECORDING" || existingSession.status === "PAUSED") {
      return errorResponse("SESSION_ACTIVE", "Stop the current recording before starting a new session.");
    }

    const tabMetadata = metadataFromTab(tab);
    const contentMetadata = await startContentCapture(tabId);
    if (!contentMetadata) {
      await broadcastTabState(tabId);
      return errorResponse(
        "CONTENT_SCRIPT_UNAVAILABLE",
        "Could not connect to the Google Meet content script. Refresh the Meet tab, then reopen the side panel."
      );
    }

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
    return { ok: true, state: buildTabState(tab, tabId) };
  }

  async function updateStatus(
    tabId: number,
    status: RecordingStatus
  ): Promise<{ ok: true; state: TabRuntimeState } | { ok: false; error: ExtensionError }> {
    const tab = await getTab(tabId);
    if (!isMeetUrl(tab?.url)) {
      return errorResponse("UNSUPPORTED_TAB", "Open a Google Meet tab, then try again.");
    }

    const session = getSession(tabId);
    const now = Date.now();

    if (status === "PAUSED" && session.status !== "RECORDING") {
      return errorResponse("INVALID_STATE", "Pause is only available while recording.");
    }

    if (status === "RECORDING" && session.status !== "PAUSED") {
      return errorResponse("INVALID_STATE", "Resume is only available while paused.");
    }

    if (status === "STOPPED" && session.status !== "RECORDING" && session.status !== "PAUSED") {
      return errorResponse("INVALID_STATE", "Stop is only available while recording or paused.");
    }

    if (status === "RECORDING") {
      const metadata = await startContentCapture(tabId);
      if (!metadata) {
        await broadcastTabState(tabId);
        return errorResponse(
          "CONTENT_SCRIPT_UNAVAILABLE",
          "Could not connect to the Google Meet content script. Refresh the Meet tab, then reopen the side panel."
        );
      }
    } else {
      await stopContentCapture(tabId);
    }

    const nextSession: TranscriptSession = {
      ...session,
      status,
      endedAt: status === "STOPPED" ? now : status === "RECORDING" ? null : session.endedAt
    };

    setSession(tabId, nextSession);
    await flushAutosave();
    await broadcastTabState(tabId);
    return { ok: true, state: buildTabState(tab, tabId) };
  }

  async function clearSession(tabId: number): Promise<TabRuntimeState> {
    const tab = await getTab(tabId);
    const previousMeetingKey = meetingKeyFromSession(getSession(tabId));
    await stopContentCapture(tabId);
    setSession(tabId, createEmptySession());
    captionsByTabId[tabKey(tabId)] = {
      detected: false,
      observedAt: null,
      latestCandidate: null
    };
    runtimeErrorByTabId[tabKey(tabId)] = null;
    contentScriptAvailableByTabId[tabKey(tabId)] = true;
    if (previousMeetingKey) {
      delete sessionsByMeetingKey[previousMeetingKey];
    }
    await flushAutosave();
    await broadcastTabState(tabId);
    return buildTabState(tab, tabId);
  }

  async function prepareTxtExport(
    tabId: number
  ): Promise<{ ok: true; filename: string; text: string } | { ok: false; error: ExtensionError }> {
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

    const text = formatTranscriptAsTxt(session);
    const filename = createTranscriptFilename(session);
    return { ok: true, filename, text };
  }

  function isContentScriptSender(sender: any): boolean {
    return typeof sender?.tab?.id === "number";
  }

  function isMeetContentSender(sender: any): boolean {
    return isContentScriptSender(sender) && isMeetUrl(sender.tab.url);
  }

  function readUiPayloadTabId(message: ExtensionMessage, sender: any): number | null {
    if (isContentScriptSender(sender)) {
      return null;
    }

    const payload = message.payload as { tabId?: unknown } | undefined;
    return typeof payload?.tabId === "number" ? payload.tabId : null;
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

    const senderIsContentScript = isContentScriptSender(sender);
    const contentTabId = isMeetContentSender(sender) ? sender.tab.id : null;
    const uiTabId = readUiPayloadTabId(message, sender);

    switch (message.type) {
      case MessageType.GET_ACTIVE_TAB_STATE: {
        if (senderIsContentScript) {
          return errorResponse("UNAUTHORIZED_SENDER", "This command is not available from a content script.");
        }
        const tab = await getActiveTab();
        return { ok: true, state: buildTabState(tab) };
      }
      case MessageType.GET_SESSION: {
        if (senderIsContentScript) {
          return errorResponse("UNAUTHORIZED_SENDER", "This command is not available from a content script.");
        }
        const tabId = uiTabId;
        const tab = await getTab(tabId);
        return { ok: true, state: buildTabState(tab, tabId) };
      }
      case MessageType.START_RECORDING: {
        if (senderIsContentScript) {
          return errorResponse("UNAUTHORIZED_SENDER", "This command is not available from a content script.");
        }
        const tabId = uiTabId;
        if (typeof tabId !== "number") {
          return { ok: false, error: { code: "NO_ACTIVE_TAB", message: "Open a Google Meet tab, then try again." } };
        }
        return startRecording(tabId);
      }
      case MessageType.PAUSE_RECORDING: {
        if (senderIsContentScript) {
          return errorResponse("UNAUTHORIZED_SENDER", "This command is not available from a content script.");
        }
        const tabId = uiTabId;
        if (typeof tabId !== "number") {
          return { ok: false, error: { code: "NO_ACTIVE_TAB", message: "No active tab found." } };
        }
        return updateStatus(tabId, "PAUSED");
      }
      case MessageType.RESUME_RECORDING: {
        if (senderIsContentScript) {
          return errorResponse("UNAUTHORIZED_SENDER", "This command is not available from a content script.");
        }
        const tabId = uiTabId;
        if (typeof tabId !== "number") {
          return { ok: false, error: { code: "NO_ACTIVE_TAB", message: "No active tab found." } };
        }
        return updateStatus(tabId, "RECORDING");
      }
      case MessageType.STOP_RECORDING: {
        if (senderIsContentScript) {
          return errorResponse("UNAUTHORIZED_SENDER", "This command is not available from a content script.");
        }
        const tabId = uiTabId;
        if (typeof tabId !== "number") {
          return { ok: false, error: { code: "NO_ACTIVE_TAB", message: "No active tab found." } };
        }
        return updateStatus(tabId, "STOPPED");
      }
      case MessageType.CLEAR_SESSION: {
        if (senderIsContentScript) {
          return errorResponse("UNAUTHORIZED_SENDER", "This command is not available from a content script.");
        }
        const tabId = uiTabId;
        if (typeof tabId !== "number") {
          return { ok: false, error: { code: "NO_ACTIVE_TAB", message: "No active tab found." } };
        }
        return { ok: true, state: await clearSession(tabId) };
      }
      case MessageType.SAVE_TXT: {
        if (senderIsContentScript) {
          return errorResponse("UNAUTHORIZED_SENDER", "This command is not available from a content script.");
        }
        const tabId = uiTabId;
        if (typeof tabId !== "number") {
          return { ok: false, error: { code: "NO_ACTIVE_TAB", message: "No active tab found." } };
        }
        return prepareTxtExport(tabId);
      }
      case MessageType.CAPTION_CANDIDATE: {
        const tabId = contentTabId;
        if (typeof tabId === "number") {
          await handleCaptionCandidate(tabId, message.payload as CaptionCandidate);
        }
        return { ok: true };
      }
      case MessageType.CAPTIONS_DETECTED: {
        const payload = message.payload as { detected?: unknown; observedAt?: unknown } | undefined;
        const tabId = contentTabId;
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

  chrome.tabs?.onActivated?.addListener((activeInfo: { tabId?: number }) => {
    if (typeof activeInfo?.tabId === "number") {
      void broadcastActiveTabState(activeInfo.tabId);
    }
  });

  chrome.tabs?.onUpdated?.addListener((tabId: number, changeInfo: { status?: string }, tab: any) => {
    delete contentScriptAvailableByTabId[tabKey(tabId)];
    runtimeErrorByTabId[tabKey(tabId)] = null;

    if (changeInfo?.status === "complete") {
      void restartContentCaptureAfterReload(tabId, tab);
      return;
    }

    void broadcastTabState(tabId);
  });

  chrome.tabs?.onRemoved?.addListener((tabId: number) => {
    delete sessionsByTabId[tabKey(tabId)];
    delete captionsByTabId[tabKey(tabId)];
    delete autosaveStatusByTabId[tabKey(tabId)];
    delete autosaveErrorByTabId[tabKey(tabId)];
    delete runtimeErrorByTabId[tabKey(tabId)];
    delete contentScriptAvailableByTabId[tabKey(tabId)];
    void flushAutosave();
  });
}
