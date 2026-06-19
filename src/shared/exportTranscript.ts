namespace LMCL {
  export function formatTranscriptAsTxt(session: TranscriptSession, exportedAt: number = Date.now()): string {
    const endedLabel = session.endedAt
      ? formatLocalDateTime(session.endedAt)
      : "Still recording at export";

    const header = [
      `${PRODUCT_NAME} Transcript`,
      `Meeting: ${normalizeText(session.meetingTitle) || "Unknown"}`,
      `Meeting URL: ${normalizeText(session.meetingUrl) || "Unknown"}`,
      `Started: ${formatLocalDateTime(session.startedAt)}`,
      `Ended: ${endedLabel}`,
      `Exported: ${formatLocalDateTime(exportedAt)}`,
      `Line count: ${session.lines.length}`,
      "",
      "--- Transcript ---"
    ];

    const transcriptLines =
      session.lines.length > 0
        ? session.lines.map((line) => `[${formatClockTime(line.startedAt)}] ${line.speaker}: ${line.text}`)
        : ["(No transcript lines captured.)"];

    return [...header, ...transcriptLines, ""].join("\n");
  }

  export function createTranscriptFilename(session: TranscriptSession, exportedAt: number = Date.now()): string {
    const datePart = formatFilenameDate(exportedAt);
    const titleSlug = slugifyTitle(session.meetingTitle);
    const nameParts = ["meet-transcript"];

    if (titleSlug) {
      nameParts.push(titleSlug);
    }

    nameParts.push(datePart);
    return `${nameParts.join("_")}.txt`;
  }
}
