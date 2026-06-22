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

test("extracts embedded You self-speaker labels from unknown candidates", async () => {
  const LMCL = await loadLmcl();
  const next = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({ speaker: null, text: "You Okay. Like there's one. Thank you." }),
    reducerOptions
  );

  assert.equal(next.lines[0].speaker, "You");
  assert.equal(next.lines[0].text, "Okay. Like there's one. Thank you.");
});

test("does not strip You from ordinary unknown-speech sentences", async () => {
  const LMCL = await loadLmcl();
  const next = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({ speaker: null, text: "You need to check this locally." }),
    reducerOptions
  );

  assert.equal(next.lines[0].speaker, "Unknown Speaker");
  assert.equal(next.lines[0].text, "You need to check this locally.");
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

test("ignores long stale duplicates from retained Meet caption history", async () => {
  const LMCL = await loadLmcl();
  const longCaption =
    "I got a call from Sharia and he is saying he is on the way to his house because of the weather. There is a electricity shortage in his office.";
  const first = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({ speaker: "Muaviya Imran", text: longCaption, observedAt: 1_820_000_001_000 }),
    reducerOptions
  );
  const next = LMCL.applyCaptionCandidate(
    first,
    candidate({ speaker: "Muaviya Imran", text: longCaption, observedAt: 1_820_000_181_000 }),
    reducerOptions
  );

  assert.equal(next, first);
  assert.equal(next.lines.length, 1);
});

test("ignores long replayed captions with only a noisy trailing correction", async () => {
  const LMCL = await loadLmcl();
  const firstText =
    "Okay. Is this working? Oh, it is working. so what I'm going to do in this meeting session is going to test this free, scribe API and then I would report to Myself and Codex about the results. Thank you. So interested to see how it goes. Okay, take sometimes to generate the notes. I hope it doesn't crash this time. instead of";
  const replayText =
    "Okay. Is this working? Oh, it is working. so what I'm going to do in this meeting session is going to test this free, scribe API and then I would report to Myself and Codex about the results. Thank you. So interested to see how it goes. Okay, take sometimes to generate the notes. I hope it doesn't crash this time. It's";
  const first = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({ speaker: "You", text: firstText, observedAt: 1_820_000_001_000, sourceNodeHash: "caption-source-1" }),
    reducerOptions
  );
  const next = LMCL.applyCaptionCandidate(
    first,
    candidate({ speaker: "You", text: replayText, observedAt: 1_820_000_045_000, sourceNodeHash: "caption-source-2" }),
    reducerOptions
  );

  assert.equal(next.lines.length, 1);
  assert.equal(next.lines[0].text, firstText);
});

test("replaces a long replayed caption with the fuller version instead of appending", async () => {
  const LMCL = await loadLmcl();
  const firstText =
    "Okay. Is this working? Oh, it is working. so what I'm going to do in this meeting session is going to test this free, scribe API and then I would report to Myself and Codex about the results. Thank you. So interested to see how it goes. Okay, take sometimes to generate the notes. I hope it doesn't crash this time. instead of";
  const fullerText =
    "Okay. Is this working? Oh, it is working. so what I'm going to do in this meeting session is going to test this free, scribe API and then I would report to Myself and Codex about the results. Thank you. So interested to see how it goes. Okay, take sometimes to generate the notes. I hope it doesn't crash this time. I started. Oh man, wow. Good. Really good. Okay.";
  const first = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({ speaker: "You", text: firstText, observedAt: 1_820_000_001_000, sourceNodeHash: "caption-source-1" }),
    reducerOptions
  );
  const next = LMCL.applyCaptionCandidate(
    first,
    candidate({ speaker: "You", text: fullerText, observedAt: 1_820_000_055_000, sourceNodeHash: "caption-source-3" }),
    reducerOptions
  );

  assert.equal(next.lines.length, 1);
  assert.equal(next.lines[0].text, fullerText);
  assert.equal(next.lines[0].revision, 1);
});

test("collapses already-appended long caption replay variants into one line", async () => {
  const LMCL = await loadLmcl();
  const firstText =
    "Okay. Is this working? Oh, it is working. so what I'm going to do in this meeting session is going to test this free, scribe API and then I would report to Myself and Codex about the results. Thank you. So interested to see how it goes. Okay, take sometimes to generate the notes. I hope it doesn't crash this time. instead of";
  const replayText =
    "Okay. Is this working? Oh, it is working. so what I'm going to do in this meeting session is going to test this free, scribe API and then I would report to Myself and Codex about the results. Thank you. So interested to see how it goes. Okay, take sometimes to generate the notes. I hope it doesn't crash this time. It's";
  const fullerText =
    "Okay. Is this working? Oh, it is working. so what I'm going to do in this meeting session is going to test this free, scribe API and then I would report to Myself and Codex about the results. Thank you. So interested to see how it goes. Okay, take sometimes to generate the notes. I hope it doesn't crash this time. I started. Oh man, wow. Good. Really good. Okay.";
  const session = baseSession({
    lines: [
      {
        id: "line-1",
        speaker: "You",
        text: firstText,
        startedAt: 1_820_000_001_000,
        updatedAt: 1_820_000_001_000,
        revision: 0,
        sourceNodeHash: "caption-source-1"
      },
      {
        id: "line-2",
        speaker: "You",
        text: replayText,
        startedAt: 1_820_000_045_000,
        updatedAt: 1_820_000_045_000,
        revision: 0,
        sourceNodeHash: "caption-source-2"
      }
    ]
  });
  const next = LMCL.applyCaptionCandidate(
    session,
    candidate({ speaker: "You", text: fullerText, observedAt: 1_820_000_055_000, sourceNodeHash: "caption-source-3" }),
    reducerOptions
  );

  assert.equal(next.lines.length, 1);
  assert.equal(next.lines[0].id, "line-1");
  assert.equal(next.lines[0].text, fullerText);
});

test("replaces noisy unknown self-speaker duplicates with the cleaner text", async () => {
  const LMCL = await loadLmcl();
  const first = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({
      speaker: null,
      text: "You Did you speak to the designer regarding the design?",
      observedAt: 1_820_000_001_000
    }),
    reducerOptions
  );
  const next = LMCL.applyCaptionCandidate(
    first,
    candidate({
      speaker: null,
      text: "Did you speak to the designer regarding the design?",
      observedAt: 1_820_000_002_000
    }),
    reducerOptions
  );

  assert.equal(next.lines.length, 1);
  assert.equal(next.lines[0].speaker, "You");
  assert.equal(next.lines[0].text, "Did you speak to the designer regarding the design?");
  assert.equal(next.lines[0].revision, 0);
});

test("updates long progressive captions beyond the short live-caption window", async () => {
  const LMCL = await loadLmcl();
  const first = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({
      speaker: "Michael Shekwolo",
      text: "and then, And I'm just doing some final. Checks. So basically, This this way, this is the PR for EMI front and there's a PR for transactions.",
      observedAt: 1_820_000_001_000
    }),
    reducerOptions
  );
  const next = LMCL.applyCaptionCandidate(
    first,
    candidate({
      speaker: "Michael Shekwolo",
      text: "and then, And I'm just doing some final. Checks. So basically, This this way, this is the PR for EMI front and there's a PR for transactions. There's still some conflicts, but I'm still going to fix them.",
      observedAt: 1_820_000_041_000
    }),
    reducerOptions
  );

  assert.equal(next.lines.length, 1);
  assert.equal(next.lines[0].revision, 1);
  assert.match(next.lines[0].text, /conflicts/);
});

test("replaces fuzzy progressive rewrites when Meet changes the trailing word", async () => {
  const LMCL = await loadLmcl();
  const first = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({
      speaker: "Michael Shekwolo",
      text: "Okay, so Basically. I had done my part. with the whole merchants everything, but The made some new changes in the design. For the mu.",
      observedAt: 1_820_000_001_000
    }),
    reducerOptions
  );
  const next = LMCL.applyCaptionCandidate(
    first,
    candidate({
      speaker: "Michael Shekwolo",
      text: "Okay, so Basically. I had done my part. with the whole merchants everything, but The made some new changes in the design. For the merchants onboarding flow so that is what I've lasted a walking on. This morning.",
      observedAt: 1_820_000_006_000
    }),
    reducerOptions
  );

  assert.equal(next.lines.length, 1);
  assert.equal(next.lines[0].revision, 1);
  assert.match(next.lines[0].text, /onboarding flow/);
});

test("keeps repeated short acknowledgements after the duplicate window", async () => {
  const LMCL = await loadLmcl();
  const first = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({
      speaker: "Muaviya Imran",
      text: "Okay.",
      observedAt: 1_820_000_001_000,
      sourceNodeHash: "caption-source-1"
    }),
    reducerOptions
  );
  const next = LMCL.applyCaptionCandidate(
    first,
    candidate({
      speaker: "Muaviya Imran",
      text: "Okay.",
      observedAt: 1_820_000_061_000,
      sourceNodeHash: "caption-source-2"
    }),
    reducerOptions
  );

  assert.equal(next.lines.length, 2);
});

test("ignores same-source short captions retained in the DOM after speakers go quiet", async () => {
  const LMCL = await loadLmcl();
  const first = LMCL.applyCaptionCandidate(
    baseSession(),
    candidate({
      speaker: "Muaviya Imran",
      text: "Okay.",
      observedAt: 1_820_000_001_000,
      sourceNodeHash: "caption-source-1"
    }),
    reducerOptions
  );
  const next = LMCL.applyCaptionCandidate(
    first,
    candidate({
      speaker: "Muaviya Imran",
      text: "Okay.",
      observedAt: 1_820_000_061_000,
      sourceNodeHash: "caption-source-1"
    }),
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
