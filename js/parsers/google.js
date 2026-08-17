// js/parsers/google.js
// Extracts a search query from Google Search / Google Images URLs.

export function matches(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname.includes("google.") && u.pathname === "/search";
  } catch {
    return false;
  }
}

export function parse(url, pageTitle) {
  const u = new URL(url);
  const query = u.searchParams.get("q") || "";
  return {
    sourceType: "google",
    searchQuery: query.trim(),
    contentTitle: query.trim() || (pageTitle || "").replace(/\s*-\s*Google Search$/i, ""),
  };
}
