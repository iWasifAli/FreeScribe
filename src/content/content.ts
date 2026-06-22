namespace LMCL {
  const EXTRACTION_DEBOUNCE_MS = 250;
  const DETECTION_HEARTBEAT_MS = 5_000;
  const SHORT_CANDIDATE_REPEAT_WINDOW_MS = 12_000;
  const LONG_CANDIDATE_REPEAT_WINDOW_MS = 30 * 60_000;
  const LONG_CANDIDATE_MIN_COMPARISON_LENGTH = 36;
  const RECENT_CANDIDATE_TTL_MS = LONG_CANDIDATE_REPEAT_WINDOW_MS;

  const recentCandidateKeys = new Map<string, number>();
  let extractionTimer: ReturnType<typeof setTimeout> | null = null;
  let observer: MutationObserver | null = null;
  let lastDetectionState: boolean | null = null;
  let lastDetectionSentAt = 0;
  let captureRequested = false;

  function candidateKey(candidate: CaptionCandidate): string {
    const textKey = `${normalizeForCaptionComparison(candidate.speaker || "")}\n${normalizeForCaptionComparison(candidate.text)}`;
    return candidate.sourceNodeHash ? `${candidate.sourceNodeHash}\n${textKey}` : textKey;
  }

  function repeatWindowForCandidate(candidate: CaptionCandidate): number {
    if (candidate.sourceNodeHash) {
      return LONG_CANDIDATE_REPEAT_WINDOW_MS;
    }

    return normalizeForCaptionComparison(candidate.text).length >= LONG_CANDIDATE_MIN_COMPARISON_LENGTH
      ? LONG_CANDIDATE_REPEAT_WINDOW_MS
      : SHORT_CANDIDATE_REPEAT_WINDOW_MS;
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
      if (lastSentAt && observedAt - lastSentAt < repeatWindowForCandidate(candidate)) {
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

  function startObserver(): boolean {
    captureRequested = true;

    if (!document.body || observer) {
      return Boolean(observer);
    }

    observer = new MutationObserver(scheduleExtraction);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    scheduleExtraction();
    debugLog("content script ready");
    return true;
  }

  function stopObserver(): void {
    captureRequested = false;

    if (extractionTimer) {
      clearTimeout(extractionTimer);
      extractionTimer = null;
    }

    if (observer) {
      observer.disconnect();
      observer = null;
    }

    recentCandidateKeys.clear();
    lastDetectionState = null;
    lastDetectionSentAt = 0;
  }

  function startWhenReady(): boolean {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        if (captureRequested) {
          startObserver();
        }
      }, { once: true });
      captureRequested = true;
      return true;
    }

    return startObserver();
  }

  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender: unknown, sendResponse: (response: unknown) => void) => {
    if (message.type === MessageType.START_CAPTURE) {
      const started = startWhenReady();
      sendResponse({ ok: started, metadata: getPageMetadata() });
      return false;
    }

    if (message.type === MessageType.STOP_CAPTURE) {
      stopObserver();
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === MessageType.GET_PAGE_METADATA) {
      sendResponse({ ok: true, metadata: getPageMetadata() });
      return false;
    }

    return false;
  });
  debugLog("content script listener ready");
}
