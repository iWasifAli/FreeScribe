import test from "node:test";
import assert from "node:assert/strict";
import { baseSession, loadLmcl } from "./testHelpers.mjs";

test("creates separate library records for repeated meetings with the same code", async () => {
  const LMCL = await loadLmcl();
  const first = LMCL.createMeetingRecord(baseSession({
    sessionId: "session-1",
    startedAt: 1_820_000_000_000,
    lines: [
      {
        id: "line-1",
        speaker: "Wasif",
        text: "First meeting transcript.",
        startedAt: 1_820_000_001_000,
        updatedAt: 1_820_000_001_000,
        revision: 0
      }
    ]
  }), null, 1_820_000_010_000);
  const second = LMCL.createMeetingRecord(baseSession({
    sessionId: "session-2",
    startedAt: 1_820_100_000_000,
    lines: [
      {
        id: "line-2",
        speaker: "Sarah",
        text: "Second meeting transcript.",
        startedAt: 1_820_100_001_000,
        updatedAt: 1_820_100_001_000,
        revision: 0
      }
    ]
  }), null, 1_820_100_010_000);

  assert.equal(first.meetingKey, "code:abc-defg-hij");
  assert.equal(second.meetingKey, "code:abc-defg-hij");
  assert.notEqual(first.sessionId, second.sessionId);
});

test("queries library records by transcript text and sorts newest first", async () => {
  const LMCL = await loadLmcl();
  const older = LMCL.createMeetingRecord(baseSession({
    sessionId: "older",
    meetingTitle: "Planning",
    startedAt: 1_820_000_000_000,
    lines: [
      {
        id: "line-1",
        speaker: "Wasif",
        text: "Discuss pricing launch.",
        startedAt: 1_820_000_001_000,
        updatedAt: 1_820_000_001_000,
        revision: 0
      }
    ]
  }), null, 1_820_000_010_000);
  const newer = LMCL.createMeetingRecord(baseSession({
    sessionId: "newer",
    meetingTitle: "Launch",
    startedAt: 1_820_200_000_000,
    lines: [
      {
        id: "line-2",
        speaker: "Sarah",
        text: "Review launch checklist.",
        startedAt: 1_820_200_001_000,
        updatedAt: 1_820_200_001_000,
        revision: 0
      }
    ]
  }), null, 1_820_200_010_000);

  const result = LMCL.queryMeetingRecords([older, newer], { search: "launch" });

  assert.equal(result.total, 2);
  assert.deepEqual(Array.from(result.summaries, (summary) => summary.sessionId), ["newer", "older"]);
  assert.equal(result.summaries[0].lineCount, 1);
});

test("updates existing library record without losing created timestamp", async () => {
  const LMCL = await loadLmcl();
  const original = LMCL.createMeetingRecord(baseSession({
    sessionId: "session-1",
    startedAt: 1_820_000_000_000,
    lines: []
  }), null, 1_820_000_010_000);
  const updated = LMCL.createMeetingRecord(baseSession({
    sessionId: "session-1",
    startedAt: 1_820_000_000_000,
    lines: [
      {
        id: "line-1",
        speaker: "Wasif",
        text: "New detail.",
        startedAt: 1_820_000_050_000,
        updatedAt: 1_820_000_050_000,
        revision: 0
      }
    ]
  }), original, 1_820_000_060_000);

  assert.equal(updated.createdAt, original.createdAt);
  assert.equal(updated.updatedAt, 1_820_000_060_000);
  assert.match(updated.searchText, /new detail/);
});
