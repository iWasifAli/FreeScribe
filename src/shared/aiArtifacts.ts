namespace LMCL {
  const AI_MAX_TRANSCRIPT_CHARS = 90_000;

  export const MEETING_ARTIFACTS_SCHEMA: Record<string, unknown> = {
    type: "object",
    properties: {
      executiveSummary: {
        type: "string",
        description: "A concise executive summary grounded only in the transcript."
      },
      actionItems: {
        type: "array",
        items: {
          type: "object",
          properties: {
            task: { type: "string", description: "The concrete action to take." },
            owner: {
              type: "string",
              nullable: true,
              description: "Owner named in the transcript, or null."
            },
            dueDate: {
              type: "string",
              nullable: true,
              description: "Due date mentioned in the transcript, or null."
            },
            priority: {
              type: "string",
              enum: ["low", "medium", "high", "unknown"],
              description: "Priority only when implied by transcript urgency."
            },
            status: { type: "string", description: "Short status such as open, blocked, or done." }
          },
          required: ["task", "owner", "dueDate", "priority", "status"]
        }
      },
      minutesOfMeeting: {
        type: "object",
        properties: {
          overview: { type: "string" },
          attendees: { type: "array", items: { type: "string" } },
          keyTopics: { type: "array", items: { type: "string" } },
          decisions: { type: "array", items: { type: "string" } },
          risks: { type: "array", items: { type: "string" } },
          nextSteps: { type: "array", items: { type: "string" } }
        },
        required: ["overview", "attendees", "keyTopics", "decisions", "risks", "nextSteps"]
      }
    },
    required: ["executiveSummary", "actionItems", "minutesOfMeeting"]
  };

  function isArtifactRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function sanitizeNullableText(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const normalized = normalizeText(String(value));
    return normalized || null;
  }

  function sanitizeTextArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => normalizeText(String(item ?? "")))
      .filter((item) => item.length > 0);
  }

  function sanitizePriority(value: unknown): AiActionPriority {
    return value === "low" || value === "medium" || value === "high" || value === "unknown"
      ? value
      : "unknown";
  }

  function sanitizeActionItems(value: unknown): AiActionItem[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const items: AiActionItem[] = [];
    for (const item of value) {
      if (!isArtifactRecord(item)) {
        continue;
      }

      const task = normalizeText(String(item.task ?? ""));
      if (!task) {
        continue;
      }

      items.push({
        task,
        owner: sanitizeNullableText(item.owner),
        dueDate: sanitizeNullableText(item.dueDate),
        priority: sanitizePriority(item.priority),
        status: normalizeText(String(item.status ?? "")) || "open"
      });
    }

    return items;
  }

  function sanitizeMinutesOfMeeting(value: unknown): AiMinutesOfMeeting {
    const source = isArtifactRecord(value) ? value : {};
    return {
      overview: normalizeText(String(source.overview ?? "")),
      attendees: sanitizeTextArray(source.attendees),
      keyTopics: sanitizeTextArray(source.keyTopics),
      decisions: sanitizeTextArray(source.decisions),
      risks: sanitizeTextArray(source.risks),
      nextSteps: sanitizeTextArray(source.nextSteps)
    };
  }

  function stripJsonFence(text: string): string {
    const trimmed = text.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenced ? fenced[1].trim() : trimmed;
  }

  export function getTranscriptUpdatedAt(session: TranscriptSession): number | null {
    const latestLineUpdate = session.lines.reduce((latest, line) => Math.max(latest, line.updatedAt || line.startedAt || 0), 0);
    return latestLineUpdate || session.lastCapturedAt || null;
  }

  export function hasCurrentAiArtifacts(session: TranscriptSession): boolean {
    const artifacts = session.aiArtifacts;
    if (!artifacts) {
      return false;
    }

    return (
      artifacts.transcriptLineCount === session.lines.length &&
      artifacts.transcriptUpdatedAt === getTranscriptUpdatedAt(session)
    );
  }

  export function sanitizeMeetingArtifacts(
    value: unknown,
    metadata: {
      generatedAt: number;
      model: string;
      transcriptLineCount: number;
      transcriptUpdatedAt: number | null;
    }
  ): AiMeetingArtifacts {
    const source = isArtifactRecord(value) ? value : {};
    return {
      executiveSummary: normalizeText(String(source.executiveSummary ?? "")),
      actionItems: sanitizeActionItems(source.actionItems),
      minutesOfMeeting: sanitizeMinutesOfMeeting(source.minutesOfMeeting),
      generatedAt: metadata.generatedAt,
      model: metadata.model,
      transcriptLineCount: metadata.transcriptLineCount,
      transcriptUpdatedAt: metadata.transcriptUpdatedAt
    };
  }

  export function parseMeetingArtifactsJson(
    text: string,
    metadata: {
      generatedAt: number;
      model: string;
      transcriptLineCount: number;
      transcriptUpdatedAt: number | null;
    }
  ): AiMeetingArtifacts {
    const parsed = JSON.parse(stripJsonFence(text)) as unknown;
    return sanitizeMeetingArtifacts(parsed, metadata);
  }

  export function buildMeetingArtifactsPrompt(session: TranscriptSession): string {
    const transcriptLines = session.lines.map((line) => `[${formatClockTime(line.startedAt)}] ${line.speaker}: ${line.text}`);
    const transcript = transcriptLines.join("\n");
    const safeTranscript = transcript.length > AI_MAX_TRANSCRIPT_CHARS
      ? transcript.slice(transcript.length - AI_MAX_TRANSCRIPT_CHARS)
      : transcript;
    const truncatedNotice = transcript.length > safeTranscript.length
      ? "The transcript was truncated to the most recent lines because it exceeded the local prompt limit."
      : "The full transcript is included.";

    return [
      "Generate meeting artifacts from this Google Meet transcript.",
      "Ground every statement in the transcript. Do not invent attendees, owners, dates, decisions, or risks.",
      "Use null for unknown owners or due dates. Use empty arrays when the transcript does not contain a category.",
      "Keep the executive summary concise, action items concrete, and MoM readable for a business stakeholder.",
      "",
      "Meeting metadata:",
      `Title: ${normalizeText(session.meetingTitle) || "Unknown"}`,
      `URL: ${normalizeText(session.meetingUrl) || "Unknown"}`,
      `Started: ${formatLocalDateTime(session.startedAt)}`,
      `Ended: ${session.endedAt ? formatLocalDateTime(session.endedAt) : "Still recording or not stopped"}`,
      `Transcript lines: ${session.lines.length}`,
      `Transcript coverage: ${truncatedNotice}`,
      "",
      "Transcript:",
      safeTranscript || "(No transcript lines captured.)"
    ].join("\n");
  }

  function markdownList(items: string[], emptyText: string): string[] {
    if (items.length === 0) {
      return [`- ${emptyText}`];
    }

    return items.map((item) => `- ${item}`);
  }

  export function formatMeetingArtifactsAsMarkdown(session: TranscriptSession, exportedAt: number = Date.now()): string {
    const artifacts = session.aiArtifacts;
    if (!artifacts) {
      return "";
    }

    const actionLines = artifacts.actionItems.length === 0
      ? ["- No action items identified."]
      : artifacts.actionItems.map((item) => {
          const details = [
            item.owner ? `Owner: ${item.owner}` : "Owner: Unassigned",
            item.dueDate ? `Due: ${item.dueDate}` : "Due: Unspecified",
            `Priority: ${item.priority}`,
            `Status: ${item.status || "open"}`
          ].join("; ");
          return `- ${item.task} (${details})`;
        });

    return [
      `# ${PRODUCT_NAME} Meeting Notes`,
      "",
      `Meeting: ${normalizeText(session.meetingTitle) || "Unknown"}`,
      `Meeting URL: ${normalizeText(session.meetingUrl) || "Unknown"}`,
      `Started: ${formatLocalDateTime(session.startedAt)}`,
      `Generated: ${formatLocalDateTime(artifacts.generatedAt)}`,
      `Exported: ${formatLocalDateTime(exportedAt)}`,
      `Model: ${artifacts.model}`,
      `Transcript lines: ${artifacts.transcriptLineCount}`,
      "",
      "## Executive Summary",
      "",
      artifacts.executiveSummary || "No executive summary generated.",
      "",
      "## Action Items",
      "",
      ...actionLines,
      "",
      "## Minutes of Meeting",
      "",
      artifacts.minutesOfMeeting.overview || "No overview generated.",
      "",
      "### Attendees",
      ...markdownList(artifacts.minutesOfMeeting.attendees, "No attendees identified."),
      "",
      "### Key Topics",
      ...markdownList(artifacts.minutesOfMeeting.keyTopics, "No key topics identified."),
      "",
      "### Decisions",
      ...markdownList(artifacts.minutesOfMeeting.decisions, "No decisions identified."),
      "",
      "### Risks",
      ...markdownList(artifacts.minutesOfMeeting.risks, "No risks identified."),
      "",
      "### Next Steps",
      ...markdownList(artifacts.minutesOfMeeting.nextSteps, "No next steps identified."),
      ""
    ].join("\n");
  }

  export function createMeetingArtifactsFilename(session: TranscriptSession, exportedAt: number = Date.now()): string {
    const datePart = formatFilenameDate(exportedAt);
    const titleSlug = slugifyTitle(session.meetingTitle);
    const nameParts = ["meet-notes"];

    if (titleSlug) {
      nameParts.push(titleSlug);
    }

    nameParts.push(datePart);
    return `${nameParts.join("_")}.md`;
  }
}
