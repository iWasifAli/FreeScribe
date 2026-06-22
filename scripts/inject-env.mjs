import { readFile, writeFile } from "node:fs/promises";
import { readBuildEnv } from "./env-utils.mjs";

const config = await readBuildEnv();
const backgroundPath = "dist/background.js";
let source = await readFile(backgroundPath, "utf8");

function replaceInjectedConst(name, value) {
  const pattern = new RegExp(`const ${name} = "[^"]*";`);
  source = source.replace(pattern, `const ${name} = ${JSON.stringify(value)};`);
}

replaceInjectedConst("INJECTED_GEMINI_API_KEY", config.geminiApiKey);
replaceInjectedConst("INJECTED_GEMINI_MODEL", config.geminiModel);
replaceInjectedConst("INJECTED_AI_ENABLED", config.aiEnabledValue);

await writeFile(backgroundPath, source);
