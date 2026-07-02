namespace LMCL {
  const MEET_URL_PREFIX = "https://meet.google.com/";
  const AUTOSAVE_DEBOUNCE_MS = 1_000;
  const AI_GENERATE_TIMEOUT_MS = 60_000;
  const GEMINI_API_KEY_PLACEHOLDER = "__FREESCRIBE_GEMINI_API_KEY__";
  const GEMINI_MODEL_PLACEHOLDER = "__FREESCRIBE_GEMINI_MODEL__";
  const AI_ENABLED_PLACEHOLDER = "__FREESCRIBE_AI_ENABLED__";
  const INJECTED_GEMINI_API_KEY = "__FREESCRIBE_GEMINI_API_KEY__";
  const INJECTED_GEMINI_MODEL = "__FREESCRIBE_GEMINI_MODEL__";
  const INJECTED_AI_ENABLED = "__FREESCRIBE_AI_ENABLED__";

  const sessionsByTabId: Record<string, TranscriptSession> = {};
  const sessionsByMeetingKey: Record<string, TranscriptSession> = {};
  const captionsByTabId: Record<string, CaptionDetectionState> = {};
  const autosaveStatusByTabId: Record<string, AutosaveStatus> = {};
  const autosaveErrorByTabId: Record<string, string | null> = {};
  const runtimeErrorByTabId: Record<string, ExtensionError | null> = {};
  const contentScriptAvailableByTabId: Record<string, boolean> = {};
  const aiGenerationByTabId: Record<string, boolean> = {};
  const fileAutosaveStateBySessionId: Record<string, FileAutosaveRuntimeState> = {};
  const fileAutosaveTimerBySessionId: Record<string, ReturnType<typeof setTimeout>> = {};

  let storageLoaded = false;
  let storageLoadPromise: Promise<void> | null = null;
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

  function tabKey(tabId: number | null | undefined): string {
    return String(tabId ?? "active");
  }

  function readInjectedValue(value: string, placeholder: string): string {
    return value === placeholder ? "" : value.trim();
  }

  function isEnabledEnvValue(value: string): boolean {
    return value.trim().toLowerCase() === "true";
  }

  function getAiConfig(): Omit<AiRuntimeState, "generationStatus"> & { apiKey: string } {
    const enabledValue = readInjectedValue(INJECTED_AI_ENABLED, AI_ENABLED_PLACEHOLDER);
    const enabled = isEnabledEnvValue(enabledValue);
    const apiKey = readInjectedValue(INJECTED_GEMINI_API_KEY, GEMINI_API_KEY_PLACEHOLDER);
    const model = readInjectedValue(INJECTED_GEMINI_MODEL, GEMINI_MODEL_PLACEHOLDER) || "gemini-3.5-flash";
    const configured = enabled && Boolean(apiKey);

    return {
      enabled,
      configured,
      model,
      reason: !enabled ? "disabled" : configured ? "ready" : "missing_key",
      apiKey
    };
  }

  function getAiRuntimeState(tabId: number | null | undefined): AiRuntimeState {
    const config = getAiConfig();
    return {
      enabled: config.enabled,
      configured: config.configured,
      model: config.model,
      reason: config.reason,
      generationStatus: aiGenerationByTabId[tabKey(tabId)] ? "generating" : "idle"
    };
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
    return createMeetingKey(meetingUrl, meetingCode);
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

  function isFileAutosaveSupportedInBackground(): boolean {
    return isMeetingStoreSupported();
  }

  function getFileAutosaveState(session: TranscriptSession): FileAutosaveRuntimeState {
    if (!session.sessionId) {
      return createEmptyFileAutosaveRuntimeState(isFileAutosaveSupportedInBackground());
    }

    return fileAutosaveStateBySessionId[session.sessionId]
      ?? createEmptyFileAutosaveRuntimeState(isFileAutosaveSupportedInBackground());
  }

  async function refreshFileAutosaveState(
    session: TranscriptSession,
    statusOverride?: FileAutosaveStatus
  ): Promise<FileAutosaveRuntimeState> {
    if (!session.sessionId) {
      return createEmptyFileAutosaveRuntimeState(isFileAutosaveSupportedInBackground());
    }

    try {
      const linkedFile = await getLinkedTranscriptFile(session.sessionId);
      const state = fileAutosaveRuntimeFromLink(linkedFile, isFileAutosaveSupportedInBackground(), statusOverride);
      fileAutosaveStateBySessionId[session.sessionId] = state;
      return state;
    } catch (error) {
      const state: FileAutosaveRuntimeState = {
        supported: false,
        status: "error",
        fileName: null,
        linkedAt: null,
        lastSavedAt: null,
        permission: "unknown",
        error: error instanceof Error ? error.message : "Unable to read linked transcript file state."
      };
      fileAutosaveStateBySessionId[session.sessionId] = state;
      return state;
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

    const meetingKey = meetingKeyFromSession(session);
    if (meetingKey && isMeaningfulSession(session)) {
      sessionsByMeetingKey[meetingKey] = cloneSession(session);
    }
  }

  function removeSessionFromMeetingKeyCache(sessionId: string): void {
    for (const [meetingKey, session] of Object.entries(sessionsByMeetingKey)) {
      if (session.sessionId === sessionId) {
        delete sessionsByMeetingKey[meetingKey];
      }
    }
  }

  function clearSessionFromTabCaches(sessionId: string): number[] {
    const clearedTabIds: number[] = [];
    for (const [key, session] of Object.entries(sessionsByTabId)) {
      if (session.sessionId !== sessionId) {
        continue;
      }

      delete sessionsByTabId[key];
      delete captionsByTabId[key];
      delete autosaveStatusByTabId[key];
      delete autosaveErrorByTabId[key];
      delete runtimeErrorByTabId[key];
      delete contentScriptAvailableByTabId[key];

      const tabId = Number(key);
      if (Number.isFinite(tabId)) {
        clearedTabIds.push(tabId);
      }
    }

    return clearedTabIds;
  }

  function isFileAutosaveStatus(value: unknown): value is FileAutosaveStatus {
    return (
      value === "unsupported" ||
      value === "unlinked" ||
      value === "dirty" ||
      value === "saving" ||
      value === "saved" ||
      value === "paused" ||
      value === "error"
    );
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
      storageLoadPromise = loadStoredState().then(async (stored) => {
        try {
          if (isMeetingStoreSupported()) {
            await migrateStoredStateToMeetingStore(stored);
          }
        } catch (error) {
          console.warn("[FreeScribe] Meeting library migration failed", error);
        }

        Object.assign(sessionsByTabId, stored.sessionsByTabId);
        Object.assign(sessionsByMeetingKey, stored.sessionsByMeetingKey);

        for (const session of Object.values(stored.sessionsByTabId)) {
          const meetingKey = meetingKeyFromSession(session);
          if (meetingKey && isMeaningfulSession(session) && !sessionsByMeetingKey[meetingKey]) {
            sessionsByMeetingKey[meetingKey] = cloneSession(session);
          }
          if (isMeaningfulSession(session)) {
            try {
              await saveMeetingSession(session);
              await refreshFileAutosaveState(session);
            } catch (error) {
              console.warn("[FreeScribe] Meeting library hydration failed", error);
            }
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

    let libraryError: string | null = null;
    for (const session of Object.values(sessionsByTabId)) {
      if (isMeaningfulSession(session)) {
        try {
          await saveMeetingSession(session);
          await refreshFileAutosaveState(session);
        } catch (error) {
          libraryError = error instanceof Error ? error.message : "Meeting library autosave failed.";
        }
      }
    }

    try {
      await saveStoredState(sessionsByTabId, sessionsByMeetingKey);
      if (libraryError) {
        throw new Error(libraryError);
      }
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

  async function flushLinkedFileAutosaveForSession(
    tabId: number,
    session: TranscriptSession,
    force = false
  ): Promise<void> {
    if (!session.sessionId) {
      return;
    }

    if (fileAutosaveTimerBySessionId[session.sessionId]) {
      clearTimeout(fileAutosaveTimerBySessionId[session.sessionId]);
      delete fileAutosaveTimerBySessionId[session.sessionId];
    }

    let linkedFile: LinkedTranscriptFile | null = null;
    try {
      linkedFile = await getLinkedTranscriptFile(session.sessionId);
    } catch (error) {
      fileAutosaveStateBySessionId[session.sessionId] = {
        supported: false,
        status: "error",
        fileName: null,
        linkedAt: null,
        lastSavedAt: null,
        permission: "unknown",
        error: error instanceof Error ? error.message : "Unable to read linked transcript file."
      };
      await broadcastTabState(tabId);
      return;
    }

    if (!linkedFile) {
      fileAutosaveStateBySessionId[session.sessionId] = createEmptyFileAutosaveRuntimeState(isFileAutosaveSupportedInBackground());
      await broadcastTabState(tabId);
      return;
    }

    const now = Date.now();
    if (!shouldFlushLinkedTranscriptFile(session, linkedFile, { now, force })) {
      const state = fileAutosaveRuntimeFromLink(linkedFile, isFileAutosaveSupportedInBackground(), "dirty");
      fileAutosaveStateBySessionId[session.sessionId] = state;
      const delay = Math.max(500, FILE_AUTOSAVE_INTERVAL_MS - (now - (linkedFile.lastWriteAt ?? now)));
      fileAutosaveTimerBySessionId[session.sessionId] = setTimeout(() => {
        void flushLinkedFileAutosaveForSession(tabId, getSession(tabId), false);
      }, delay);
      await broadcastTabState(tabId);
      return;
    }

    fileAutosaveStateBySessionId[session.sessionId] = fileAutosaveRuntimeFromLink(
      linkedFile,
      isFileAutosaveSupportedInBackground(),
      "saving"
    );
    await broadcastTabState(tabId);

    const result = await writeLinkedTranscriptFile(session, linkedFile, { now, requestPermission: false });
    fileAutosaveStateBySessionId[session.sessionId] = fileAutosaveRuntimeFromLink(
      result.linkedFile,
      isFileAutosaveSupportedInBackground(),
      result.status
    );
    await broadcastTabState(tabId);
  }

  function scheduleLinkedFileAutosave(tabId: number, session: TranscriptSession): void {
    if (!session.sessionId) {
      return;
    }

    const existingState = getFileAutosaveState(session);
    if (existingState.status === "unsupported" || existingState.status === "unlinked") {
      return;
    }

    fileAutosaveStateBySessionId[session.sessionId] = {
      ...existingState,
      status: "dirty",
      error: null
    };

    if (fileAutosaveTimerBySessionId[session.sessionId]) {
      clearTimeout(fileAutosaveTimerBySessionId[session.sessionId]);
    }

    fileAutosaveTimerBySessionId[session.sessionId] = setTimeout(() => {
      void flushLinkedFileAutosaveForSession(tabId, getSession(tabId), false);
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
      fileAutosave: getFileAutosaveState(getSession(tabId)),
      error: runtimeErrorByTabId[key] ?? null,
      ai: getAiRuntimeState(tabId)
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
    if (isMeaningfulSession(existingSession)) {
      await saveMeetingSession(existingSession);
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
      lines: [],
      aiArtifacts: null
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
    if (status === "PAUSED" || status === "STOPPED") {
      await flushLinkedFileAutosaveForSession(tabId, nextSession, true);
    }
    await broadcastTabState(tabId);
    return { ok: true, state: buildTabState(tab, tabId) };
  }

  async function clearSession(tabId: number): Promise<TabRuntimeState> {
    const tab = await getTab(tabId);
    const previousSession = getSession(tabId);
    const previousMeetingKey = meetingKeyFromSession(previousSession);
    if (isMeaningfulSession(previousSession)) {
      await saveMeetingSession(previousSession);
      await flushLinkedFileAutosaveForSession(tabId, previousSession, true);
    }
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

  async function readGeminiErrorMessage(response: Response): Promise<string> {
    try {
      const body = await response.json();
      const message = body?.error?.message;
      if (typeof message === "string" && message.trim()) {
        return message.trim();
      }
    } catch {
      // Fall through to the HTTP status message.
    }

    return response.statusText || `HTTP ${response.status}`;
  }

  function extractGeminiText(responseBody: unknown): string {
    if (typeof responseBody !== "object" || responseBody === null) {
      throw new Error("Gemini returned an empty response.");
    }

    const body = responseBody as {
      promptFeedback?: { blockReason?: unknown };
      candidates?: Array<{
        finishReason?: unknown;
        content?: { parts?: Array<{ text?: unknown }> };
      }>;
    };

    const blockReason = typeof body.promptFeedback?.blockReason === "string" ? body.promptFeedback.blockReason : "";
    if (blockReason) {
      throw new Error(`Gemini blocked the request: ${blockReason}.`);
    }

    const candidate = body.candidates?.[0];
    const text = candidate?.content?.parts
      ?.map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();

    if (!text) {
      const finishReason = typeof candidate?.finishReason === "string" ? candidate.finishReason : "unknown";
      throw new Error(`Gemini did not return meeting notes. Finish reason: ${finishReason}.`);
    }

    return text;
  }

  async function requestGeminiArtifacts(
    session: TranscriptSession,
    config: Omit<AiRuntimeState, "generationStatus"> & { apiKey: string }
  ): Promise<AiMeetingArtifacts> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_GENERATE_TIMEOUT_MS);
    const generatedAt = Date.now();
    const transcriptUpdatedAt = getTranscriptUpdatedAt(session);
    const modelId = config.model.replace(/^models\//, "");
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": config.apiKey
        },
        body: JSON.stringify(buildGeminiGenerateContentRequest(session)),
        signal: controller.signal
      });

      if (!response.ok) {
        const message = await readGeminiErrorMessage(response);
        throw new Error(`Gemini request failed: ${message}`);
      }

      const responseBody = await response.json();
      return parseMeetingArtifactsJson(extractGeminiText(responseBody), {
        generatedAt,
        model: config.model,
        transcriptLineCount: session.lines.length,
        transcriptUpdatedAt
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("Gemini request timed out. Try again with a shorter transcript.");
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function generateMeetingArtifacts(
    tabId: number
  ): Promise<{ ok: true; state: TabRuntimeState } | { ok: false; error: ExtensionError }> {
    const tab = await getTab(tabId);
    const session = getSession(tabId);
    const sourceSessionId = session.sessionId;
    const config = getAiConfig();

    if (!config.enabled) {
      return errorResponse(
        "AI_DISABLED",
        "AI meeting notes are disabled for this build. Set FREESCRIBE_AI_ENABLED=true and FREESCRIBE_GEMINI_API_KEY in .env, then rebuild."
      );
    }

    if (!config.configured) {
      return errorResponse(
        "GEMINI_API_KEY_MISSING",
        "Missing Gemini API key. Set FREESCRIBE_GEMINI_API_KEY in .env, then run npm run build and reload the extension."
      );
    }

    if (session.lines.length === 0) {
      return errorResponse("EMPTY_TRANSCRIPT", "Capture transcript lines before generating AI meeting notes.");
    }

    if (aiGenerationByTabId[tabKey(tabId)]) {
      return errorResponse("AI_GENERATION_IN_PROGRESS", "AI meeting notes are already being generated.");
    }

    aiGenerationByTabId[tabKey(tabId)] = true;
    await broadcastTabState(tabId);

    try {
      const artifacts = await requestGeminiArtifacts(session, config);
      const latestSession = getSession(tabId);
      const nextSession = mergeAiArtifactsIntoSession(sourceSessionId, latestSession, artifacts);
      if (!nextSession) {
        return errorResponse(
          "AI_SESSION_CHANGED",
          "The transcript session changed while AI notes were being generated. Please generate notes again."
        );
      }

      setSession(tabId, nextSession);
      await flushAutosave();
      return { ok: true, state: buildTabState(tab, tabId) };
    } catch (error) {
      return errorResponse("AI_GENERATION_FAILED", error instanceof Error ? error.message : "AI generation failed.");
    } finally {
      delete aiGenerationByTabId[tabKey(tabId)];
      await broadcastTabState(tabId);
    }
  }

  function prepareAiNotesExport(
    tabId: number
  ): { ok: true; filename: string; text: string } | { ok: false; error: ExtensionError } {
    const session = getSession(tabId);

    if (!session.aiArtifacts) {
      return {
        ok: false,
        error: {
          code: "NO_AI_NOTES",
          message: "Generate AI meeting notes before saving them."
        }
      };
    }

    return {
      ok: true,
      filename: createMeetingArtifactsFilename(session),
      text: formatMeetingArtifactsAsMarkdown(session)
    };
  }

  async function listMeetingLibrary(search: string): Promise<MeetingLibraryResult> {
    const records = await getAllMeetingRecords();
    const result = queryMeetingRecords(records, { search, limit: DEFAULT_MEETING_LIBRARY_LIMIT });
    const summaries: MeetingSummary[] = [];

    for (const summary of result.summaries) {
      const linkedFile = await getLinkedTranscriptFile(summary.sessionId);
      summaries.push({
        ...summary,
        fileAutosave: fileAutosaveRuntimeFromLink(linkedFile, isFileAutosaveSupportedInBackground())
      });
    }

    return {
      ...result,
      summaries
    };
  }

  async function getArchivedMeetingRecord(
    sessionId: string
  ): Promise<{ ok: true; record: MeetingRecord; fileAutosave: FileAutosaveRuntimeState } | { ok: false; error: ExtensionError }> {
    const record = await getMeetingRecord(sessionId);
    if (!record) {
      return errorResponse("MEETING_NOT_FOUND", "Meeting not found in the local library.");
    }

    const linkedFile = await getLinkedTranscriptFile(sessionId);
    return {
      ok: true,
      record,
      fileAutosave: fileAutosaveRuntimeFromLink(linkedFile, isFileAutosaveSupportedInBackground())
    };
  }

  async function prepareArchivedTxtExport(
    sessionId: string
  ): Promise<{ ok: true; filename: string; text: string } | { ok: false; error: ExtensionError }> {
    const recordResult = await getArchivedMeetingRecord(sessionId);
    if (!recordResult.ok) {
      return recordResult;
    }

    if (recordResult.record.session.lines.length === 0) {
      return errorResponse("EMPTY_TRANSCRIPT", "There are no transcript lines to save for this meeting.");
    }

    return {
      ok: true,
      filename: createTranscriptFilename(recordResult.record.session),
      text: formatTranscriptAsTxt(recordResult.record.session)
    };
  }

  async function prepareArchivedAiNotesExport(
    sessionId: string
  ): Promise<{ ok: true; filename: string; text: string } | { ok: false; error: ExtensionError }> {
    const recordResult = await getArchivedMeetingRecord(sessionId);
    if (!recordResult.ok) {
      return recordResult;
    }

    if (!recordResult.record.session.aiArtifacts) {
      return errorResponse("NO_AI_NOTES", "This meeting does not have generated AI notes.");
    }

    return {
      ok: true,
      filename: createMeetingArtifactsFilename(recordResult.record.session),
      text: formatMeetingArtifactsAsMarkdown(recordResult.record.session)
    };
  }

  async function deleteArchivedMeeting(
    sessionId: string,
    tabId: number | null
  ): Promise<{ ok: true; library: MeetingLibraryResult; state: TabRuntimeState | null } | { ok: false; error: ExtensionError }> {
    const record = await getMeetingRecord(sessionId);
    if (!record) {
      return errorResponse("MEETING_NOT_FOUND", "Meeting not found in the local library.");
    }

    await deleteMeetingRecord(sessionId);
    removeSessionFromMeetingKeyCache(sessionId);
    const clearedTabIds = clearSessionFromTabCaches(sessionId);
    delete fileAutosaveStateBySessionId[sessionId];
    if (fileAutosaveTimerBySessionId[sessionId]) {
      clearTimeout(fileAutosaveTimerBySessionId[sessionId]);
      delete fileAutosaveTimerBySessionId[sessionId];
    }

    let state: TabRuntimeState | null = null;
    await flushAutosave();
    for (const clearedTabId of clearedTabIds) {
      await broadcastTabState(clearedTabId);
    }

    if (typeof tabId === "number" && clearedTabIds.includes(tabId)) {
      const tab = await getTab(tabId);
      state = buildTabState(tab, tabId);
    }

    return {
      ok: true,
      library: await listMeetingLibrary(""),
      state
    };
  }

  async function restoreArchivedMeeting(
    sessionId: string,
    tabId: number | null
  ): Promise<{ ok: true; state: TabRuntimeState } | { ok: false; error: ExtensionError }> {
    if (typeof tabId !== "number") {
      return errorResponse("NO_ACTIVE_TAB", "Open a Google Meet tab before restoring a meeting.");
    }

    const tab = await getTab(tabId);
    if (!isMeetUrl(tab?.url)) {
      return errorResponse("UNSUPPORTED_TAB", "Open a Google Meet tab before restoring a meeting.");
    }

    const record = await getMeetingRecord(sessionId);
    if (!record) {
      return errorResponse("MEETING_NOT_FOUND", "Meeting not found in the local library.");
    }

    const restoredSession = cloneSession(record.session);
    if (restoredSession.status === "RECORDING") {
      restoredSession.status = "PAUSED";
    }

    setSession(tabId, restoredSession);
    await refreshFileAutosaveState(restoredSession);
    await flushAutosave();
    await broadcastTabState(tabId);
    return { ok: true, state: buildTabState(tab, tabId) };
  }

  async function markLinkedFileAutosave(
    tabId: number,
    statusOverride?: FileAutosaveStatus
  ): Promise<{ ok: true; state: TabRuntimeState } | { ok: false; error: ExtensionError }> {
    const tab = await getTab(tabId);
    const session = getSession(tabId);
    if (!session.sessionId) {
      return errorResponse("NO_SESSION", "Start or restore a meeting before linking a transcript file.");
    }

    await refreshFileAutosaveState(session, statusOverride);
    await broadcastTabState(tabId);
    return { ok: true, state: buildTabState(tab, tabId) };
  }

  async function unlinkFileAutosave(
    tabId: number
  ): Promise<{ ok: true; state: TabRuntimeState } | { ok: false; error: ExtensionError }> {
    const tab = await getTab(tabId);
    const session = getSession(tabId);
    if (!session.sessionId) {
      return errorResponse("NO_SESSION", "No active meeting is linked to a transcript file.");
    }

    await deleteLinkedTranscriptFile(session.sessionId);
    fileAutosaveStateBySessionId[session.sessionId] = createEmptyFileAutosaveRuntimeState(isFileAutosaveSupportedInBackground());
    if (fileAutosaveTimerBySessionId[session.sessionId]) {
      clearTimeout(fileAutosaveTimerBySessionId[session.sessionId]);
      delete fileAutosaveTimerBySessionId[session.sessionId];
    }
    await broadcastTabState(tabId);
    return { ok: true, state: buildTabState(tab, tabId) };
  }

  async function flushFileAutosaveCommand(
    tabId: number
  ): Promise<{ ok: true; state: TabRuntimeState } | { ok: false; error: ExtensionError }> {
    const tab = await getTab(tabId);
    const session = getSession(tabId);
    if (!session.sessionId) {
      return errorResponse("NO_SESSION", "Start or restore a meeting before flushing file autosave.");
    }

    await flushLinkedFileAutosaveForSession(tabId, session, true);
    return { ok: true, state: buildTabState(tab, tabId) };
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
      scheduleLinkedFileAutosave(tabId, nextSession);
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
      case MessageType.GET_MEETING_LIBRARY: {
        if (senderIsContentScript) {
          return errorResponse("UNAUTHORIZED_SENDER", "This command is not available from a content script.");
        }
        const payload = message.payload as { search?: unknown } | undefined;
        return { ok: true, library: await listMeetingLibrary(typeof payload?.search === "string" ? payload.search : "") };
      }
      case MessageType.GET_MEETING_RECORD: {
        if (senderIsContentScript) {
          return errorResponse("UNAUTHORIZED_SENDER", "This command is not available from a content script.");
        }
        const payload = message.payload as { sessionId?: unknown } | undefined;
        const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : "";
        return getArchivedMeetingRecord(sessionId);
      }
      case MessageType.DELETE_MEETING_RECORD: {
        if (senderIsContentScript) {
          return errorResponse("UNAUTHORIZED_SENDER", "This command is not available from a content script.");
        }
        const payload = message.payload as { sessionId?: unknown } | undefined;
        const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : "";
        return deleteArchivedMeeting(sessionId, uiTabId);
      }
      case MessageType.RESTORE_MEETING_RECORD: {
        if (senderIsContentScript) {
          return errorResponse("UNAUTHORIZED_SENDER", "This command is not available from a content script.");
        }
        const payload = message.payload as { sessionId?: unknown } | undefined;
        const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : "";
        return restoreArchivedMeeting(sessionId, uiTabId);
      }
      case MessageType.SAVE_ARCHIVED_TXT: {
        if (senderIsContentScript) {
          return errorResponse("UNAUTHORIZED_SENDER", "This command is not available from a content script.");
        }
        const payload = message.payload as { sessionId?: unknown } | undefined;
        const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : "";
        return prepareArchivedTxtExport(sessionId);
      }
      case MessageType.SAVE_ARCHIVED_AI_NOTES_MD: {
        if (senderIsContentScript) {
          return errorResponse("UNAUTHORIZED_SENDER", "This command is not available from a content script.");
        }
        const payload = message.payload as { sessionId?: unknown } | undefined;
        const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : "";
        return prepareArchivedAiNotesExport(sessionId);
      }
      case MessageType.LINK_TRANSCRIPT_FILE_AUTOSAVE: {
        if (senderIsContentScript) {
          return errorResponse("UNAUTHORIZED_SENDER", "This command is not available from a content script.");
        }
        const tabId = uiTabId;
        if (typeof tabId !== "number") {
          return { ok: false, error: { code: "NO_ACTIVE_TAB", message: "No active tab found." } };
        }
        const payload = message.payload as { status?: unknown } | undefined;
        return markLinkedFileAutosave(tabId, isFileAutosaveStatus(payload?.status) ? payload.status : undefined);
      }
      case MessageType.UNLINK_TRANSCRIPT_FILE_AUTOSAVE: {
        if (senderIsContentScript) {
          return errorResponse("UNAUTHORIZED_SENDER", "This command is not available from a content script.");
        }
        const tabId = uiTabId;
        if (typeof tabId !== "number") {
          return { ok: false, error: { code: "NO_ACTIVE_TAB", message: "No active tab found." } };
        }
        return unlinkFileAutosave(tabId);
      }
      case MessageType.FLUSH_TRANSCRIPT_FILE_AUTOSAVE: {
        if (senderIsContentScript) {
          return errorResponse("UNAUTHORIZED_SENDER", "This command is not available from a content script.");
        }
        const tabId = uiTabId;
        if (typeof tabId !== "number") {
          return { ok: false, error: { code: "NO_ACTIVE_TAB", message: "No active tab found." } };
        }
        return flushFileAutosaveCommand(tabId);
      }
      case MessageType.GENERATE_MEETING_ARTIFACTS: {
        if (senderIsContentScript) {
          return errorResponse("UNAUTHORIZED_SENDER", "This command is not available from a content script.");
        }
        const tabId = uiTabId;
        if (typeof tabId !== "number") {
          return { ok: false, error: { code: "NO_ACTIVE_TAB", message: "No active tab found." } };
        }
        return generateMeetingArtifacts(tabId);
      }
      case MessageType.SAVE_AI_NOTES_MD: {
        if (senderIsContentScript) {
          return errorResponse("UNAUTHORIZED_SENDER", "This command is not available from a content script.");
        }
        const tabId = uiTabId;
        if (typeof tabId !== "number") {
          return { ok: false, error: { code: "NO_ACTIVE_TAB", message: "No active tab found." } };
        }
        return prepareAiNotesExport(tabId);
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
    const removedSession = sessionsByTabId[tabKey(tabId)];
    void (async () => {
      if (removedSession && isMeaningfulSession(removedSession)) {
        await saveMeetingSession(removedSession);
        await flushLinkedFileAutosaveForSession(tabId, removedSession, true);
      }

      delete sessionsByTabId[tabKey(tabId)];
      delete captionsByTabId[tabKey(tabId)];
      delete autosaveStatusByTabId[tabKey(tabId)];
      delete autosaveErrorByTabId[tabKey(tabId)];
      delete runtimeErrorByTabId[tabKey(tabId)];
      delete contentScriptAvailableByTabId[tabKey(tabId)];
      await flushAutosave();
    })();
  });
}
