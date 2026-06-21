import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await mkdir("dist/icons", { recursive: true });

await Promise.all([
  copyFile("manifest.json", "dist/manifest.json"),
  copyFile("src/sidepanel/sidepanel.html", "dist/sidepanel.html"),
  copyFile("src/sidepanel/sidepanel.css", "dist/sidepanel.css"),
  copyFile("assets/icons/icon-16.png", "dist/icons/icon-16.png"),
  copyFile("assets/icons/icon-32.png", "dist/icons/icon-32.png"),
  copyFile("assets/icons/icon-48.png", "dist/icons/icon-48.png"),
  copyFile("assets/icons/icon-128.png", "dist/icons/icon-128.png")
]);
