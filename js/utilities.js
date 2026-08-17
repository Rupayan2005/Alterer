// js/utilities.js
// Small, dependency-free helper functions shared across the extension.

/** Generate a short unique id (not cryptographically strong, just unique enough for local rules/history). */
export function generateId(prefix = "id") {
  const rand = Math.random().toString(36).slice(2, 9);
  const time = Date.now().toString(36);
  return `${prefix}_${time}_${rand}`;
}

/** Extract a lowercase hostname (no "www.") from a URL string. Returns "" on failure. */
export function domainFromUrl(url) {
  if (!url) return "";
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return "";
  }
}

/** Extract the lowercase file extension (no dot) from a filename. Returns "" if none. */
export function extensionFromFilename(filename) {
  if (!filename) return "";
  const base = filename.split(/[\\/]/).pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/** Strip the extension from a filename, returning the base name only. */
export function baseNameWithoutExtension(filename) {
  if (!filename) return "";
  const base = filename.split(/[\\/]/).pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return base;
  return base.slice(0, dot);
}

/** Clamp a number between min and max. */
export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/** Format a timestamp (ms) as a short relative time string, e.g. "Just now", "5 min ago". */
export function formatRelativeTime(timestamp) {
  const diffMs = Date.now() - timestamp;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 10) return "Just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Return the start-of-day timestamp (local time) for a given timestamp. */
export function startOfDay(timestamp = Date.now()) {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Return a timestamp N days before the given timestamp's start of day. */
export function daysAgo(n, from = Date.now()) {
  return startOfDay(from) - n * 24 * 60 * 60 * 1000;
}

/** Simple debounce helper. */
export function debounce(fn, waitMs) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

/** The top-level folder segment of a relative path, e.g. "Code/Python/" -> "Code". */
export function topLevelFolder(folderPath) {
  if (!folderPath) return "Root";
  const clean = folderPath.replace(/^\/+|\/+$/g, "");
  if (!clean) return "Root";
  return clean.split("/")[0];
}

/** A small emoji/icon glyph representative of a file category, used in UI lists. */
export function categoryGlyph(folderPath, ext) {
  const top = topLevelFolder(folderPath).toLowerCase();
  if (top.includes("image")) return "\u{1F5BC}"; // 🖼
  if (top.includes("pdf")) return "\u{1F4C4}"; // 📄
  if (top.includes("video")) return "\u{1F3AC}"; // 🎬
  if (top.includes("music") || top.includes("audio")) return "\u{1F3B5}"; // 🎵
  if (top.includes("archive")) return "\u{1F4E6}"; // 📦
  if (top.includes("code")) return "\u{1F4BB}"; // 💻
  if (top.includes("github")) return "\u{1F419}"; // 🐙
  if (top.includes("leetcode")) return "\u{1F9E9}"; // 🧩
  if (top.includes("reddit")) return "\u{1F4AC}"; // 💬
  if (top.includes("document")) return "\u{1F4D1}"; // 📑
  if (["doc", "docx"].includes(ext)) return "\u{1F4D1}";
  return "\u{1F4C1}"; // 📁
}
