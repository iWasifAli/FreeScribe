export const GEMINI_HOST_PERMISSION = "https://generativelanguage.googleapis.com/*";

export function buildExtensionManifest(baseManifest, config) {
  const manifest = structuredClone(baseManifest);
  const hostPermissions = Array.isArray(manifest.host_permissions)
    ? manifest.host_permissions.filter((permission) => permission !== GEMINI_HOST_PERMISSION)
    : [];

  if (config.geminiConfigured) {
    hostPermissions.push(GEMINI_HOST_PERMISSION);
  }

  manifest.host_permissions = hostPermissions;
  return manifest;
}
