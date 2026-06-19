namespace LMCL {
  const CONTROL_TEXTS = new Set([
    "audio settings",
    "camera",
    "caption settings",
    "captions",
    "chat with everyone",
    "circle",
    "closed caption",
    "closed caption off",
    "closed_caption",
    "closed_caption_off",
    "computer arrow up",
    "computer_arrow_up",
    "enter full screen",
    "font color",
    "font colour",
    "font size",
    "format size",
    "format_size",
    "keyboard arrow up",
    "keyboard_arrow_up",
    "leave call",
    "meeting details",
    "microphone",
    "more options",
    "open caption settings",
    "open in new window",
    "open_in_full",
    "open_in_new",
    "people",
    "present now",
    "settings",
    "turn off captions",
    "turn on captions",
    "video settings",
    "zoom in",
    "zoom_in"
  ]);

  const PRE_JOIN_STATUS_TEXTS = new Set([
    "camera is starting",
    "camera might be blocked",
    "check your cameras privacy switch and remove anything that is covering the camera lens",
    "error camera might be blocked check your cameras privacy switch and remove anything that is covering the camera lens",
    "looking for others on the call",
    "move the call here without interrupting it then stop the call on the other device",
    "no one else is here",
    "switch the call here"
  ]);

  export function normalizeText(text: string | null | undefined): string {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  export function normalizeSpeaker(speaker: string | null | undefined): string {
    const normalized = normalizeText(speaker || "");
    return normalized || UNKNOWN_SPEAKER;
  }

  export function normalizeForCaptionComparison(text: string | null | undefined): string {
    return normalizeText(text)
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/['\u2019`]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  export function isMaterialIconToken(text: string | null | undefined): boolean {
    const normalized = normalizeText(text).toLocaleLowerCase();
    return /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(normalized);
  }

  export function isLikelyMeetControlText(text: string | null | undefined): boolean {
    const normalized = normalizeForCaptionComparison(text);
    const raw = normalizeText(text).toLocaleLowerCase();

    if (!normalized && !raw) {
      return false;
    }

    if (CONTROL_TEXTS.has(normalized) || CONTROL_TEXTS.has(raw)) {
      return true;
    }

    if (isMaterialIconToken(raw)) {
      return true;
    }

    return /\bis presenting\b/i.test(raw) && raw.length < 140;
  }

  export function isLikelyMeetPreJoinStatusText(text: string | null | undefined): boolean {
    const normalized = normalizeForCaptionComparison(text);

    if (!normalized) {
      return false;
    }

    if (PRE_JOIN_STATUS_TEXTS.has(normalized)) {
      return true;
    }

    return /\b(?:is|are) in this call$/.test(normalized) && normalized.length < 180;
  }

  export function shouldIgnoreCaptionText(speaker: string | null | undefined, text: string | null | undefined): boolean {
    const normalizedText = normalizeText(text);
    const normalizedSpeaker = normalizeText(speaker);
    const hasRealSpeaker = Boolean(normalizedSpeaker) && normalizedSpeaker !== UNKNOWN_SPEAKER;

    if (!normalizedText) {
      return true;
    }

    if (isLikelyMeetControlText(normalizedText)) {
      return true;
    }

    if (normalizedSpeaker && isLikelyMeetControlText(normalizedSpeaker)) {
      return true;
    }

    if (normalizedSpeaker && isMaterialIconToken(normalizedSpeaker)) {
      return true;
    }

    if (!hasRealSpeaker && isLikelyMeetPreJoinStatusText(normalizedText)) {
      return true;
    }

    return false;
  }

  export function isLikelySpeakerLabel(text: string | null | undefined): boolean {
    const normalized = normalizeText(text);
    if (!normalized || normalized.length > 64 || /[.!?,:;()[\]{}]/.test(normalized)) {
      return false;
    }

    const words = normalized.split(/\s+/);
    if (words.length < 2 || words.length > 5) {
      return false;
    }

    const latinWords = words.filter((word) => /\p{Script=Latin}/u.test(word));
    if (latinWords.length === 0) {
      return false;
    }

    const capitalizedWords = latinWords.filter((word) => /^[A-ZÀ-ÖØ-Þ][\p{Script=Latin}'-]*$/u.test(word));
    return capitalizedWords.length / latinWords.length >= 0.75;
  }
}
