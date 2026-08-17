// js/parsers/generic.js
// Fallback for any website without a dedicated parser. Never invents
// context that isn't actually present on the page/URL.

export function matches() {
  return true; // always matches; used last, after specific parsers
}

export function parse(url, pageTitle) {
  return {
    sourceType: "generic",
    contentTitle: (pageTitle || "").trim(),
  };
}
