import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });

await Promise.all([
  copyFile("manifest.json", "dist/manifest.json"),
  copyFile("src/sidepanel/sidepanel.html", "dist/sidepanel.html"),
  copyFile("src/sidepanel/sidepanel.css", "dist/sidepanel.css")
]);
