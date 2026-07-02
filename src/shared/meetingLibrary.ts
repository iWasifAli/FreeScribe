namespace LMCL {
  export const DEFAULT_MEETING_LIBRARY_LIMIT = 100;

  function recordUpdatedAt(session: TranscriptSession, fallback: number): number {
    const latestLineUpdate = session.lines.reduce((latest, line) => {
      return Math.max(latest, line.updatedAt || line.startedAt || 0);
    }, 0);

    return Math.max(
      latestLineUpdate,
      session.lastCapturedAt || 0,
      session.endedAt || 0,
      session.startedAt || 0,
      fallback
    );
  }

  export function createMeetingKey(meetingUrl: string | null | undefined, meetingCode: string | null | undefined): string | null {
    if (meetingCode) {
      return `code:${meetingCode}`;
    }

    if (typeof meetingUrl !== "string" || !meetingUrl.startsWith("https://meet.google.com/")) {
      return null;
    }

    try {
      const parsedUrl = new URL(meetingUrl);
      return `url:${parsedUrl.origin}${parsedUrl.pathname}`;
    } catch {
      return `url:${meetingUrl}`;
    }
  }

  export function createSearchTextForSession(session: TranscriptSession): string {
    return [
      session.meetingTitle,
      session.meetingUrl,
      session.meetingCode,
      session.status,
      session.lines.map((line) => `${line.speaker} ${line.text}`).join(" "),
      session.aiArtifacts?.executiveSummary || "",
      session.aiArtifacts?.actionItems.map((item) => `${item.task} ${item.owner || ""}`).join(" ") || "",
      session.aiArtifacts?.minutesOfMeeting.keyTopics.join(" ") || "",
      session.aiArtifacts?.minutesOfMeeting.decisions.join(" ") || ""
    ]
      .map((value) => normalizeText(String(value || "")).toLowerCase())
      .filter(Boolean)
      .join(" ");
  }

  export function isMeaningfulLibrarySession(session: TranscriptSession): boolean {
    return Boolean(
      session.sessionId ||
      session.startedAt ||
      session.endedAt ||
      session.lastCapturedAt ||
      session.lines.length > 0 ||
      session.aiArtifacts ||
      session.status !== "IDLE"
    );
  }

  export function createMeetingRecord(
    session: TranscriptSession,
    existingRecord: MeetingRecord | null = null,
    now: number = Date.now()
  ): MeetingRecord {
    const sessionId = session.sessionId || `session_${now}`;
    const normalizedSession: TranscriptSession = {
      ...cloneSession(session),
      sessionId
    };
    const updatedAt = recordUpdatedAt(normalizedSession, now);
    const archivedAt = normalizedSession.status === "STOPPED"
      ? existingRecord?.archivedAt ?? normalizedSession.endedAt ?? updatedAt
      : existingRecord?.archivedAt ?? null;

    return {
      sessionId,
      session: normalizedSession,
      createdAt: existingRecord?.createdAt ?? normalizedSession.startedAt ?? now,
      updatedAt,
      archivedAt,
      meetingKey: createMeetingKey(normalizedSession.meetingUrl, normalizedSession.meetingCode),
      searchText: createSearchTextForSession(normalizedSession)
    };
  }

  export function createEmptyFileAutosaveRuntimeState(supported: boolean): FileAutosaveRuntimeState {
    return {
      supported,
      status: supported ? "unlinked" : "unsupported",
      fileName: null,
      linkedAt: null,
      lastSavedAt: null,
      permission: "unknown",
      error: supported ? null : "File autosave is not supported in this browser context."
    };
  }

  function statusForLinkedTranscriptFile(linkedFile: LinkedTranscriptFile): FileAutosaveStatus {
    if (!linkedFile.error) {
      return "saved";
    }

    return linkedFile.permission === "granted" ? "error" : "paused";
  }

  export function fileAutosaveRuntimeFromLink(
    linkedFile: LinkedTranscriptFile | null,
    supported: boolean,
    statusOverride?: FileAutosaveStatus
  ): FileAutosaveRuntimeState {
    if (!supported) {
      return createEmptyFileAutosaveRuntimeState(false);
    }

    if (!linkedFile) {
      return createEmptyFileAutosaveRuntimeState(true);
    }

    return {
      supported,
      status: statusOverride ?? statusForLinkedTranscriptFile(linkedFile),
      fileName: linkedFile.fileName,
      linkedAt: linkedFile.linkedAt,
      lastSavedAt: linkedFile.lastWriteAt,
      permission: linkedFile.permission,
      error: linkedFile.error
    };
  }

  export function summarizeMeetingRecord(
    record: MeetingRecord,
    fileAutosave: FileAutosaveRuntimeState | null = null
  ): MeetingSummary {
    const session = record.session;
    return {
      sessionId: record.sessionId,
      meetingTitle: session.meetingTitle,
      meetingUrl: session.meetingUrl,
      meetingCode: session.meetingCode,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      lastCapturedAt: session.lastCapturedAt,
      lineCount: session.lines.length,
      hasAiArtifacts: Boolean(session.aiArtifacts),
      updatedAt: record.updatedAt,
      archivedAt: record.archivedAt,
      fileAutosave
    };
  }

  export function queryMeetingRecords(records: MeetingRecord[], query: MeetingLibraryQuery): MeetingLibraryResult {
    const search = normalizeText(query.search || "").toLowerCase();
    const limit = Math.max(1, Math.min(query.limit ?? DEFAULT_MEETING_LIBRARY_LIMIT, 500));
    const sortedRecords = [...records].sort((left, right) => {
      return right.updatedAt - left.updatedAt || right.createdAt - left.createdAt;
    });
    const filteredRecords = search
      ? sortedRecords.filter((record) => record.searchText.includes(search))
      : sortedRecords;

    return {
      summaries: filteredRecords.slice(0, limit).map((record) => summarizeMeetingRecord(record)),
      total: filteredRecords.length,
      query: {
        search,
        limit
      }
    };
  }
}
