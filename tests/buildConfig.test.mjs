import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readBuildEnv } from "../scripts/env-utils.mjs";
import { injectBackgroundEnv } from "../scripts/inject-env.mjs";
import { buildExtensionManifest, GEMINI_HOST_PERMISSION } from "../scripts/manifest-utils.mjs";

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "freescribe-build-config-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function baseManifest() {
  return {
    manifest_version: 3,
    host_permissions: ["https://meet.google.com/*"]
  };
}

test("build env defaults AI off with no .env or env vars", async () => {
  await withTempDir(async (cwd) => {
    const config = await readBuildEnv({ cwd, env: {} });

    assert.equal(config.aiEnabled, false);
    assert.equal(config.geminiApiKey, "");
    assert.equal(config.geminiConfigured, false);
  });
});

test("build env ignores generic global GEMINI_API_KEY without explicit enable", async () => {
  await withTempDir(async (cwd) => {
    const config = await readBuildEnv({
      cwd,
      env: {
        GEMINI_API_KEY: "global-gemini-key"
      }
    });

    assert.equal(config.aiEnabled, false);
    assert.equal(config.geminiApiKey, "");
    assert.equal(config.geminiConfigured, false);
  });
});

test("build env keeps AI off when disabled even with namespaced key", async () => {
  await withTempDir(async (cwd) => {
    const config = await readBuildEnv({
      cwd,
      env: {
        FREESCRIBE_AI_ENABLED: "false",
        FREESCRIBE_GEMINI_API_KEY: "local-key"
      }
    });

    assert.equal(config.aiEnabled, false);
    assert.equal(config.geminiApiKey, "");
    assert.equal(config.geminiConfigured, false);
  });
});

test("build env injects key only when explicitly enabled", async () => {
  await withTempDir(async (cwd) => {
    const config = await readBuildEnv({
      cwd,
      env: {
        FREESCRIBE_AI_ENABLED: "true",
        FREESCRIBE_GEMINI_API_KEY: "local-key"
      }
    });

    assert.equal(config.aiEnabled, true);
    assert.equal(config.geminiApiKey, "local-key");
    assert.equal(config.geminiConfigured, true);
  });
});

test("build env reads explicit AI config from project .env", async () => {
  await withTempDir(async (cwd) => {
    await writeFile(
      join(cwd, ".env"),
      [
        "FREESCRIBE_AI_ENABLED=true",
        "FREESCRIBE_GEMINI_API_KEY=dotenv-key",
        "GEMINI_MODEL=gemini-test-model"
      ].join("\n")
    );

    const config = await readBuildEnv({ cwd, env: {} });

    assert.equal(config.geminiApiKey, "dotenv-key");
    assert.equal(config.geminiModel, "gemini-test-model");
    assert.equal(config.geminiConfigured, true);
  });
});

test("manifest omits Gemini host permission for unconfigured AI builds", () => {
  const manifest = buildExtensionManifest(baseManifest(), { geminiConfigured: false });

  assert.deepEqual(manifest.host_permissions, ["https://meet.google.com/*"]);
});

test("manifest adds Gemini host permission only for configured AI builds", () => {
  const manifest = buildExtensionManifest(baseManifest(), { geminiConfigured: true });

  assert.deepEqual(manifest.host_permissions, ["https://meet.google.com/*", GEMINI_HOST_PERMISSION]);
});

test("injects background env constants and clears injected placeholders", () => {
  const source = [
    'const INJECTED_GEMINI_API_KEY = "__FREESCRIBE_GEMINI_API_KEY__";',
    'const INJECTED_GEMINI_MODEL = "__FREESCRIBE_GEMINI_MODEL__";',
    'const INJECTED_AI_ENABLED = "__FREESCRIBE_AI_ENABLED__";'
  ].join("\n");

  const output = injectBackgroundEnv(source, {
    geminiApiKey: "local-key",
    geminiModel: "gemini-test-model",
    aiEnabledValue: "true"
  });

  assert.match(output, /const INJECTED_GEMINI_API_KEY = "local-key";/);
  assert.match(output, /const INJECTED_GEMINI_MODEL = "gemini-test-model";/);
  assert.match(output, /const INJECTED_AI_ENABLED = "true";/);
  assert.equal(output.includes('const INJECTED_GEMINI_API_KEY = "__FREESCRIBE_'), false);
});

test("fails env injection when compiled background constants are missing", () => {
  assert.throws(
    () => injectBackgroundEnv('const INJECTED_GEMINI_API_KEY = "__FREESCRIBE_GEMINI_API_KEY__";', {
      geminiApiKey: "",
      geminiModel: "gemini-3.5-flash",
      aiEnabledValue: "false"
    }),
    /Could not inject INJECTED_GEMINI_MODEL/
  );
});
