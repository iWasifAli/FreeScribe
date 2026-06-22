import { mkdir, readFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));

if (packageJson.version !== manifest.version) {
  throw new Error(`Version mismatch: package.json has ${packageJson.version}, manifest.json has ${manifest.version}`);
}

const artifactName = `freescribe-v${packageJson.version}.zip`;
const artifactPath = `../release/${artifactName}`;

await mkdir("release", { recursive: true });
await rm(`release/${artifactName}`, { force: true });

try {
  await execFileAsync("zip", ["-r", artifactPath, "."], { cwd: "dist" });
} catch (error) {
  if (process.platform !== "win32" || error?.code !== "ENOENT") {
    throw error;
  }

  await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "$ErrorActionPreference = 'Stop'; Compress-Archive -Path * -DestinationPath $env:FREESCRIBE_ARTIFACT_PATH -Force"
    ],
    {
      cwd: "dist",
      env: {
        ...process.env,
        FREESCRIBE_ARTIFACT_PATH: artifactPath
      }
    }
  );
}

console.log(`Created release/${artifactName}`);
