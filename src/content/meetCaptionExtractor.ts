namespace LMCL {
  const MAX_CANDIDATE_NODES = 900;
  const MAX_RAW_TEXT_LENGTH = 900;
  const MIN_CAPTION_TEXT_LENGTH = 2;

  interface ScoredCaptionNode {
    element: HTMLElement;
    score: number;
    rawText: string;
  }

  function isDebugEnabled(): boolean {
    try {
      return localStorage.getItem("freeScribeDebug") === "1" || localStorage.getItem("lmclDebug") === "1";
    } catch {
      return false;
    }
  }

  export function debugLog(...args: unknown[]): void {
    if (isDebugEnabled()) {
      console.debug("[FreeScribe]", ...args);
    }
  }

  function compactVisibleText(text: string | null | undefined): string {
    return (text || "")
      .replace(/\u00a0/g, " ")
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  function inlineText(text: string | null | undefined): string {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function isElementVisible(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 20 && rect.height > 8 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight;
  }

  function isInteractiveElement(element: HTMLElement): boolean {
    return element.matches(
      "button,[role='button'],[role='menuitem'],[role='menuitemcheckbox'],input,textarea,select,a[href]"
    );
  }

  function isInsideInteractiveElement(element: HTMLElement): boolean {
    return Boolean(
      element.closest("button,[role='button'],[role='menuitem'],[role='menuitemcheckbox'],input,textarea,select,a[href]")
    );
  }

  function isIconElement(element: HTMLElement): boolean {
    const fontFamily = window.getComputedStyle(element).fontFamily.toLocaleLowerCase();
    const className = typeof element.className === "string" ? element.className.toLocaleLowerCase() : "";

    return (
      element.getAttribute("aria-hidden") === "true" ||
      fontFamily.includes("material icons") ||
      fontFamily.includes("material symbols") ||
      className.includes("material-icons") ||
      className.includes("material-symbols")
    );
  }

  function shouldSkipTextElement(element: HTMLElement): boolean {
    return isInteractiveElement(element) || isInsideInteractiveElement(element) || isIconElement(element);
  }

  function isLikelyControlText(text: string): boolean {
    return isLikelyMeetControlText(text);
  }

  function looksLikeCaptionNode(element: HTMLElement, rawText: string): boolean {
    if (rawText.length < MIN_CAPTION_TEXT_LENGTH || rawText.length > MAX_RAW_TEXT_LENGTH) {
      return false;
    }

    if (isLikelyControlText(rawText)) {
      return false;
    }

    if (shouldSkipTextElement(element)) {
      return false;
    }

    const interactiveChildCount = element.querySelectorAll(
      "button,[role='button'],[role='menuitem'],[role='menuitemcheckbox'],input,textarea,select,a[href]"
    ).length;
    return interactiveChildCount === 0;
  }

  function hasCaptionSpecificAnchor(element: HTMLElement): boolean {
    return Boolean(element.closest("[aria-label*='caption' i],[data-testid*='caption' i]"));
  }

  function scoreNode(element: HTMLElement, rawText: string): number {
    const rect = element.getBoundingClientRect();
    let score = 0;

    if (element.hasAttribute("aria-live")) {
      score += 40;
    }
    if (element.getAttribute("role") === "log" || element.getAttribute("role") === "status") {
      score += 24;
    }
    if (/caption/i.test(`${element.getAttribute("aria-label") || ""} ${element.getAttribute("data-testid") || ""}`)) {
      score += 28;
    }
    if (rect.top > window.innerHeight * 0.45) {
      score += 18;
    }
    if (rect.bottom > window.innerHeight * 0.65) {
      score += 12;
    }
    if (rawText.includes("\n")) {
      score += 8;
    }
    if (rawText.length >= 12 && rawText.length <= 260) {
      score += 8;
    }
    if (hasLikelyUnlabelledCaptionStructure(element, rawText)) {
      score += 28;
    }

    return score;
  }

  function isInLikelyCaptionRegion(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    const viewportHeight = Math.max(window.innerHeight || 0, 1);

    return (
      rect.top >= viewportHeight * 0.38 &&
      rect.bottom >= viewportHeight * 0.52 &&
      rect.height <= viewportHeight * 0.45 &&
      rect.width >= 80
    );
  }

  function hasLikelyUnlabelledCaptionStructure(element: HTMLElement, rawText: string): boolean {
    if (hasCaptionSpecificAnchor(element) || rawText.length < MIN_CAPTION_TEXT_LENGTH) {
      return false;
    }

    if (!isInLikelyCaptionRegion(element)) {
      return false;
    }

    const parts = getVisibleLeafTextParts(element);
    if (parts.length < 2) {
      return false;
    }

    return parsePartsIntoSegments(parts).some((segment) => {
      return inlineText(segment.text).length >= MIN_CAPTION_TEXT_LENGTH && !shouldIgnoreCaptionText(segment.speaker, segment.text);
    });
  }

  function collectPotentialCaptionElements(root: Document): HTMLElement[] {
    const anchoredSelectors = [
      "[aria-live]",
      "[role='log']",
      "[role='status']",
      "[aria-label*='caption' i]",
      "[data-testid*='caption' i]"
    ];
    const fallbackSelectors = ["div", "span", "p"];
    const seen = new Set<HTMLElement>();
    const elements: HTMLElement[] = [];
    const fallbackElements: HTMLElement[] = [];

    for (const element of root.querySelectorAll<HTMLElement>(anchoredSelectors.join(","))) {
      seen.add(element);
      elements.push(element);
    }

    if (elements.length >= MAX_CANDIDATE_NODES) {
      return elements.slice(-MAX_CANDIDATE_NODES);
    }

    for (const element of root.querySelectorAll<HTMLElement>(fallbackSelectors.join(","))) {
      if (seen.has(element)) {
        continue;
      }

      seen.add(element);
      fallbackElements.push(element);
    }

    return elements.concat(fallbackElements.slice(-(MAX_CANDIDATE_NODES - elements.length)));
  }

  function collectCandidateNodes(root: Document): ScoredCaptionNode[] {
    const elements = collectPotentialCaptionElements(root);
    const scored: ScoredCaptionNode[] = [];

    for (const element of elements) {
      if (!isElementVisible(element)) {
        continue;
      }

      const rawText = compactVisibleText(element.innerText || element.textContent);
      if (!looksLikeCaptionNode(element, rawText)) {
        continue;
      }

      const score = scoreNode(element, rawText);
      if (score >= 20) {
        scored.push({ element, score, rawText });
      }
    }

    return scored.sort((left, right) => right.score - left.score).slice(0, 12);
  }

  function getVisibleLeafTextParts(element: HTMLElement): string[] {
    const parts: string[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (!(node instanceof HTMLElement) || !isElementVisible(node) || shouldSkipTextElement(node)) {
          return NodeFilter.FILTER_REJECT;
        }

        const text = inlineText(node.innerText || node.textContent);
        if (!text || isLikelyControlText(text)) {
          return NodeFilter.FILTER_REJECT;
        }

        const visibleChildWithText = Array.from(node.children).some((child) => {
          if (!(child instanceof HTMLElement) || !isElementVisible(child) || shouldSkipTextElement(child)) {
            return false;
          }

          return Boolean(inlineText(child.innerText || child.textContent));
        });

        return visibleChildWithText ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_ACCEPT;
      }
    });

    while (parts.length < 20) {
      const node = walker.nextNode();
      if (!node) {
        break;
      }

      const text = inlineText((node as HTMLElement).innerText || node.textContent);
      if (text && !isLikelyControlText(text) && !parts.includes(text)) {
        parts.push(text);
      }
    }

    return parts;
  }

  function hasLatinSpeakerCasing(text: string): boolean {
    const words = text.split(/\s+/);
    const latinWords = words.filter((word) => /\p{Script=Latin}/u.test(word));
    if (latinWords.length === 0 || text.includes("@")) {
      return true;
    }

    return latinWords.some((word) => /^[A-ZÀ-ÖØ-Þ]/u.test(word));
  }

  function isPlausibleSpeakerName(value: string): boolean {
    const text = inlineText(value).replace(/:$/, "");
    if (!text || text.length > 64 || text.length < 2) {
      return false;
    }

    if (/[.!?]$/.test(text) || /[_/\\]/.test(text) || isLikelyControlText(text)) {
      return false;
    }

    const words = text.split(/\s+/);
    if (words.length > 6) {
      return false;
    }

    const lowered = text.toLowerCase();
    return !["captions", "transcript", "google meet", "unknown"].includes(lowered) && hasLatinSpeakerCasing(text);
  }

  function parsePartsIntoSegments(parts: string[]): { speaker: string | null; text: string }[] {
    const segments: { speaker: string | null; text: string }[] = [];
    let currentSpeaker: string | null = null;
    let buffer: string[] = [];

    for (const part of parts) {
      const cleanedPart = inlineText(part);
      if (!cleanedPart || isLikelyControlText(cleanedPart)) {
        continue;
      }

      if (isPlausibleSpeakerName(cleanedPart) && (!currentSpeaker || buffer.length > 0)) {
        if (currentSpeaker && buffer.length > 0) {
          const text = inlineText(buffer.join(" "));
          if (text && !isLikelyControlText(text)) {
            segments.push({ speaker: currentSpeaker, text });
          }
        }

        currentSpeaker = cleanedPart.replace(/:$/, "");
        buffer = [];
        continue;
      }

      buffer.push(cleanedPart);
    }

    if (currentSpeaker && buffer.length > 0) {
      const text = inlineText(buffer.join(" "));
      if (text && !isLikelyControlText(text)) {
        segments.push({ speaker: currentSpeaker, text });
      }
    }

    return segments;
  }

  function parseRawCaption(element: HTMLElement, rawText: string): { speaker: string | null; text: string }[] {
    const leafParts = getVisibleLeafTextParts(element);
    if (leafParts.length >= 2) {
      const segments = parsePartsIntoSegments(leafParts);
      if (segments.length > 0) {
        return segments;
      }
    }

    const lines = rawText
      .split("\n")
      .map(inlineText)
      .filter(Boolean);

    if (lines.length >= 2 && isPlausibleSpeakerName(lines[0])) {
      const text = inlineText(lines.slice(1).join(" "));
      return text && !isLikelyControlText(text)
        ? [{ speaker: lines[0].replace(/:$/, ""), text }]
        : [];
    }

    const colonMatch = inlineText(rawText).match(/^([^:]{2,64}):\s+(.+)$/);
    if (colonMatch && isPlausibleSpeakerName(colonMatch[1])) {
      return isLikelyControlText(colonMatch[2])
        ? []
        : [{
            speaker: colonMatch[1].trim(),
            text: inlineText(colonMatch[2])
          }];
    }

    const fallbackText = inlineText(rawText);
    if (fallbackText.length > 260) {
      return [];
    }

    return fallbackText && !isLikelyControlText(fallbackText) ? [{ speaker: null, text: fallbackText }] : [];
  }

  function hashText(value: string): string {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 33) ^ value.charCodeAt(index);
    }

    return (hash >>> 0).toString(36);
  }

  function sourceHashForSegment(
    element: HTMLElement,
    segment: { speaker: string | null; text: string },
    segmentIndex: number
  ): string {
    const rect = element.getBoundingClientRect();
    const stableParts = [
      element.tagName,
      element.getAttribute("role") || "",
      element.getAttribute("aria-live") || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("data-testid") || "",
      Math.round(rect.top / 10),
      Math.round(rect.left / 10),
      Math.round(rect.width / 10),
      Math.round(rect.height / 10),
      segmentIndex,
      normalizeForCaptionComparison(segment.speaker),
      normalizeForCaptionComparison(segment.text)
    ];

    return hashText(stableParts.join(":"));
  }

  function removeFragmentCandidates(candidates: CaptionCandidate[]): CaptionCandidate[] {
    const speakerNames = new Set<string>();
    const speakeredTexts = new Set<string>();

    for (const candidate of candidates) {
      if (!candidate.speaker) {
        continue;
      }

      speakerNames.add(normalizeForCaptionComparison(candidate.speaker));
      speakeredTexts.add(normalizeForCaptionComparison(candidate.text));
    }

    return candidates.filter((candidate) => {
      const comparableText = normalizeForCaptionComparison(candidate.text);
      const comparableSpeaker = normalizeForCaptionComparison(candidate.speaker);

      if (comparableSpeaker && comparableSpeaker === comparableText) {
        return false;
      }

      if (candidate.speaker) {
        return true;
      }

      if (isLikelySpeakerLabel(candidate.text)) {
        return false;
      }

      return !speakerNames.has(comparableText) && !speakeredTexts.has(comparableText);
    });
  }

  export function extractCaptionCandidates(root: Document = document, observedAt: number = Date.now()): CaptionCandidate[] {
    const scoredNodes = collectCandidateNodes(root);
    const seenKeys = new Set<string>();
    const candidates: CaptionCandidate[] = [];

    for (const scoredNode of scoredNodes) {
      const parsedSegments = parseRawCaption(scoredNode.element, scoredNode.rawText);
      for (let segmentIndex = 0; segmentIndex < parsedSegments.length; segmentIndex += 1) {
        const parsed = parsedSegments[segmentIndex];
        if (!parsed.speaker && !hasCaptionSpecificAnchor(scoredNode.element)) {
          continue;
        }

        if (!inlineText(parsed.text) || shouldIgnoreCaptionText(parsed.speaker, parsed.text)) {
          continue;
        }

        const text = inlineText(parsed.text);
        const speaker = parsed.speaker ? inlineText(parsed.speaker) : null;
        const key = `${speaker || ""}\n${text}`;
        if (seenKeys.has(key)) {
          continue;
        }

        seenKeys.add(key);
        candidates.push({
          speaker,
          text,
          observedAt,
          rawText: scoredNode.rawText,
          sourceNodeHash: sourceHashForSegment(scoredNode.element, { speaker, text }, segmentIndex)
        });
      }
    }

    const cleanedCandidates = removeFragmentCandidates(candidates);

    if (cleanedCandidates.length > 0) {
      debugLog("caption candidates", cleanedCandidates);
    }

    return cleanedCandidates;
  }

  export function getPageMetadata(): MeetingMetadata {
    const url = window.location.href;
    const title = inlineText(document.title).replace(/\s*-\s*Google Meet\s*$/i, "") || null;
    let meetingCode: string | null = null;

    try {
      meetingCode = new URL(url).pathname.split("/").filter(Boolean)[0] || null;
    } catch {
      meetingCode = null;
    }

    return {
      meetingTitle: title,
      meetingUrl: url,
      meetingCode
    };
  }
}
