// js/parsers/github.js
// Extracts an "owner/repo" repository name from github.com URLs.

export function matches(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname === "github.com" || u.hostname === "codeload.github.com";
  } catch {
    return false;
  }
}

export function parse(url, pageTitle) {
  const u = new URL(url);
  const segments = u.pathname.split("/").filter(Boolean);
  let repository = "";
  if (segments.length >= 2) {
    repository = `${segments[0]}/${segments[1]}`;
  }
  const repoName = segments.length >= 2 ? segments[1] : "";
  return {
    sourceType: "github",
    repository,
    contentTitle: repoName || (pageTitle || "").replace(/\s*[·:].*GitHub.*$/i, ""),
  };
}
