// js/parsers/reddit.js
// Extracts a post title / subreddit from reddit.com tab context when available.

export function matches(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname.includes("reddit.com");
  } catch {
    return false;
  }
}

export function parse(url, pageTitle) {
  const u = new URL(url);
  const segments = u.pathname.split("/").filter(Boolean);
  const rIdx = segments.indexOf("r");
  const subreddit = rIdx !== -1 && segments[rIdx + 1] ? segments[rIdx + 1] : "";
  const title = (pageTitle || "")
    .replace(/\s*:\s*r\/\S+\s*$/i, "")
    .replace(/\s*-\s*reddit$/i, "")
    .trim();

  return {
    sourceType: "reddit",
    contentTitle: title,
    subreddit,
  };
}
