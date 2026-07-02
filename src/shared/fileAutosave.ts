namespace LMCL {
  export const FILE_AUTOSAVE_INTERVAL_MS = 15_000;
  export const FILE_AUTOSAVE_LINE_THRESHOLD = 5;

  export interface LinkedTranscriptWriteResult {
    linkedFile: LinkedTranscriptFile;
    status: FileAutosaveStatus;
    wrote: boolean;
    error: string | null;
  }

  interface LinkedTranscriptWriteOptions {
    now?: number;
    requestPermission?: boolean;
  }

  interface LinkedTranscriptFlushOptions {
    now?: number;
    force?: boolean;
    intervalMs?: number;
    lineThreshold?: number;
  }

  function filePermissionOptions(): FileSystemHandlePermissionDescriptor {
    return { mode: "readwrite" };
  }

  export function isFilePickerSupported(): boolean {
    return typeof window !== "undefined" && typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === "function";
  }

  export function getTranscriptChangeMarker(session: TranscriptSession): number | null {
    return getTranscriptUpdatedAt(session);
  }

  export function hasLinkedTranscriptChanged(session: TranscriptSession, linkedFile: LinkedTranscriptFile): boolean {
    return (
      linkedFile.lastTranscriptUpdatedAt !== getTranscriptChangeMarker(session) ||
      linkedFile.lastLineCount !== session.lines.length
    );
  }

  export function shouldFlushLinkedTranscriptFile(
    session: TranscriptSession,
    linkedFile: LinkedTranscriptFile,
    options: LinkedTranscriptFlushOptions = {}
  ): boolean {
    if (!hasLinkedTranscriptChanged(session, linkedFile)) {
      return false;
    }

    if (options.force) {
      return true;
    }

    const now = options.now ?? Date.now();
    const intervalMs = options.intervalMs ?? FILE_AUTOSAVE_INTERVAL_MS;
    const lineThreshold = options.lineThreshold ?? FILE_AUTOSAVE_LINE_THRESHOLD;
    const linesChanged = Math.abs(session.lines.length - linkedFile.lastLineCount);

    return (
      linkedFile.lastWriteAt === null ||
      now - linkedFile.lastWriteAt >= intervalMs ||
      linesChanged >= lineThreshold ||
      session.status === "PAUSED" ||
      session.status === "STOPPED"
    );
  }

  export async function queryLinkedTranscriptPermission(
    linkedFile: LinkedTranscriptFile
  ): Promise<FileAutosavePermissionState> {
    try {
      return await linkedFile.handle.queryPermission(filePermissionOptions());
    } catch {
      return "unknown";
    }
  }

  async function requestLinkedTranscriptPermission(
    linkedFile: LinkedTranscriptFile
  ): Promise<FileAutosavePermissionState> {
    try {
      return await linkedFile.handle.requestPermission(filePermissionOptions());
    } catch {
      return "unknown";
    }
  }

  function permissionMessage(permission: FileAutosavePermissionState): string {
    if (permission === "denied") {
      return "FreeScribe does not have permission to update the linked transcript file.";
    }

    return "FreeScribe needs permission to update the linked transcript file.";
  }

  export async function writeLinkedTranscriptFile(
    session: TranscriptSession,
    linkedFile: LinkedTranscriptFile,
    options: LinkedTranscriptWriteOptions = {}
  ): Promise<LinkedTranscriptWriteResult> {
    const now = options.now ?? Date.now();
    let permission = await queryLinkedTranscriptPermission(linkedFile);
    if (permission !== "granted" && options.requestPermission) {
      permission = await requestLinkedTranscriptPermission(linkedFile);
    }

    if (permission !== "granted") {
      const nextLinkedFile: LinkedTranscriptFile = {
        ...linkedFile,
        permission,
        error: permissionMessage(permission)
      };
      await saveLinkedTranscriptFile(nextLinkedFile);
      return {
        linkedFile: nextLinkedFile,
        status: "paused",
        wrote: false,
        error: nextLinkedFile.error
      };
    }

    try {
      const writable = await linkedFile.handle.createWritable();
      await writable.write(formatTranscriptAsTxt(session, now));
      await writable.close();

      const nextLinkedFile: LinkedTranscriptFile = {
        ...linkedFile,
        lastWriteAt: now,
        lastTranscriptUpdatedAt: getTranscriptChangeMarker(session),
        lastLineCount: session.lines.length,
        permission: "granted",
        error: null
      };
      await saveLinkedTranscriptFile(nextLinkedFile);
      return {
        linkedFile: nextLinkedFile,
        status: "saved",
        wrote: true,
        error: null
      };
    } catch (error) {
      const nextLinkedFile: LinkedTranscriptFile = {
        ...linkedFile,
        permission,
        error: error instanceof Error ? error.message : "Unable to update the linked transcript file."
      };
      await saveLinkedTranscriptFile(nextLinkedFile);
      return {
        linkedFile: nextLinkedFile,
        status: "error",
        wrote: false,
        error: nextLinkedFile.error
      };
    }
  }

  export async function pickTranscriptFileHandle(session: TranscriptSession): Promise<{ handle: FileSystemFileHandle; fileName: string }> {
    if (!isFilePickerSupported()) {
      throw new Error("File autosave is not supported in this browser.");
    }

    const fileName = createTranscriptFilename(session);
    const handle = await (window as unknown as {
      showSaveFilePicker(options: {
        suggestedName: string;
        types: Array<{ description: string; accept: Record<string, string[]> }>;
      }): Promise<FileSystemFileHandle>;
    }).showSaveFilePicker({
      suggestedName: fileName,
      types: [
        {
          description: "Text transcript",
          accept: {
            "text/plain": [".txt"]
          }
        }
      ]
    });

    return {
      handle,
      fileName: handle.name || fileName
    };
  }
}
