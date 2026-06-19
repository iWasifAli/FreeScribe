import { readFile } from "node:fs/promises";
import vm from "node:vm";

let cachedLmcl = null;

export async function loadLmcl() {
  if (cachedLmcl) {
    return cachedLmcl;
  }

  const source = await readFile(new URL("../test-dist/shared-test.js", import.meta.url), "utf8");
  const context = {
    console,
    crypto: {
      randomUUID: () => "test-uuid"
    },
    Date,
    Math
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: "test-dist/shared-test.js" });
  cachedLmcl = context.LMCL;
  return cachedLmcl;
}

export function baseSession(overrides = {}) {
  return {
    sessionId: "session-1",
    status: "RECORDING",
    meetingTitle: "Weekly Engineering Sync",
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    meetingCode: "abc-defg-hij",
    startedAt: 1_820_000_000_000,
    endedAt: null,
    lastCapturedAt: null,
    lines: [],
    ...overrides
  };
}

export function candidate(overrides = {}) {
  return {
    speaker: "Wasif",
    text: "I pushed the backend changes.",
    rawText: "Wasif I pushed the backend changes.",
    observedAt: 1_820_000_001_000,
    ...overrides
  };
}
