import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { readBuildEnv } from "./env-utils.mjs";

const GEMINI_HOST_PERMISSION = "https://generativelanguage.googleapis.com/*";

await mkdir("dist", { recursive: true });
await mkdir("dist/icons", { recursive: true });

async function writeManifest() {
  const config = await readBuildEnv();
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
  const hostPermissions = Array.isArray(manifest.host_permissions)
    ? manifest.host_permissions.filter((permission) => permission !== GEMINI_HOST_PERMISSION)
    : [];

  if (config.geminiConfigured) {
    hostPermissions.push(GEMINI_HOST_PERMISSION);
  }

  manifest.host_permissions = hostPermissions;
  await writeFile("dist/manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
}

await Promise.all([
  copyFile("src/sidepanel/sidepanel.html", "dist/sidepanel.html"),
  copyFile("src/sidepanel/sidepanel.css", "dist/sidepanel.css"),
  copyFile("assets/icons/icon-16.png", "dist/icons/icon-16.png"),
  copyFile("assets/icons/icon-32.png", "dist/icons/icon-32.png"),
  copyFile("assets/icons/icon-48.png", "dist/icons/icon-48.png"),
  copyFile("assets/icons/icon-128.png", "dist/icons/icon-128.png")
]);

await writeManifest();
