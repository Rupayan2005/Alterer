// js/folder-manager.js
// Resolves the destination folder for a download. Folders are never created
// proactively — Chrome creates the relative directory automatically the
// first time a file actually lands there, which keeps the Downloads root
// clean until it's actually needed.

import { sanitizeFolderPath } from "./sanitization.js";

/**
 * Look up the default folder for a file extension from the folder map.
 * Returns "" (root Downloads) if the extension is unmapped.
 */
export function folderForExtension(folderMap, ext) {
  if (!ext) return "";
  const folder = folderMap[ext.toLowerCase()];
  return folder ? sanitizeFolderPath(folder) : "";
}

/** Sanitize an arbitrary folder string coming from a rule action. */
export function normalizeFolder(folder) {
  return sanitizeFolderPath(folder || "");
}
