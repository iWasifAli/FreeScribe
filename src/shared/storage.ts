namespace LMCL {
  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function isStatus(value: unknown): value is RecordingStatus {
    return value === "IDLE" || value === "RECORDING" || value === "PAUSED" || value === "STOPPED";
  }

  function sanitizeLine(value: unknown): TranscriptLine | null {
    if (!isRecord(value)) {
      return null;
    }

    const id = typeof value.id === "string" ? value.id : "";
    const speaker = typeof value.speaker === "string" ? normalizeSpeaker(value.speaker) : UNKNOWN_SPEAKER;
    const text = typeof value.text === "string" ? normalizeText(value.text) : "";
    const startedAt = typeof value.startedAt === "number" ? value.startedAt : 0;
    const updatedAt = typeof value.updatedAt === "number" ? value.updatedAt : startedAt;
    const revision = typeof value.revision === "number" ? value.revision : 0;
    const sourceNodeHash = typeof value.sourceNodeHash === "string" ? value.sourceNodeHash : undefined;

    if (!id || !text || !startedAt) {
      return null;
    }

    return { id, speaker, text, startedAt, updatedAt, revision, sourceNodeHash };
  }

  function sanitizeStoredTextArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => normalizeText(String(item ?? "")))
      .filter((item) => item.length > 0);
  }

  function sanitizeStoredPriority(value: unknown): AiActionPriority {
    return value === "low" || value === "medium" || value === "high" || value === "unknown"
      ? value
      : "unknown";
  }

  function sanitizeStoredActionItems(value: unknown): AiActionItem[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const items: AiActionItem[] = [];
    for (const item of value) {
      if (!isRecord(item)) {
        continue;
      }

      const task = normalizeText(String(item.task ?? ""));
      if (!task) {
        continue;
      }

      items.push({
        task,
        owner: item.owner === null || item.owner === undefined ? null : normalizeText(String(item.owner)) || null,
        dueDate: item.dueDate === null || item.dueDate === undefined ? null : normalizeText(String(item.dueDate)) || null,
        priority: sanitizeStoredPriority(item.priority),
        status: normalizeText(String(item.status ?? "")) || "open"
      });
    }

    return items;
  }

  function sanitizeStoredMinutes(value: unknown): AiMinutesOfMeeting {
    const source = isRecord(value) ? value : {};
    return {
      overview: normalizeText(String(source.overview ?? "")),
      attendees: sanitizeStoredTextArray(source.attendees),
      keyTopics: sanitizeStoredTextArray(source.keyTopics),
      decisions: sanitizeStoredTextArray(source.decisions),
      risks: sanitizeStoredTextArray(source.risks),
      nextSteps: sanitizeStoredTextArray(source.nextSteps)
    };
  }

  function sanitizeStoredAiArtifacts(value: unknown): AiMeetingArtifacts | null {
    if (!isRecord(value)) {
      return null;
    }

    const generatedAt = typeof value.generatedAt === "number" ? value.generatedAt : 0;
    const model = typeof value.model === "string" ? normalizeText(value.model) : "";
    const transcriptLineCount = typeof value.transcriptLineCount === "number" ? value.transcriptLineCount : -1;
    const transcriptUpdatedAt = typeof value.transcriptUpdatedAt === "number" ? value.transcriptUpdatedAt : null;

    if (!generatedAt || !model || transcriptLineCount < 0) {
      return null;
    }

    return {
      executiveSummary: normalizeText(String(value.executiveSummary ?? "")),
      actionItems: sanitizeStoredActionItems(value.actionItems),
      minutesOfMeeting: sanitizeStoredMinutes(value.minutesOfMeeting),
      generatedAt,
      model,
      transcriptLineCount,
      transcriptUpdatedAt
    };
  }

  function sanitizeSession(value: unknown): TranscriptSession | null {
    if (!isRecord(value)) {
      return null;
    }

    const status = isStatus(value.status) ? value.status : "IDLE";
    const lines = Array.isArray(value.lines)
      ? value.lines.map(sanitizeLine).filter((line): line is TranscriptLine => Boolean(line))
      : [];

    return {
      sessionId: typeof value.sessionId === "string" ? value.sessionId : "",
      status,
      meetingTitle: typeof value.meetingTitle === "string" ? value.meetingTitle : null,
      meetingUrl: typeof value.meetingUrl === "string" ? value.meetingUrl : null,
      meetingCode: typeof value.meetingCode === "string" ? value.meetingCode : null,
      startedAt: typeof value.startedAt === "number" ? value.startedAt : null,
      endedAt: typeof value.endedAt === "number" ? value.endedAt : null,
      lastCapturedAt: typeof value.lastCapturedAt === "number" ? value.lastCapturedAt : null,
      lines,
      aiArtifacts: sanitizeStoredAiArtifacts(value.aiArtifacts)
    };
  }

  export async function loadStoredState(): Promise<StoredState> {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const stored = result?.[STORAGE_KEY];
    const empty: StoredState = {
      version: 3,
      sessionsByTabId: {},
      sessionsByMeetingKey: {},
      updatedAt: Date.now()
    };

    if (!isRecord(stored)) {
      return empty;
    }

    const sessionsByTabId: Record<string, TranscriptSession> = {};
    const sessionsByMeetingKey: Record<string, TranscriptSession> = {};

    if (isRecord(stored.sessionsByTabId)) {
      for (const [tabId, sessionValue] of Object.entries(stored.sessionsByTabId)) {
        const session = sanitizeSession(sessionValue);
        if (session) {
          sessionsByTabId[tabId] = session;
        }
      }
    }

    if ((stored.version === 2 || stored.version === 3) && isRecord(stored.sessionsByMeetingKey)) {
      for (const [meetingKey, sessionValue] of Object.entries(stored.sessionsByMeetingKey)) {
        const session = sanitizeSession(sessionValue);
        if (session) {
          sessionsByMeetingKey[meetingKey] = session;
        }
      }
    }

    return {
      version: 3,
      sessionsByTabId,
      sessionsByMeetingKey,
      updatedAt: typeof stored.updatedAt === "number" ? stored.updatedAt : Date.now()
    };
  }

  export async function saveStoredState(
    sessionsByTabId: Record<string, TranscriptSession>,
    sessionsByMeetingKey: Record<string, TranscriptSession>
  ): Promise<void> {
    const state: StoredState = {
      version: 3,
      sessionsByTabId,
      sessionsByMeetingKey,
      updatedAt: Date.now()
    };

    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  }
}
