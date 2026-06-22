import test from "node:test";
import assert from "node:assert/strict";
import { baseSession, loadLmcl } from "./testHelpers.mjs";

const generatedAt = 1_820_000_140_000;
const transcriptUpdatedAt = 1_820_000_012_000;

function artifactSession(overrides = {}) {
  return baseSession({
    lines: [
      {
        id: "line-1",
        speaker: "Wasif",
        text: "Sarah will review the PR tomorrow.",
        startedAt: 1_820_000_001_000,
        updatedAt: 1_820_000_001_000,
        revision: 0
      },
      {
        id: "line-2",
        speaker: "Sarah",
        text: "We decided to ship the release after QA signs off.",
        startedAt: 1_820_000_012_000,
        updatedAt: transcriptUpdatedAt,
        revision: 0
      }
    ],
    ...overrides
  });
}

test("parses and sanitizes Gemini JSON artifacts", async () => {
  const LMCL = await loadLmcl();
  const artifacts = LMCL.parseMeetingArtifactsJson(
    JSON.stringify({
      executiveSummary: "  The team aligned on release readiness.  ",
      actionItems: [
        {
          task: " Review the PR ",
          owner: " Sarah ",
          dueDate: " tomorrow ",
          priority: "urgent",
          status: ""
        },
        {
          task: ""
        }
      ],
      minutesOfMeeting: {
        overview: " Release readiness discussion ",
        attendees: [" Wasif ", "Sarah", ""],
        keyTopics: ["QA"],
        decisions: ["Ship after QA sign-off"],
        risks: null,
        nextSteps: ["Sarah reviews PR"]
      }
    }),
    {
      generatedAt,
      model: "gemini-3.5-flash",
      transcriptLineCount: 2,
      transcriptUpdatedAt
    }
  );

  assert.equal(artifacts.executiveSummary, "The team aligned on release readiness.");
  assert.deepEqual(JSON.parse(JSON.stringify(artifacts.actionItems)), [
    {
      task: "Review the PR",
      owner: "Sarah",
      dueDate: "tomorrow",
      priority: "unknown",
      status: "open"
    }
  ]);
  assert.deepEqual([...artifacts.minutesOfMeeting.attendees], ["Wasif", "Sarah"]);
  assert.deepEqual([...artifacts.minutesOfMeeting.risks], []);
});

test("detects whether saved AI artifacts match the current transcript", async () => {
  const LMCL = await loadLmcl();
  const session = artifactSession({
    aiArtifacts: {
      executiveSummary: "Release is waiting on QA.",
      actionItems: [],
      minutesOfMeeting: {
        overview: "",
        attendees: [],
        keyTopics: [],
        decisions: [],
        risks: [],
        nextSteps: []
      },
      generatedAt,
      model: "gemini-3.5-flash",
      transcriptLineCount: 2,
      transcriptUpdatedAt
    }
  });

  assert.equal(LMCL.hasCurrentAiArtifacts(session), true);
  assert.equal(
    LMCL.hasCurrentAiArtifacts({
      ...session,
      lines: [
        ...session.lines,
        {
          id: "line-3",
          speaker: "Wasif",
          text: "I will update the changelog.",
          startedAt: 1_820_000_030_000,
          updatedAt: 1_820_000_030_000,
          revision: 0
        }
      ]
    }),
    false
  );
});

test("formats generated AI artifacts as Markdown", async () => {
  const LMCL = await loadLmcl();
  const session = artifactSession({
    aiArtifacts: {
      executiveSummary: "Release is waiting on QA.",
      actionItems: [
        {
          task: "Review the PR",
          owner: "Sarah",
          dueDate: "tomorrow",
          priority: "medium",
          status: "open"
        }
      ],
      minutesOfMeeting: {
        overview: "Release readiness was discussed.",
        attendees: ["Wasif", "Sarah"],
        keyTopics: ["QA"],
        decisions: ["Ship after QA sign-off"],
        risks: [],
        nextSteps: ["Sarah reviews PR"]
      },
      generatedAt,
      model: "gemini-3.5-flash",
      transcriptLineCount: 2,
      transcriptUpdatedAt
    }
  });

  const markdown = LMCL.formatMeetingArtifactsAsMarkdown(session, 1_820_000_150_000);

  assert.match(markdown, /^# FreeScribe Meeting Notes\n/);
  assert.match(markdown, /## Executive Summary\n\nRelease is waiting on QA\./);
  assert.match(markdown, /- Review the PR \(Owner: Sarah; Due: tomorrow; Priority: medium; Status: open\)/);
  assert.match(markdown, /### Decisions\n- Ship after QA sign-off/);
  assert.match(markdown, /### Risks\n- No risks identified\./);
});

test("builds Gemini generateContent payload with JSON mode fields", async () => {
  const LMCL = await loadLmcl();
  const session = artifactSession({
    meetingUrl: "https://meet.google.com/private-code"
  });
  const payload = LMCL.buildGeminiGenerateContentRequest(session);
  const serialized = JSON.stringify(payload);

  assert.equal(payload.generationConfig.responseMimeType, "application/json");
  assert.equal(Boolean(payload.generationConfig.responseSchema), true);
  assert.equal("responseFormat" in payload.generationConfig, false);
  assert.equal(serialized.includes("responseMimeType"), true);
  assert.equal(serialized.includes("https://meet.google.com/private-code"), false);
});

test("uses Gemini-compatible nullable schema fields", async () => {
  const LMCL = await loadLmcl();
  const actionProperties = LMCL.MEETING_ARTIFACTS_SCHEMA.properties.actionItems.items.properties;

  assert.equal(actionProperties.owner.type, "string");
  assert.equal(actionProperties.owner.nullable, true);
  assert.equal(Array.isArray(actionProperties.owner.type), false);
  assert.equal(actionProperties.dueDate.type, "string");
  assert.equal(actionProperties.dueDate.nullable, true);
  assert.equal(Array.isArray(actionProperties.dueDate.type), false);
});

test("merges AI artifacts into the latest matching session without dropping new lines", async () => {
  const LMCL = await loadLmcl();
  const original = artifactSession();
  const latest = {
    ...original,
    lines: [
      ...original.lines,
      {
        id: "line-3",
        speaker: "Wasif",
        text: "I will update the changelog.",
        startedAt: 1_820_000_030_000,
        updatedAt: 1_820_000_030_000,
        revision: 0
      }
    ]
  };
  const artifacts = LMCL.sanitizeMeetingArtifacts(
    {
      executiveSummary: "Release is waiting on QA.",
      actionItems: [],
      minutesOfMeeting: {}
    },
    {
      generatedAt,
      model: "gemini-3.5-flash",
      transcriptLineCount: original.lines.length,
      transcriptUpdatedAt
    }
  );

  const merged = LMCL.mergeAiArtifactsIntoSession(original.sessionId, latest, artifacts);

  assert.equal(merged.lines.length, 3);
  assert.equal(merged.aiArtifacts.executiveSummary, "Release is waiting on QA.");
  assert.equal(LMCL.hasCurrentAiArtifacts(merged), false);
});

test("rejects AI artifact merge when the transcript session changed", async () => {
  const LMCL = await loadLmcl();
  const original = artifactSession();
  const latest = artifactSession({ sessionId: "new-session" });
  const artifacts = LMCL.sanitizeMeetingArtifacts(
    {
      executiveSummary: "Release is waiting on QA.",
      actionItems: [],
      minutesOfMeeting: {}
    },
    {
      generatedAt,
      model: "gemini-3.5-flash",
      transcriptLineCount: original.lines.length,
      transcriptUpdatedAt
    }
  );

  assert.equal(LMCL.mergeAiArtifactsIntoSession(original.sessionId, latest, artifacts), null);
});
