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

  export interface TabRuntimeState {
    tabId: number | null;
    supported: boolean;
    canConnectToContentScript: boolean;
    session: TranscriptSession;
    captions: CaptionDetectionState;
    autosaveStatus: AutosaveStatus;
    autosaveError: string | null;
    error: ExtensionError | null;
  }

  export interface StoredState {
    version: 1;
    sessionsByTabId: Record<string, TranscriptSession>;
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

  export const PRODUCT_NAME = "ZolvatScribe";
  export const STORAGE_KEY = "zolvatScribe.sessionsByTab";
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
      lines: []
    };
  }

  export function cloneSession(session: TranscriptSession): TranscriptSession {
    return {
      ...session,
      lines: session.lines.map((line) => ({ ...line }))
    };
  }
}
