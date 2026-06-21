import test from "node:test";
import assert from "node:assert/strict";
import { baseSession, candidate, loadLmcl } from "./testHelpers.mjs";

const reducerOptions = {
  idFactory: (_candidate, session) => `line-${session.lines.length + 1}`
};

test("appends the first caption line", async () => {
  const LMCL = await loadLmcl();
  const next = LMCL.applyCaptionCandidate(baseSession(), candidate(), reducerOptions);

  assert.equal(next.lines.length, 1);
  assert.equal(next.lines[0].speaker, "Wasif");
  assert.equal(next.lines[0].text, "I pushed the backend changes.");
  assert.equal(next.lines[0].revision, 0);
});

test("ignores an empty caption", async () => {
  const LMCL = await loadLmcl();
  const session = baseSession();
  const next = LMCL.applyCaptionCandidate(session, candidate({ text: "   \n\t " }), reducerOptions);

  assert.equal(next, session);
  assert.equal(next.lines.length, 0);
});

test("uses Unknown Speaker when speaker is missing", async () => {
  const LMCL = await loadLmcl();
  const next = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({ speaker: null, text: "Caption without a speaker." }),
    reducerOptions
  );

  assert.equal(next.lines[0].speaker, "Unknown Speaker");
});

test("replaces progressive caption updates from the same speaker", async () => {
  const LMCL = await loadLmcl();
  const first = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({ text: "I think", observedAt: 1_820_000_001_000 }),
    reducerOptions
  );
  const next = LMCL.applyCaptionCandidate(
    first,
    candidate({ text: "I think we should merge this", observedAt: 1_820_000_004_000 }),
    reducerOptions
  );

  assert.equal(next.lines.length, 1);
  assert.equal(next.lines[0].text, "I think we should merge this");
  assert.equal(next.lines[0].revision, 1);
  assert.equal(next.lines[0].startedAt, 1_820_000_001_000);
  assert.equal(next.lines[0].updatedAt, 1_820_000_004_000);
});

test("replaces progressive updates even when Meet changes capitalization and punctuation", async () => {
  const LMCL = await loadLmcl();
  const first = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({
      speaker: "Michael Shekwolo",
      text: "shown Two APIs integrated into our system. So I'm just you testing you who flow to be And yeah. So",
      observedAt: 1_820_000_001_000
    }),
    reducerOptions
  );
  const next = LMCL.applyCaptionCandidate(
    first,
    candidate({
      speaker: "Michael Shekwolo",
      text: "shown Two APIs integrated into our system. So I'm just you testing you who flow to be and yeah, so that's for the merchants.",
      observedAt: 1_820_000_004_000
    }),
    reducerOptions
  );

  assert.equal(next.lines.length, 1);
  assert.equal(
    next.lines[0].text,
    "shown Two APIs integrated into our system. So I'm just you testing you who flow to be and yeah, so that's for the merchants."
  );
});

test("does not rewrite separate same-speaker sentences with a shared opening phrase", async () => {
  const LMCL = await loadLmcl();
  const first = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({ speaker: "Wasif", text: "I think we should start with auth", observedAt: 1_820_000_001_000 }),
    reducerOptions
  );
  const next = LMCL.applyCaptionCandidate(
    first,
    candidate({ speaker: "Wasif", text: "I think we should start with billing", observedAt: 1_820_000_004_000 }),
    reducerOptions
  );

  assert.equal(next.lines.length, 2);
  assert.equal(next.lines[0].text, "I think we should start with auth");
  assert.equal(next.lines[1].text, "I think we should start with billing");
});

test("does not rewrite separate same-speaker sentences that share a source hash", async () => {
  const LMCL = await loadLmcl();
  const first = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({
      speaker: "Wasif",
      text: "I think we should start with auth",
      observedAt: 1_820_000_001_000,
      sourceNodeHash: "caption-source-1"
    }),
    reducerOptions
  );
  const next = LMCL.applyCaptionCandidate(
    first,
    candidate({
      speaker: "Wasif",
      text: "I think we should start with billing",
      observedAt: 1_820_000_004_000,
      sourceNodeHash: "caption-source-1"
    }),
    reducerOptions
  );

  assert.equal(next.lines.length, 2);
  assert.equal(next.lines[0].text, "I think we should start with auth");
  assert.equal(next.lines[1].text, "I think we should start with billing");
});

test("allows same-source progressive rewrites for corrected caption text", async () => {
  const LMCL = await loadLmcl();
  const first = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({
      speaker: "Wasif",
      text: "I think we should start with auth",
      observedAt: 1_820_000_001_000,
      sourceNodeHash: "caption-source-1"
    }),
    reducerOptions
  );
  const next = LMCL.applyCaptionCandidate(
    first,
    candidate({
      speaker: "Wasif",
      text: "I think we should start with authorization before billing",
      observedAt: 1_820_000_004_000,
      sourceNodeHash: "caption-source-1"
    }),
    reducerOptions
  );

  assert.equal(next.lines.length, 1);
  assert.equal(next.lines[0].text, "I think we should start with authorization before billing");
  assert.equal(next.lines[0].sourceNodeHash, "caption-source-1");
});

test("updates a recent same-speaker line even after another speaker appears", async () => {
  const LMCL = await loadLmcl();
  const first = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({ speaker: "Michael Shekwolo", text: "The merchant workspace is ready", observedAt: 1_820_000_001_000 }),
    reducerOptions
  );
  const second = LMCL.applyCaptionCandidate(
    first,
    candidate({ speaker: "Ignat Remizov", text: "Can you record a short jam?", observedAt: 1_820_000_002_000 }),
    reducerOptions
  );
  const next = LMCL.applyCaptionCandidate(
    second,
    candidate({
      speaker: "Michael Shekwolo",
      text: "The merchant workspace is ready for review",
      observedAt: 1_820_000_004_000
    }),
    reducerOptions
  );

  assert.equal(next.lines.length, 2);
  assert.equal(next.lines[0].text, "The merchant workspace is ready for review");
  assert.equal(next.lines[1].speaker, "Ignat Remizov");
});

test("ignores shorter duplicate caption mutations", async () => {
  const LMCL = await loadLmcl();
  const first = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({ text: "I think we should merge this", observedAt: 1_820_000_001_000 }),
    reducerOptions
  );
  const next = LMCL.applyCaptionCandidate(
    first,
    candidate({ text: "I think we should", observedAt: 1_820_000_004_000 }),
    reducerOptions
  );

  assert.equal(next, first);
  assert.equal(next.lines.length, 1);
});

test("appends when the speaker changes", async () => {
  const LMCL = await loadLmcl();
  const first = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({ speaker: "Wasif", text: "I pushed the backend changes.", observedAt: 1_820_000_001_000 }),
    reducerOptions
  );
  const next = LMCL.applyCaptionCandidate(
    first,
    candidate({ speaker: "Sarah", text: "I will review the PR.", observedAt: 1_820_000_003_000 }),
    reducerOptions
  );

  assert.equal(next.lines.length, 2);
  assert.equal(next.lines[1].speaker, "Sarah");
});

test("appends a new unrelated sentence from the same speaker", async () => {
  const LMCL = await loadLmcl();
  const first = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({ text: "The backend change is ready.", observedAt: 1_820_000_001_000 }),
    reducerOptions
  );
  const next = LMCL.applyCaptionCandidate(
    first,
    candidate({ text: "Now we need the webhook test.", observedAt: 1_820_000_004_000 }),
    reducerOptions
  );

  assert.equal(next.lines.length, 2);
  assert.equal(next.lines[1].text, "Now we need the webhook test.");
});

test("does not append while paused", async () => {
  const LMCL = await loadLmcl();
  const session = baseSession({ status: "PAUSED" });
  const next = LMCL.applyCaptionCandidate(session, candidate(), reducerOptions);

  assert.equal(next, session);
  assert.equal(next.lines.length, 0);
});

test("does not append while stopped", async () => {
  const LMCL = await loadLmcl();
  const session = baseSession({ status: "STOPPED" });
  const next = LMCL.applyCaptionCandidate(session, candidate(), reducerOptions);

  assert.equal(next, session);
  assert.equal(next.lines.length, 0);
});

test("normalizes whitespace and preserves unicode caption text", async () => {
  const LMCL = await loadLmcl();
  const next = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({ speaker: "  علی  ", text: "  مرحبا   بالعالم  —  こんにちは  " }),
    reducerOptions
  );

  assert.equal(next.lines[0].speaker, "علی");
  assert.equal(next.lines[0].text, "مرحبا بالعالم — こんにちは");
});

test("ignores exact duplicates seen recently", async () => {
  const LMCL = await loadLmcl();
  const first = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({ speaker: "Wasif", text: "Ship it.", observedAt: 1_820_000_001_000 }),
    reducerOptions
  );
  const next = LMCL.applyCaptionCandidate(
    first,
    candidate({ speaker: "Wasif", text: "Ship it.", observedAt: 1_820_000_020_000 }),
    reducerOptions
  );

  assert.equal(next, first);
  assert.equal(next.lines.length, 1);
});

test("ignores speaker-name-only caption fragments", async () => {
  const LMCL = await loadLmcl();
  const session = baseSession();
  const next = LMCL.applyCaptionCandidate(
    session,
    candidate({ speaker: "Wasif Ali", text: "Wasif Ali", observedAt: 1_820_000_001_000 }),
    reducerOptions
  );

  assert.equal(next.lines.length, 0);
});

test("ignores unknown fragments that duplicate a recent speaker or caption text", async () => {
  const LMCL = await loadLmcl();
  const first = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({
      speaker: "Wasif Ali",
      text: "Do we have any sandbox credentials for Gs that we can test on locally?",
      observedAt: 1_820_000_001_000
    }),
    reducerOptions
  );
  const afterSpeakerFragment = LMCL.applyCaptionCandidate(
    first,
    candidate({ speaker: null, text: "Wasif Ali", observedAt: 1_820_000_001_100 }),
    reducerOptions
  );
  const afterTextFragment = LMCL.applyCaptionCandidate(
    afterSpeakerFragment,
    candidate({
      speaker: null,
      text: "Do we have any sandbox credentials for Gs that we can test on locally?",
      observedAt: 1_820_000_001_200
    }),
    reducerOptions
  );

  assert.equal(afterTextFragment.lines.length, 1);
  assert.equal(afterTextFragment.lines[0].speaker, "Wasif Ali");
});

test("replaces a recent unknown duplicate with the real speaker when the full candidate arrives second", async () => {
  const LMCL = await loadLmcl();
  const first = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({
      speaker: null,
      text: "Do we have any sandbox credentials for Gs that we can test on locally?",
      observedAt: 1_820_000_001_000
    }),
    reducerOptions
  );
  const next = LMCL.applyCaptionCandidate(
    first,
    candidate({
      speaker: "Wasif Ali",
      text: "Do we have any sandbox credentials for Gs that we can test on locally?",
      observedAt: 1_820_000_001_200
    }),
    reducerOptions
  );

  assert.equal(next.lines.length, 1);
  assert.equal(next.lines[0].speaker, "Wasif Ali");
  assert.equal(next.lines[0].revision, 1);
});

test("dedupes apostrophe-only transcription variants", async () => {
  const LMCL = await loadLmcl();
  const first = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({ speaker: "Ignat Remizov", text: "Until then use mocked APIs locally.", observedAt: 1_820_000_001_000 }),
    reducerOptions
  );
  const next = LMCL.applyCaptionCandidate(
    first,
    candidate({ speaker: "Ignat Remizov", text: "Until then use mocked api's locally.", observedAt: 1_820_000_004_000 }),
    reducerOptions
  );

  assert.equal(next.lines.length, 1);
  assert.equal(next.lines[0].text, "Until then use mocked APIs locally.");
});

test("ignores obvious Google Meet control and material icon text", async () => {
  const LMCL = await loadLmcl();
  const session = baseSession();
  const controls = [
    candidate({ speaker: null, text: "closed_caption_off", observedAt: 1_820_000_001_000 }),
    candidate({ speaker: "zoom_in", text: "Zoom in", observedAt: 1_820_000_002_000 }),
    candidate({ speaker: "open_in_new", text: "Open in new window", observedAt: 1_820_000_003_000 }),
    candidate({ speaker: "format_size", text: "Font size", observedAt: 1_820_000_004_000 }),
    candidate({ speaker: "computer_arrow_up", text: "Michael Shekwolo is presenting", observedAt: 1_820_000_005_000 })
  ];

  const next = controls.reduce(
    (current, controlCandidate) => LMCL.applyCaptionCandidate(current, controlCandidate, reducerOptions),
    session
  );

  assert.equal(next.lines.length, 0);
});

test("ignores Google Meet pre-join and device status text without a speaker", async () => {
  const LMCL = await loadLmcl();
  const session = baseSession();
  const statusCandidates = [
    "Looking for others on the call…",
    "No one else is here",
    "Ignat Remizov, Michael Shekwolo and Wasif Ali are in this call",
    "Camera is starting",
    "Move the call here without interrupting it, then stop the call on the other device",
    "Switch the call here",
    "error Camera might be blocked Check your camera's privacy switch and remove anything that is covering the camera lens",
    "Camera might be blocked",
    "Check your camera's privacy switch and remove anything that is covering the camera lens"
  ];

  const next = statusCandidates.reduce(
    (current, text, index) => LMCL.applyCaptionCandidate(
      current,
      candidate({ speaker: null, text, observedAt: 1_820_000_001_000 + index }),
      reducerOptions
    ),
    session
  );

  assert.equal(next.lines.length, 0);
});

test("keeps pre-join-like words when a real speaker says them", async () => {
  const LMCL = await loadLmcl();
  const next = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({ speaker: "Wasif Ali", text: "No one else is here", observedAt: 1_820_000_001_000 }),
    reducerOptions
  );

  assert.equal(next.lines.length, 1);
  assert.equal(next.lines[0].text, "No one else is here");
});
