namespace LMCL {
  export type RecordingStatus = "IDLE" | "RECORDING" | "PAUSED" | "STOPPED";

  export interface CaptionCandidate {
    speaker: string | null;
    text: string;
    observedAt: number;
    rawText: string;
    sourceNodeHash?: string;
  }

  export interface TranscriptLine {
    id: string;
    speaker: string;
    text: string;
    startedAt: number;
    updatedAt: number;
    revision: number;
    sourceNodeHash?: string;
  }

  export type AiActionPriority = "low" | "medium" | "high" | "unknown";

  export interface AiActionItem {
    task: string;
    owner: string | null;
    dueDate: string | null;
    priority: AiActionPriority;
    status: string;
  }

  export interface AiMinutesOfMeeting {
    overview: string;
    attendees: string[];
    keyTopics: string[];
    decisions: string[];
    risks: string[];
    nextSteps: string[];
  }

  export interface AiMeetingArtifacts {
    executiveSummary: string;
    actionItems: AiActionItem[];
    minutesOfMeeting: AiMinutesOfMeeting;
    generatedAt: number;
    model: string;
    transcriptLineCount: number;
    transcriptUpdatedAt: number | null;
  }

  export interface TranscriptSession {
    sessionId: string;
    status: RecordingStatus;
    meetingTitle: string | null;
    meetingUrl: string | null;
    meetingCode: string | null;
    startedAt: number | null;
    endedAt: number | null;
    lastCapturedAt: number | null;
    lines: TranscriptLine[];
    aiArtifacts: AiMeetingArtifacts | null;
  }

  export interface TranscriptReducerOptions {
    updateWindowMs?: number;
    duplicateWindowMs?: number;
    idFactory?: (candidate: CaptionCandidate, session: TranscriptSession) => string;
  }

  export interface MeetingMetadata {
    meetingTitle: string | null;
    meetingUrl: string | null;
    meetingCode: string | null;
  }

  export interface CaptionDetectionState {
    detected: boolean;
    observedAt: number | null;
    latestCandidate: CaptionCandidate | null;
  }

  export type AutosaveStatus = "saved" | "saving" | "dirty" | "error";

  export type AiGenerationStatus = "idle" | "generating";
  export type AiConfigReason = "ready" | "disabled" | "missing_key";

  export interface AiRuntimeState {
    enabled: boolean;
    configured: boolean;
    model: string;
    reason: AiConfigReason;
    generationStatus: AiGenerationStatus;
  }

  export interface TabRuntimeState {
    tabId: number | null;
    supported: boolean;
    canConnectToContentScript: boolean;
    session: TranscriptSession;
    captions: CaptionDetectionState;
    autosaveStatus: AutosaveStatus;
    autosaveError: string | null;
    error: ExtensionError | null;
    ai: AiRuntimeState;
  }

  export interface StoredState {
    version: 3;
    sessionsByTabId: Record<string, TranscriptSession>;
    sessionsByMeetingKey: Record<string, TranscriptSession>;
    updatedAt: number;
  }

  export interface ExtensionError {
    code: string;
    message: string;
  }

  export interface ExtensionMessage<TPayload = unknown> {
    type: string;
    payload?: TPayload;
  }

  export const PRODUCT_NAME = "FreeScribe";
  export const STORAGE_KEY = "freeScribe.sessionsByTab";
  export const UNKNOWN_SPEAKER = "Unknown Speaker";

  export function createEmptySession(status: RecordingStatus = "IDLE"): TranscriptSession {
    return {
      sessionId: "",
      status,
      meetingTitle: null,
      meetingUrl: null,
      meetingCode: null,
      startedAt: null,
      endedAt: null,
      lastCapturedAt: null,
      lines: [],
      aiArtifacts: null
    };
  }

  export function cloneSession(session: TranscriptSession): TranscriptSession {
    return {
      ...session,
      lines: session.lines.map((line) => ({ ...line })),
      aiArtifacts: session.aiArtifacts
        ? {
            ...session.aiArtifacts,
            actionItems: session.aiArtifacts.actionItems.map((item) => ({ ...item })),
            minutesOfMeeting: {
              ...session.aiArtifacts.minutesOfMeeting,
              attendees: [...session.aiArtifacts.minutesOfMeeting.attendees],
              keyTopics: [...session.aiArtifacts.minutesOfMeeting.keyTopics],
              decisions: [...session.aiArtifacts.minutesOfMeeting.decisions],
              risks: [...session.aiArtifacts.minutesOfMeeting.risks],
              nextSteps: [...session.aiArtifacts.minutesOfMeeting.nextSteps]
            }
          }
        : null
    };
  }
}
