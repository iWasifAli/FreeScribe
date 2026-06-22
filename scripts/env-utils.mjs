import { readFile } from "node:fs/promises";
import { join } from "node:path";

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex === -1) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return key ? [key, value] : null;
}

async function readDotEnv(cwd) {
  try {
    const source = await readFile(join(cwd, ".env"), "utf8");
    const values = {};
    for (const line of source.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (parsed) {
        values[parsed[0]] = parsed[1];
      }
    }
    return values;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

function isExplicitlyEnabled(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

export async function readBuildEnv(options = {}) {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const dotEnv = await readDotEnv(cwd);
  const getValue = (key) => env[key] ?? dotEnv[key] ?? "";
  const geminiModel = getValue("GEMINI_MODEL").trim() || DEFAULT_GEMINI_MODEL;
  const aiEnabledValue = getValue("FREESCRIBE_AI_ENABLED");
  const aiEnabled = isExplicitlyEnabled(aiEnabledValue);
  const geminiApiKey = aiEnabled ? getValue("FREESCRIBE_GEMINI_API_KEY").trim() : "";

  return {
    geminiApiKey,
    geminiModel,
    aiEnabled,
    aiEnabledValue: aiEnabled ? "true" : "false",
    geminiConfigured: aiEnabled && Boolean(geminiApiKey)
  };
}
