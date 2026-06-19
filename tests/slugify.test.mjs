import test from "node:test";
import assert from "node:assert/strict";
import { loadLmcl } from "./testHelpers.mjs";

test("slugifies titles for filenames", async () => {
  const LMCL = await loadLmcl();

  assert.equal(LMCL.slugifyTitle(" Weekly Engineering Sync / Launch Readiness! "), "weekly-engineering-sync-launch-readiness");
  assert.equal(LMCL.slugifyTitle("Crème Brûlée Review"), "creme-brulee-review");
  assert.equal(LMCL.slugifyTitle(null), "");
});

test("limits long filename slugs", async () => {
  const LMCL = await loadLmcl();
  const slug = LMCL.slugifyTitle("A very long meeting title that should not make the downloaded transcript filename painfully long for filesystems");

  assert.equal(slug.length <= 72, true);
  assert.equal(slug.endsWith("-"), false);
});
