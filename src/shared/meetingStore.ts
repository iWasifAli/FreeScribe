namespace LMCL {
  const MEETING_DB_NAME = "freeScribe.meetingLibrary";
  const MEETING_DB_VERSION = 1;
  const MEETINGS_STORE = "meetings";
  const FILE_HANDLES_STORE = "fileHandles";
  const META_STORE = "meta";
  const V3_MIGRATION_META_KEY = "storageV3MigrationComplete";

  interface StoreMetaRecord {
    key: string;
    value: unknown;
  }

  let meetingDbPromise: Promise<IDBDatabase> | null = null;

  export function isMeetingStoreSupported(): boolean {
    return typeof indexedDB !== "undefined";
  }

  function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
    });
  }

  function transactionDone(transaction: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted."));
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed."));
    });
  }

  export async function openMeetingStore(): Promise<IDBDatabase> {
    if (!isMeetingStoreSupported()) {
      throw new Error("Meeting library storage is not supported in this browser context.");
    }

    if (!meetingDbPromise) {
      meetingDbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(MEETING_DB_NAME, MEETING_DB_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(MEETINGS_STORE)) {
            const meetings = db.createObjectStore(MEETINGS_STORE, { keyPath: "sessionId" });
            meetings.createIndex("updatedAt", "updatedAt", { unique: false });
            meetings.createIndex("meetingKey", "meetingKey", { unique: false });
          }
          if (!db.objectStoreNames.contains(FILE_HANDLES_STORE)) {
            db.createObjectStore(FILE_HANDLES_STORE, { keyPath: "sessionId" });
          }
          if (!db.objectStoreNames.contains(META_STORE)) {
            db.createObjectStore(META_STORE, { keyPath: "key" });
          }
        };

        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            meetingDbPromise = null;
          };
          resolve(db);
        };
        request.onerror = () => {
          meetingDbPromise = null;
          reject(request.error || new Error("Unable to open meeting library storage."));
        };
        request.onblocked = () => {
          meetingDbPromise = null;
          reject(new Error("Meeting library storage upgrade is blocked by another FreeScribe page."));
        };
      });
    }

    return meetingDbPromise;
  }

  async function getMetaValue<TValue>(key: string): Promise<TValue | null> {
    const db = await openMeetingStore();
    const transaction = db.transaction(META_STORE, "readonly");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(META_STORE);
    const record = await requestToPromise<StoreMetaRecord | undefined>(store.get(key));
    await done;
    return record ? record.value as TValue : null;
  }

  async function setMetaValue(key: string, value: unknown): Promise<void> {
    const db = await openMeetingStore();
    const transaction = db.transaction(META_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(META_STORE).put({ key, value });
    await done;
  }

  export async function getAllMeetingRecords(): Promise<MeetingRecord[]> {
    const db = await openMeetingStore();
    const transaction = db.transaction(MEETINGS_STORE, "readonly");
    const done = transactionDone(transaction);
    const records = await requestToPromise<MeetingRecord[]>(transaction.objectStore(MEETINGS_STORE).getAll());
    await done;
    return records;
  }

  export async function getMeetingRecord(sessionId: string): Promise<MeetingRecord | null> {
    if (!sessionId) {
      return null;
    }

    const db = await openMeetingStore();
    const transaction = db.transaction(MEETINGS_STORE, "readonly");
    const done = transactionDone(transaction);
    const record = await requestToPromise<MeetingRecord | undefined>(transaction.objectStore(MEETINGS_STORE).get(sessionId));
    await done;
    return record || null;
  }

  export async function saveMeetingRecord(record: MeetingRecord): Promise<void> {
    const db = await openMeetingStore();
    const transaction = db.transaction(MEETINGS_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(MEETINGS_STORE).put(record);
    await done;
  }

  export async function saveMeetingSession(session: TranscriptSession, now: number = Date.now()): Promise<MeetingRecord | null> {
    if (!isMeaningfulLibrarySession(session)) {
      return null;
    }

    const existingRecord = session.sessionId ? await getMeetingRecord(session.sessionId) : null;
    const record = createMeetingRecord(session, existingRecord, now);
    await saveMeetingRecord(record);
    return record;
  }

  export async function deleteMeetingRecord(sessionId: string): Promise<void> {
    const db = await openMeetingStore();
    const transaction = db.transaction([MEETINGS_STORE, FILE_HANDLES_STORE], "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(MEETINGS_STORE).delete(sessionId);
    transaction.objectStore(FILE_HANDLES_STORE).delete(sessionId);
    await done;
  }

  export async function getLinkedTranscriptFile(sessionId: string): Promise<LinkedTranscriptFile | null> {
    if (!sessionId) {
      return null;
    }

    const db = await openMeetingStore();
    const transaction = db.transaction(FILE_HANDLES_STORE, "readonly");
    const done = transactionDone(transaction);
    const linkedFile = await requestToPromise<LinkedTranscriptFile | undefined>(
      transaction.objectStore(FILE_HANDLES_STORE).get(sessionId)
    );
    await done;
    return linkedFile || null;
  }

  export async function saveLinkedTranscriptFile(linkedFile: LinkedTranscriptFile): Promise<void> {
    const db = await openMeetingStore();
    const transaction = db.transaction(FILE_HANDLES_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(FILE_HANDLES_STORE).put(linkedFile);
    await done;
  }

  export async function createLinkedTranscriptFile(
    sessionId: string,
    fileName: string,
    handle: FileSystemFileHandle,
    now: number = Date.now()
  ): Promise<LinkedTranscriptFile> {
    const linkedFile: LinkedTranscriptFile = {
      sessionId,
      fileName,
      handle,
      linkedAt: now,
      lastWriteAt: null,
      lastTranscriptUpdatedAt: null,
      lastLineCount: 0,
      permission: "unknown",
      error: null
    };

    await saveLinkedTranscriptFile(linkedFile);
    return linkedFile;
  }

  export async function deleteLinkedTranscriptFile(sessionId: string): Promise<void> {
    const db = await openMeetingStore();
    const transaction = db.transaction(FILE_HANDLES_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(FILE_HANDLES_STORE).delete(sessionId);
    await done;
  }

  export async function migrateStoredStateToMeetingStore(storedState: StoredState): Promise<number> {
    if (await getMetaValue<boolean>(V3_MIGRATION_META_KEY)) {
      return 0;
    }

    const sessionsById = new Map<string, TranscriptSession>();
    const collectSession = (session: TranscriptSession): void => {
      if (!isMeaningfulLibrarySession(session)) {
        return;
      }

      const sessionId = session.sessionId || `${createMeetingKey(session.meetingUrl, session.meetingCode) || "session"}_${session.startedAt || Date.now()}`;
      sessionsById.set(sessionId, {
        ...cloneSession(session),
        sessionId
      });
    };

    for (const session of Object.values(storedState.sessionsByMeetingKey)) {
      collectSession(session);
    }
    for (const session of Object.values(storedState.sessionsByTabId)) {
      collectSession(session);
    }

    let migratedCount = 0;
    for (const session of sessionsById.values()) {
      const existingRecord = await getMeetingRecord(session.sessionId);
      if (!existingRecord) {
        await saveMeetingRecord(createMeetingRecord(session));
        migratedCount += 1;
      }
    }

    await setMetaValue(V3_MIGRATION_META_KEY, true);
    return migratedCount;
  }
}
