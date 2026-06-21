namespace LMCL {
  const DEFAULT_UPDATE_WINDOW_MS = 10_000;
  const DEFAULT_DUPLICATE_WINDOW_MS = 30_000;

  function defaultLineId(candidate: CaptionCandidate): string {
    const randomPart =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 10);

    return `line_${candidate.observedAt}_${randomPart}`;
  }

  function exactDuplicateSeenRecently(
    lines: TranscriptLine[],
    speaker: string,
    text: string,
    observedAt: number,
    duplicateWindowMs: number
  ): boolean {
    const windowStart = observedAt - duplicateWindowMs;

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (line.updatedAt < windowStart && line.startedAt < windowStart) {
        break;
      }

      if (line.speaker === speaker && line.text === text) {
        return true;
      }

      if (
        normalizeForCaptionComparison(line.speaker) === normalizeForCaptionComparison(speaker) &&
        normalizeForCaptionComparison(line.text) === normalizeForCaptionComparison(text)
      ) {
        return true;
      }
    }

    return false;
  }

  function commonPrefixWordCount(left: string, right: string): number {
    const leftWords = normalizeForCaptionComparison(left).split(" ").filter(Boolean);
    const rightWords = normalizeForCaptionComparison(right).split(" ").filter(Boolean);
    const max = Math.min(leftWords.length, rightWords.length);
    let count = 0;

    while (count < max && leftWords[count] === rightWords[count]) {
      count += 1;
    }

    return count;
  }

  function isLikelyProgressiveRewrite(previousText: string, nextText: string): boolean {
    const previousWords = normalizeForCaptionComparison(previousText).split(" ").filter(Boolean);
    const nextWords = normalizeForCaptionComparison(nextText).split(" ").filter(Boolean);
    const prefixCount = commonPrefixWordCount(previousText, nextText);
    const shorterLength = Math.min(previousWords.length, nextWords.length);

    return prefixCount >= 5 && prefixCount / Math.max(1, shorterLength) >= 0.55;
  }

  function hasSameStableSource(line: TranscriptLine, candidate: CaptionCandidate): boolean {
    return Boolean(line.sourceNodeHash && candidate.sourceNodeHash && line.sourceNodeHash === candidate.sourceNodeHash);
  }

  function findRecentUnknownDuplicateIndex(lines: TranscriptLine[], text: string, observedAt: number, windowMs: number): number {
    const comparableText = normalizeForCaptionComparison(text);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (observedAt - line.updatedAt > windowMs) {
        break;
      }

      if (line.speaker === UNKNOWN_SPEAKER && normalizeForCaptionComparison(line.text) === comparableText) {
        return index;
      }
    }

    return -1;
  }

  function isUnknownSpeakerFragment(lines: TranscriptLine[], text: string, observedAt: number, windowMs: number): boolean {
    const comparableText = normalizeForCaptionComparison(text);

    if (isLikelySpeakerLabel(text)) {
      return true;
    }

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (observedAt - line.updatedAt > windowMs) {
        break;
      }

      if (
        normalizeForCaptionComparison(line.speaker) === comparableText ||
        normalizeForCaptionComparison(line.text) === comparableText
      ) {
        return true;
      }
    }

    return false;
  }

  export function applyCaptionCandidate(
    session: TranscriptSession,
    candidate: CaptionCandidate,
    options: TranscriptReducerOptions = {}
  ): TranscriptSession {
    if (session.status !== "RECORDING") {
      return session;
    }

    const text = normalizeText(candidate.text);
    if (!text || shouldIgnoreCaptionText(candidate.speaker, text)) {
      return session;
    }

    const observedAt = Number.isFinite(candidate.observedAt) ? candidate.observedAt : Date.now();
    const speaker = normalizeSpeaker(candidate.speaker);
    const updateWindowMs = options.updateWindowMs ?? DEFAULT_UPDATE_WINDOW_MS;
    const duplicateWindowMs = options.duplicateWindowMs ?? DEFAULT_DUPLICATE_WINDOW_MS;
    const lines = session.lines;
    const comparableText = normalizeForCaptionComparison(text);
    const comparableSpeaker = normalizeForCaptionComparison(speaker);

    if (comparableSpeaker === comparableText) {
      return session;
    }

    if (speaker === UNKNOWN_SPEAKER && isUnknownSpeakerFragment(lines, text, observedAt, duplicateWindowMs)) {
      return session;
    }

    if (speaker !== UNKNOWN_SPEAKER) {
      const unknownDuplicateIndex = findRecentUnknownDuplicateIndex(lines, text, observedAt, duplicateWindowMs);
      if (unknownDuplicateIndex >= 0) {
        const nextLines = lines.slice();
        const previousLine = nextLines[unknownDuplicateIndex];
        nextLines[unknownDuplicateIndex] = {
          ...previousLine,
          speaker,
          updatedAt: observedAt,
          revision: previousLine.revision + 1,
          sourceNodeHash: candidate.sourceNodeHash || previousLine.sourceNodeHash
        };

        return {
          ...session,
          lines: nextLines,
          lastCapturedAt: observedAt
        };
      }
    }

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (observedAt - line.updatedAt > updateWindowMs) {
        break;
      }

      if (normalizeForCaptionComparison(line.speaker) !== comparableSpeaker) {
        continue;
      }

      const comparableLineText = normalizeForCaptionComparison(line.text);

      if (
        text === line.text ||
        line.text.startsWith(text) ||
        comparableText === comparableLineText ||
        comparableLineText.startsWith(comparableText)
      ) {
        return session;
      }

      if (
        text.startsWith(line.text) ||
        comparableText.startsWith(comparableLineText) ||
        (hasSameStableSource(line, candidate) && isLikelyProgressiveRewrite(line.text, text))
      ) {
        const nextLines = lines.slice();
        nextLines[index] = {
          ...line,
          text,
          updatedAt: observedAt,
          revision: line.revision + 1,
          sourceNodeHash: candidate.sourceNodeHash || line.sourceNodeHash
        };

        return {
          ...session,
          lines: nextLines,
          lastCapturedAt: observedAt
        };
      }
    }

    if (exactDuplicateSeenRecently(lines, speaker, text, observedAt, duplicateWindowMs)) {
      return session;
    }

    const idFactory = options.idFactory ?? defaultLineId;
    const nextLine: TranscriptLine = {
      id: idFactory({ ...candidate, text, speaker }, session),
      speaker,
      text,
      startedAt: observedAt,
      updatedAt: observedAt,
      revision: 0,
      sourceNodeHash: candidate.sourceNodeHash
    };

    return {
      ...session,
      lines: [...lines, nextLine],
      lastCapturedAt: observedAt
    };
  }
}
