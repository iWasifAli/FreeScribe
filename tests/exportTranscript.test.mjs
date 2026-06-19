import test from "node:test";
import assert from "node:assert/strict";
import { baseSession, loadLmcl } from "./testHelpers.mjs";

test("formats transcript text with metadata and raw caption lines", async () => {
  const LMCL = await loadLmcl();
  const session = baseSession({
    endedAt: 1_820_000_120_000,
    lines: [
      {
        id: "line-1",
        speaker: "Wasif",
        text: "I pushed the backend changes.",
        startedAt: 1_820_000_001_000,
        updatedAt: 1_820_000_001_000,
        revision: 0
      },
      {
        id: "line-2",
        speaker: "Sarah",
        text: "Okay, I will review the PR.",
        startedAt: 1_820_000_012_000,
        updatedAt: 1_820_000_012_000,
        revision: 0
      }
    ]
  });

  const output = LMCL.formatTranscriptAsTxt(session, 1_820_000_130_000);

  assert.match(output, /^ZolvatScribe Transcript\n/);
  assert.match(output, /Meeting: Weekly Engineering Sync\n/);
  assert.match(output, /Meeting URL: https:\/\/meet\.google\.com\/abc-defg-hij\n/);
  assert.match(output, /Line count: 2\n/);
  assert.match(output, /\n--- Transcript ---\n/);
  assert.match(output, /\[\d{2}:\d{2}:\d{2}\] Wasif: I pushed the backend changes\./);
  assert.match(output, /\[\d{2}:\d{2}:\d{2}\] Sarah: Okay, I will review the PR\./);
  assert.equal(output.endsWith("\n"), true);
});

test("marks an active session as still recording at export", async () => {
  const LMCL = await loadLmcl();
  const output = LMCL.formatTranscriptAsTxt(baseSession({ endedAt: null }), 1_820_000_130_000);

  assert.match(output, /Ended: Still recording at export\n/);
});

test("creates an explicit empty transcript body", async () => {
  const LMCL = await loadLmcl();
  const output = LMCL.formatTranscriptAsTxt(baseSession({ lines: [] }), 1_820_000_130_000);

  assert.match(output, /Line count: 0\n/);
  assert.match(output, /\(No transcript lines captured\.\)/);
});

test("creates branded filename with slugified title and local date", async () => {
  const LMCL = await loadLmcl();
  const filename = LMCL.createTranscriptFilename(
    baseSession({ meetingTitle: "Weekly Engineering Sync / Launch Readiness!" }),
    1_820_000_130_000
  );

  assert.match(filename, /^meet-transcript_weekly-engineering-sync-launch-readiness_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.txt$/);
});

test("creates filename without title when title is unavailable", async () => {
  const LMCL = await loadLmcl();
  const filename = LMCL.createTranscriptFilename(baseSession({ meetingTitle: null }), 1_820_000_130_000);

  assert.match(filename, /^meet-transcript_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.txt$/);
});
