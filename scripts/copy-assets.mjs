import { copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { readBuildEnv } from "./env-utils.mjs";
import { buildExtensionManifest } from "./manifest-utils.mjs";

await mkdir("dist", { recursive: true });
await mkdir("dist/icons", { recursive: true });
await mkdir("dist/vendor/fontawesome/css", { recursive: true });

async function writeManifest() {
  const config = await readBuildEnv();
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
  await writeFile("dist/manifest.json", `${JSON.stringify(buildExtensionManifest(manifest, config), null, 2)}\n`);
}

await Promise.all([
  copyFile("src/sidepanel/sidepanel.html", "dist/sidepanel.html"),
  copyFile("src/sidepanel/sidepanel.css", "dist/sidepanel.css"),
  copyFile("node_modules/@fortawesome/fontawesome-free/css/all.min.css", "dist/vendor/fontawesome/css/all.min.css"),
  cp("node_modules/@fortawesome/fontawesome-free/webfonts", "dist/vendor/fontawesome/webfonts", { recursive: true }),
  copyFile("assets/icons/icon-16.png", "dist/icons/icon-16.png"),
  copyFile("assets/icons/icon-32.png", "dist/icons/icon-32.png"),
  copyFile("assets/icons/icon-48.png", "dist/icons/icon-48.png"),
  copyFile("assets/icons/icon-128.png", "dist/icons/icon-128.png")
]);

await writeManifest();
