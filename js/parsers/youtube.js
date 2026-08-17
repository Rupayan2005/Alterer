// js/parsers/youtube.js
// Extracts a video title from a YouTube tab, when reliably available.

export function matches(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname.includes("youtube.com") || u.hostname === "youtu.be";
  } catch {
    return false;
  }
}

export function parse(url, pageTitle) {
  const title = (pageTitle || "").replace(/\s*-\s*YouTube$/i, "").trim();
  return {
    sourceType: "youtube",
    contentTitle: title,
  };
}
