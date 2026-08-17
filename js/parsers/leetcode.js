// js/parsers/leetcode.js
// Extracts a problem title from leetcode.com URLs/tab titles when available.

export function matches(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname.includes("leetcode.com");
  } catch {
    return false;
  }
}

export function parse(url, pageTitle) {
  const u = new URL(url);
  const segments = u.pathname.split("/").filter(Boolean);
  const problemsIdx = segments.indexOf("problems");
  let title = "";

  if (problemsIdx !== -1 && segments[problemsIdx + 1]) {
    // Slug like "two-sum" -> "Two Sum"
    title = segments[problemsIdx + 1]
      .split("-")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
  } else if (pageTitle) {
    title = pageTitle.replace(/\s*-\s*LeetCode$/i, "").trim();
  }

  return {
    sourceType: "leetcode",
    contentTitle: title,
  };
}
