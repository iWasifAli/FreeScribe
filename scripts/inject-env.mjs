import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { readBuildEnv } from "./env-utils.mjs";

const INJECTED_CONSTS = [
  "INJECTED_GEMINI_API_KEY",
  "INJECTED_GEMINI_MODEL",
  "INJECTED_AI_ENABLED"
];

function replaceInjectedConst(name, value) {
  const pattern = new RegExp(`const\\s+${name}\\s*=\\s*"[^"]*";`);
  if (!pattern.test(this.source)) {
    throw new Error(`Could not inject ${name}; compiled background.js did not contain expected placeholder.`);
  }

  this.source = this.source.replace(pattern, `const ${name} = ${JSON.stringify(value)};`);
}

export function injectBackgroundEnv(source, config) {
  const state = { source };

  replaceInjectedConst.call(state, "INJECTED_GEMINI_API_KEY", config.geminiApiKey);
  replaceInjectedConst.call(state, "INJECTED_GEMINI_MODEL", config.geminiModel);
  replaceInjectedConst.call(state, "INJECTED_AI_ENABLED", config.aiEnabledValue);

  for (const name of INJECTED_CONSTS) {
    if (new RegExp(`const\\s+${name}\\s*=\\s*"__FREESCRIBE_`).test(state.source)) {
      throw new Error(`Could not inject ${name}; placeholder remains in compiled background.js.`);
    }
  }

  return state.source;
}

async function main() {
  const config = await readBuildEnv();
  const backgroundPath = "dist/background.js";
  const source = await readFile(backgroundPath, "utf8");
  await writeFile(backgroundPath, injectBackgroundEnv(source, config));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
