namespace LMCL {
  const EXTRACTION_DEBOUNCE_MS = 250;
  const DETECTION_HEARTBEAT_MS = 5_000;
  const RECENT_CANDIDATE_TTL_MS = 30_000;

  const recentCandidateKeys = new Map<string, number>();
  let extractionTimer: ReturnType<typeof setTimeout> | null = null;
  let observer: MutationObserver | null = null;
  let lastDetectionState: boolean | null = null;
  let lastDetectionSentAt = 0;

  function candidateKey(candidate: CaptionCandidate): string {
    return `${candidate.speaker || ""}\n${candidate.text}`;
  }

  function pruneRecentCandidates(now: number): void {
    for (const [key, timestamp] of recentCandidateKeys.entries()) {
      if (now - timestamp > RECENT_CANDIDATE_TTL_MS) {
        recentCandidateKeys.delete(key);
      }
    }
  }

  function sendRuntimeMessage(message: ExtensionMessage): void {
    try {
      Promise.resolve(chrome.runtime.sendMessage(message)).catch(() => {
        debugLog("runtime message failed", message.type);
      });
    } catch {
      debugLog("extension context invalidated");
    }
  }

  function sendDetectionState(detected: boolean, observedAt: number): void {
    if (lastDetectionState === detected && observedAt - lastDetectionSentAt < DETECTION_HEARTBEAT_MS) {
      return;
    }

    lastDetectionState = detected;
    lastDetectionSentAt = observedAt;
    sendRuntimeMessage({
      type: MessageType.CAPTIONS_DETECTED,
      payload: { detected, observedAt }
    });
  }

  function runExtraction(): void {
    const observedAt = Date.now();
    pruneRecentCandidates(observedAt);

    const candidates = extractCaptionCandidates(document, observedAt);
    sendDetectionState(candidates.length > 0, observedAt);

    for (const candidate of candidates) {
      const key = candidateKey(candidate);
      const lastSentAt = recentCandidateKeys.get(key);
      if (lastSentAt && observedAt - lastSentAt < 1_000) {
        continue;
      }

      recentCandidateKeys.set(key, observedAt);
      sendRuntimeMessage({
        type: MessageType.CAPTION_CANDIDATE,
        payload: candidate
      });
    }
  }

  function scheduleExtraction(): void {
    if (extractionTimer) {
      clearTimeout(extractionTimer);
    }

    extractionTimer = setTimeout(() => {
      extractionTimer = null;
      runExtraction();
    }, EXTRACTION_DEBOUNCE_MS);
  }

  function startObserver(): void {
    if (!document.body || observer) {
      return;
    }

    observer = new MutationObserver(scheduleExtraction);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    scheduleExtraction();
    debugLog("content script ready");
  }

  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender: unknown, sendResponse: (response: unknown) => void) => {
    if (message.type === MessageType.GET_PAGE_METADATA) {
      sendResponse({ ok: true, metadata: getPageMetadata() });
      return false;
    }

    return false;
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  } else {
    startObserver();
  }
}
