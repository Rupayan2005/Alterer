// js/sanitization.js
// Makes generated filename bases safe to write on Windows/macOS/Linux and
// predictable for the duplicate handler. Never touches the file extension.

const INVALID_CHARS = /[\\/:*?"<>|]/g;
// Control characters and emoji/pictographs are stripped; letters, numbers,
// spaces, and a small set of safe punctuation are kept.
const EMOJI_AND_SYMBOLS =
  /[\u{1F000}-\u{1FFFF}\u{2190}-\u{2BFF}\u{2600}-\u{27BF}\uFE0F]/gu;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

const WINDOWS_RESERVED = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

/**
 * Sanitize a proposed filename *base* (no extension) into something safe
 * to use as a path segment on disk.
 *
 * @param {string} rawBase - the candidate base name (may contain spaces, punctuation, emoji)
 * @param {object} [opts]
 * @param {number} [opts.maxLength=150] - maximum length of the returned base
 * @param {string} [opts.separator="_"] - separator to collapse whitespace/repeated separators into
 * @returns {string} a safe, non-empty base name
 */
export function sanitizeFilenameBase(rawBase, opts = {}) {
  const maxLength = opts.maxLength ?? 150;
  const separator = opts.separator ?? "_";

  let name = String(rawBase ?? "");

  name = name.normalize("NFKC");
  name = name.replace(EMOJI_AND_SYMBOLS, "");
  name = name.replace(CONTROL_CHARS, "");
  name = name.replace(INVALID_CHARS, " ");
  // Strip a few more characters that are legal but messy in filenames.
  name = name.replace(/[!@#$%^&*+=~`{}[\]';,]/g, "");
  // Collapse any whitespace run into a single separator.
  name = name.trim().replace(/\s+/g, separator);
  // Collapse repeated separators/dashes/dots.
  const sepEscaped = separator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  name = name.replace(new RegExp(`${sepEscaped}{2,}`, "g"), separator);
  name = name.replace(/-{2,}/g, "-");
  name = name.replace(/\.{2,}/g, ".");
  // Trim leading/trailing separators and dots (avoid hidden files / trailing dot issues).
  name = name.replace(new RegExp(`^[${sepEscaped}.\\-]+`), "");
  name = name.replace(new RegExp(`[${sepEscaped}.\\-]+$`), "");

  if (!name) name = "file";

  if (WINDOWS_RESERVED.has(name.toLowerCase())) {
    name = `${name}${separator}file`;
  }

  if (name.length > maxLength) {
    name = name.slice(0, maxLength).replace(new RegExp(`[${sepEscaped}.\\-]+$`), "");
    if (!name) name = "file";
  }

  return name;
}

/**
 * Sanitize a folder path made of one or more segments (e.g. "Code/Python").
 * Prevents path traversal and invalid characters in each segment.
 */
export function sanitizeFolderPath(rawPath) {
  if (!rawPath) return "";
  const segments = String(rawPath)
    .split(/[\\/]+/)
    .map((seg) => seg.trim())
    .filter((seg) => seg && seg !== "." && seg !== "..");

  const safeSegments = segments.map((seg) =>
    sanitizeFilenameBase(seg, { maxLength: 60 })
  );

  return safeSegments.join("/");
}

/**
 * Join a sanitized folder path with a sanitized filename into a final
 * Chrome-relative download path (relative to the Downloads root).
 */
export function joinDownloadPath(folderPath, filename) {
  const folder = sanitizeFolderPath(folderPath);
  const safeFilename = filename.replace(INVALID_CHARS, "_");
  return folder ? `${folder}/${safeFilename}` : safeFilename;
}
