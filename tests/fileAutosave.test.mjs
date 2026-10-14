import test from "node:test";
import assert from "node:assert/strict";
import { baseSession, loadLmcl } from "./testHelpers.mjs";

function linkedFile(overrides = {}) {
  return {
    sessionId: "session-1",
    fileName: "meet-transcript.txt",
    handle: {},
    linkedAt: 1_820_000_000_000,
    lastWriteAt: 1_820_000_010_000,
    lastTranscriptUpdatedAt: 1_820_000_001_000,
    lastLineCount: 1,
    permission: "granted",
    error: null,
    ...overrides
  };
}

function sessionWithLines(lineCount, overrides = {}) {
  const lines = Array.from({ length: lineCount }, (_, index) => ({
    id: `line-${index + 1}`,
    speaker: "Wasif",
    text: `Transcript line ${index + 1}.`,
    startedAt: 1_820_000_001_000 + index * 1_000,
    updatedAt: 1_820_000_001_000 + index * 1_000,
    revision: 0
  }));

  return baseSession({
    sessionId: "session-1",
    lines,
    lastCapturedAt: lines.at(-1)?.updatedAt ?? null,
    ...overrides
  });
}

test("does not flush linked file when transcript has not changed", async () => {
  const LMCL = await loadLmcl();
  const session = sessionWithLines(1);
  const link = linkedFile();

  assert.equal(LMCL.hasLinkedTranscriptChanged(session, link), false);
  assert.equal(LMCL.shouldFlushLinkedTranscriptFile(session, link, { now: 1_820_000_030_000 }), false);
});

test("flushes linked file immediately before first write", async () => {
  const LMCL = await loadLmcl();
  const session = sessionWithLines(1);
  const link = linkedFile({
    lastWriteAt: null,
    lastTranscriptUpdatedAt: null,
    lastLineCount: 0
  });

  assert.equal(LMCL.shouldFlushLinkedTranscriptFile(session, link, { now: 1_820_000_002_000 }), true);
});

test("flushes linked file after line threshold or interval", async () => {
  const LMCL = await loadLmcl();
  const session = sessionWithLines(6);
  const link = linkedFile();

  assert.equal(
    LMCL.shouldFlushLinkedTranscriptFile(session, link, {
      now: 1_820_000_011_000,
      lineThreshold: 5,
      intervalMs: 15_000
    }),
    true
  );

  assert.equal(
    LMCL.shouldFlushLinkedTranscriptFile(sessionWithLines(2), link, {
      now: 1_820_000_030_000,
      lineThreshold: 5,
      intervalMs: 15_000
    }),
    true
  );
});

test("flushes linked file on pause or stop even below thresholds", async () => {
  const LMCL = await loadLmcl();
  const link = linkedFile();

  assert.equal(
    LMCL.shouldFlushLinkedTranscriptFile(sessionWithLines(2, { status: "PAUSED" }), link, {
      now: 1_820_000_011_000,
      lineThreshold: 5,
      intervalMs: 15_000
    }),
    true
  );
  assert.equal(
    LMCL.shouldFlushLinkedTranscriptFile(sessionWithLines(2, { status: "STOPPED" }), link, {
      now: 1_820_000_011_000,
      lineThreshold: 5,
      intervalMs: 15_000
    }),
    true
  );
});

test("maps permission failures to paused and write failures to error", async () => {
  const LMCL = await loadLmcl();

  assert.equal(
    LMCL.fileAutosaveRuntimeFromLink(linkedFile({
      permission: "denied",
      error: "Permission denied."
    }), true).status,
    "paused"
  );
  assert.equal(
    LMCL.fileAutosaveRuntimeFromLink(linkedFile({
      permission: "granted",
      error: "Disk write failed."
    }), true).status,
    "error"
  );
});
