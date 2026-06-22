import test from "node:test";
import assert from "node:assert/strict";
import { getLmclContext, loadLmcl } from "./testHelpers.mjs";

test("migrates stored v2 sessions to v3 with empty AI artifacts", async () => {
  const LMCL = await loadLmcl();
  const context = getLmclContext();
  const storedSession = {
    sessionId: "session-1",
    status: "STOPPED",
    meetingTitle: "Weekly Engineering Sync",
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    meetingCode: "abc-defg-hij",
    startedAt: 1_820_000_000_000,
    endedAt: 1_820_000_120_000,
    lastCapturedAt: 1_820_000_012_000,
    lines: [
      {
        id: "line-1",
        speaker: "Wasif",
        text: "I pushed the backend changes.",
        startedAt: 1_820_000_001_000,
        updatedAt: 1_820_000_001_000,
        revision: 0
      }
    ]
  };

  context.chrome = {
    storage: {
      local: {
        get: async () => ({
          [LMCL.STORAGE_KEY]: {
            version: 2,
            sessionsByTabId: {
              123: storedSession
            },
            sessionsByMeetingKey: {
              "code:abc-defg-hij": storedSession
            },
            updatedAt: 1_820_000_130_000
          }
        })
      }
    }
  };

  const stored = await LMCL.loadStoredState();

  assert.equal(stored.version, 3);
  assert.equal(stored.sessionsByTabId["123"].aiArtifacts, null);
  assert.equal(stored.sessionsByMeetingKey["code:abc-defg-hij"].aiArtifacts, null);
  assert.equal(stored.sessionsByTabId["123"].lines.length, 1);
});

