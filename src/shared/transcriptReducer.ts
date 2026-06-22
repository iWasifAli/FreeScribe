namespace LMCL {
  const DEFAULT_UPDATE_WINDOW_MS = 10_000;
  const DEFAULT_DUPLICATE_WINDOW_MS = 30_000;
  const LONG_TEXT_UPDATE_WINDOW_MS = 60_000;
  const LONG_TEXT_DUPLICATE_WINDOW_MS = 30 * 60_000;
  const LONG_TEXT_MIN_COMPARISON_LENGTH = 36;
  const RELATED_CAPTION_MIN_WORDS = 10;
  const RELATED_CAPTION_MIN_PREFIX_WORDS = 8;

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
    duplicateWindowMs: number,
    sourceNodeHash?: string
  ): boolean {
    const windowStart = observedAt - duplicateWindowMs;
    const sourceWindowStart = observedAt - LONG_TEXT_DUPLICATE_WINDOW_MS;
    const earliestWindowStart = sourceNodeHash ? Math.min(windowStart, sourceWindowStart) : windowStart;

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (line.updatedAt < earliestWindowStart && line.startedAt < earliestWindowStart) {
        break;
      }

      if (
        sourceNodeHash &&
        line.sourceNodeHash === sourceNodeHash &&
        duplicateComparisonText(line.speaker, line.text) === duplicateComparisonText(speaker, text) &&
        (line.updatedAt >= sourceWindowStart || line.startedAt >= sourceWindowStart)
      ) {
        return true;
      }

      if (line.updatedAt < windowStart && line.startedAt < windowStart) {
        continue;
      }

      if (line.speaker === speaker && line.text === text) {
        return true;
      }

      if (
        normalizeForCaptionComparison(line.speaker) === normalizeForCaptionComparison(speaker) &&
        duplicateComparisonText(line.speaker, line.text) === duplicateComparisonText(speaker, text)
      ) {
        return true;
      }
    }

    return false;
  }

  function stripLeadingSelfSpeakerPrefix(text: string): string {
    const normalized = normalizeText(text);
    return /^You\s+\S/.test(normalized) ? normalized.replace(/^You\s+/, "") : normalized;
  }

  function hasLeadingSelfSpeakerPrefix(text: string): boolean {
    return /^You\s+\S/.test(normalizeText(text));
  }

  function duplicateComparisonText(speaker: string | null | undefined, text: string): string {
    const normalizedSpeaker = normalizeSpeaker(speaker);
    const comparableText = normalizedSpeaker === UNKNOWN_SPEAKER ? stripLeadingSelfSpeakerPrefix(text) : text;
    return normalizeForCaptionComparison(comparableText);
  }

  function isLongCaptionText(text: string): boolean {
    return normalizeForCaptionComparison(stripLeadingSelfSpeakerPrefix(text)).length >= LONG_TEXT_MIN_COMPARISON_LENGTH;
  }

  function updateWindowForText(text: string, updateWindowMs: number): number {
    return isLongCaptionText(text) ? Math.max(updateWindowMs, LONG_TEXT_UPDATE_WINDOW_MS) : updateWindowMs;
  }

  function duplicateWindowForText(text: string, duplicateWindowMs: number): number {
    return isLongCaptionText(text) ? Math.max(duplicateWindowMs, LONG_TEXT_DUPLICATE_WINDOW_MS) : duplicateWindowMs;
  }

  function extractEmbeddedSelfSpeaker(
    speaker: string | null | undefined,
    text: string
  ): { speaker: string | null | undefined; text: string } {
    if (normalizeText(speaker)) {
      return { speaker, text };
    }

    const match = normalizeText(text).match(/^You\s+(\S.*)$/);
    if (!match) {
      return { speaker, text };
    }

    const firstCaptionWord = match[1].split(/\s+/)[0] || "";
    if (/^[A-Z]/.test(firstCaptionWord)) {
      return { speaker: "You", text: match[1] };
    }

    return { speaker, text };
  }

  function hasCleanerCandidateText(line: TranscriptLine, text: string): boolean {
    return (
      hasLeadingSelfSpeakerPrefix(line.text) &&
      !hasLeadingSelfSpeakerPrefix(text) &&
      duplicateComparisonText(UNKNOWN_SPEAKER, line.text) === duplicateComparisonText(UNKNOWN_SPEAKER, text)
    );
  }

  function comparisonWords(speaker: string, text: string): string[] {
    const comparableText = duplicateComparisonText(speaker, text);
    return comparableText ? comparableText.split(" ") : [];
  }

  function wordsSharePrefix(left: string, right: string): boolean {
    if (left === right) {
      return true;
    }

    const shortestLength = Math.min(left.length, right.length);
    return shortestLength >= 2 && (left.startsWith(right) || right.startsWith(left));
  }

  function commonPrefixWordCount(leftWords: string[], rightWords: string[]): number {
    const maxLength = Math.min(leftWords.length, rightWords.length);
    let count = 0;

    while (count < maxLength && wordsSharePrefix(leftWords[count], rightWords[count])) {
      count += 1;
    }

    return count;
  }

  function isLikelyProgressiveRewrite(speaker: string, previousText: string, nextText: string): boolean {
    const previousWords = comparisonWords(speaker, previousText);
    const nextWords = comparisonWords(speaker, nextText);
    if (previousWords.length < 3 || nextWords.length <= previousWords.length) {
      return false;
    }

    const previousComparableText = duplicateComparisonText(speaker, previousText);
    const nextComparableText = duplicateComparisonText(speaker, nextText);
    const growsMeaningfully =
      nextComparableText.length >= previousComparableText.length + 12 ||
      nextWords.length >= previousWords.length + 3;
    if (!growsMeaningfully) {
      return false;
    }

    return commonPrefixWordCount(previousWords, nextWords) / previousWords.length >= 0.72;
  }

  function isLikelyCaptionReplayVariant(speaker: string, previousText: string, nextText: string): boolean {
    const previousComparableText = duplicateComparisonText(speaker, previousText);
    const nextComparableText = duplicateComparisonText(speaker, nextText);
    if (!previousComparableText || !nextComparableText) {
      return false;
    }

    if (previousComparableText === nextComparableText) {
      return isLongCaptionText(previousText) || isLongCaptionText(nextText);
    }

    if (
      (previousComparableText.startsWith(nextComparableText) || nextComparableText.startsWith(previousComparableText)) &&
      Math.min(previousComparableText.length, nextComparableText.length) >= LONG_TEXT_MIN_COMPARISON_LENGTH
    ) {
      return true;
    }

    if (isLikelyProgressiveRewrite(speaker, previousText, nextText) || isLikelyProgressiveRewrite(speaker, nextText, previousText)) {
      return true;
    }

    const previousWords = comparisonWords(speaker, previousText);
    const nextWords = comparisonWords(speaker, nextText);
    const shorterWordCount = Math.min(previousWords.length, nextWords.length);
    const longerWordCount = Math.max(previousWords.length, nextWords.length);
    if (shorterWordCount < RELATED_CAPTION_MIN_WORDS) {
      return false;
    }

    const sharedPrefixWords = commonPrefixWordCount(previousWords, nextWords);
    return (
      sharedPrefixWords >= RELATED_CAPTION_MIN_PREFIX_WORDS &&
      sharedPrefixWords / shorterWordCount >= 0.82 &&
      sharedPrefixWords / longerWordCount >= 0.55
    );
  }

  function findRecentCaptionReplayVariantIndices(
    lines: TranscriptLine[],
    speaker: string,
    text: string,
    observedAt: number,
    windowMs: number
  ): number[] {
    const indices: number[] = [];
    const comparableSpeaker = normalizeForCaptionComparison(speaker);

    if (!isLongCaptionText(text)) {
      return indices;
    }

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (observedAt - line.updatedAt > windowMs && observedAt - line.startedAt > windowMs) {
        break;
      }

      if (normalizeForCaptionComparison(line.speaker) !== comparableSpeaker) {
        continue;
      }

      if (isLikelyCaptionReplayVariant(speaker, line.text, text)) {
        indices.push(index);
      }
    }

    return indices.sort((left, right) => left - right);
  }

  function captionCompletenessScore(speaker: string, text: string): number {
    const comparableText = duplicateComparisonText(speaker, text);
    const wordCount = comparableText ? comparableText.split(" ").length : 0;
    const hasSentenceEnding = /[.!?]["')\]]*$/.test(normalizeText(text));

    return comparableText.length + wordCount * 2 + (hasSentenceEnding ? 12 : 0);
  }

  function chooseBetterCaptionText(speaker: string, currentText: string, nextText: string): string {
    const currentComparableText = duplicateComparisonText(speaker, currentText);
    const nextComparableText = duplicateComparisonText(speaker, nextText);
    const currentScore = captionCompletenessScore(speaker, currentText);
    const nextScore = captionCompletenessScore(speaker, nextText);

    if (nextComparableText.startsWith(currentComparableText) && nextComparableText.length > currentComparableText.length) {
      return nextText;
    }

    if (currentComparableText.startsWith(nextComparableText) && currentComparableText.length >= nextComparableText.length) {
      return currentText;
    }

    return nextScore > currentScore + 8 ? nextText : currentText;
  }

  function mergeCaptionReplayVariants(
    session: TranscriptSession,
    indices: number[],
    candidate: CaptionCandidate,
    speaker: string,
    text: string,
    observedAt: number
  ): TranscriptSession {
    const lineIndexSet = new Set(indices);
    const canonicalIndex = indices[0];
    const canonicalLine = session.lines[canonicalIndex];
    let bestText = chooseBetterCaptionText(speaker, canonicalLine.text, text);
    let latestUpdatedAt = Math.max(observedAt, canonicalLine.updatedAt);
    let sourceNodeHash = candidate.sourceNodeHash || canonicalLine.sourceNodeHash;

    for (const index of indices.slice(1)) {
      const line = session.lines[index];
      bestText = chooseBetterCaptionText(speaker, bestText, line.text);
      latestUpdatedAt = Math.max(latestUpdatedAt, line.updatedAt);
      sourceNodeHash = sourceNodeHash || line.sourceNodeHash;
    }

    const textChanged = bestText !== canonicalLine.text;
    const sourceChanged = Boolean(sourceNodeHash && sourceNodeHash !== canonicalLine.sourceNodeHash);
    const removedDuplicates = indices.length > 1;

    if (!textChanged && !sourceChanged && !removedDuplicates) {
      return session;
    }

    const nextLines = session.lines
      .map((line, index) => {
        if (index !== canonicalIndex) {
          return line;
        }

        return {
          ...line,
          text: bestText,
          updatedAt: latestUpdatedAt,
          revision: textChanged ? line.revision + 1 : line.revision,
          sourceNodeHash
        };
      })
      .filter((_line, index) => index === canonicalIndex || !lineIndexSet.has(index));

    return {
      ...session,
      lines: nextLines,
      lastCapturedAt: observedAt
    };
  }

  function findRecentUnknownDuplicateIndex(lines: TranscriptLine[], text: string, observedAt: number, windowMs: number): number {
    const comparableText = duplicateComparisonText(UNKNOWN_SPEAKER, text);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (observedAt - line.updatedAt > windowMs) {
        break;
      }

      if (line.speaker === UNKNOWN_SPEAKER && duplicateComparisonText(line.speaker, line.text) === comparableText) {
        return index;
      }
    }

    return -1;
  }

  function findRecentCleanerUnknownDuplicateIndex(lines: TranscriptLine[], text: string, observedAt: number, windowMs: number): number {
    if (hasLeadingSelfSpeakerPrefix(text)) {
      return -1;
    }

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (observedAt - line.updatedAt > windowMs) {
        break;
      }

      if (line.speaker === UNKNOWN_SPEAKER && hasCleanerCandidateText(line, text)) {
        return index;
      }
    }

    return -1;
  }

  function isUnknownSpeakerFragment(lines: TranscriptLine[], text: string, observedAt: number, windowMs: number): boolean {
    const comparableText = duplicateComparisonText(UNKNOWN_SPEAKER, text);

    if (isLikelySpeakerLabel(text)) {
      return true;
    }

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (observedAt - line.updatedAt > windowMs) {
        break;
      }

      if (line.speaker === UNKNOWN_SPEAKER && hasCleanerCandidateText(line, text)) {
        return false;
      }

      if (
        normalizeForCaptionComparison(line.speaker) === comparableText ||
        duplicateComparisonText(line.speaker, line.text) === comparableText
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

    const normalizedCandidate = extractEmbeddedSelfSpeaker(candidate.speaker, normalizeText(candidate.text));
    const text = normalizedCandidate.text;
    if (!text || shouldIgnoreCaptionText(normalizedCandidate.speaker, text)) {
      return session;
    }

    const observedAt = Number.isFinite(candidate.observedAt) ? candidate.observedAt : Date.now();
    const speaker = normalizeSpeaker(normalizedCandidate.speaker);
    const updateWindowMs = options.updateWindowMs ?? DEFAULT_UPDATE_WINDOW_MS;
    const duplicateWindowMs = options.duplicateWindowMs ?? DEFAULT_DUPLICATE_WINDOW_MS;
    const candidateUpdateWindowMs = updateWindowForText(text, updateWindowMs);
    const candidateDuplicateWindowMs = duplicateWindowForText(text, duplicateWindowMs);
    const lines = session.lines;
    const comparableText = duplicateComparisonText(speaker, text);
    const comparableSpeaker = normalizeForCaptionComparison(speaker);

    if (comparableSpeaker === comparableText) {
      return session;
    }

    if (speaker === UNKNOWN_SPEAKER && isUnknownSpeakerFragment(lines, text, observedAt, candidateDuplicateWindowMs)) {
      return session;
    }

    if (speaker !== UNKNOWN_SPEAKER) {
      const unknownDuplicateIndex = findRecentUnknownDuplicateIndex(lines, text, observedAt, candidateDuplicateWindowMs);
      if (unknownDuplicateIndex >= 0) {
        const nextLines = lines.slice();
        const previousLine = nextLines[unknownDuplicateIndex];
        nextLines[unknownDuplicateIndex] = {
          ...previousLine,
          speaker,
          text,
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

    const replayVariantIndices = findRecentCaptionReplayVariantIndices(lines, speaker, text, observedAt, candidateDuplicateWindowMs);
    if (replayVariantIndices.length > 0) {
      return mergeCaptionReplayVariants(session, replayVariantIndices, candidate, speaker, text, observedAt);
    }

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (observedAt - line.updatedAt > candidateUpdateWindowMs) {
        break;
      }

      if (normalizeForCaptionComparison(line.speaker) !== comparableSpeaker) {
        continue;
      }

      const comparableLineText = duplicateComparisonText(line.speaker, line.text);

      if (
        text === line.text ||
        line.text.startsWith(text) ||
        comparableText === comparableLineText ||
        comparableLineText.startsWith(comparableText)
      ) {
        if (hasCleanerCandidateText(line, text)) {
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

        return session;
      }

      if (
        text.startsWith(line.text) ||
        comparableText.startsWith(comparableLineText) ||
        isLikelyProgressiveRewrite(speaker, line.text, text)
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

    if (speaker === UNKNOWN_SPEAKER) {
      const cleanerDuplicateIndex = findRecentCleanerUnknownDuplicateIndex(lines, text, observedAt, candidateDuplicateWindowMs);
      if (cleanerDuplicateIndex >= 0) {
        const nextLines = lines.slice();
        const previousLine = nextLines[cleanerDuplicateIndex];
        nextLines[cleanerDuplicateIndex] = {
          ...previousLine,
          text,
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

    if (exactDuplicateSeenRecently(lines, speaker, text, observedAt, candidateDuplicateWindowMs, candidate.sourceNodeHash)) {
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
