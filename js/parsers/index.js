// js/parsers/index.js
// Aggregates all site parsers and picks the most specific one for a URL.

import * as google from "./google.js";
import * as youtube from "./youtube.js";
import * as github from "./github.js";
import * as leetcode from "./leetcode.js";
import * as reddit from "./reddit.js";
import * as generic from "./generic.js";

// Order matters: more specific parsers are checked first, generic is last.
const PARSERS = [google, youtube, github, leetcode, reddit, generic];

/**
 * Parse a URL + page title into normalized context using the first matching
 * site parser. Always returns at least { sourceType: 'generic' }.
 */
export function parseSiteContext(url, pageTitle) {
  if (!url) return { sourceType: "generic", contentTitle: pageTitle || "" };
  for (const parser of PARSERS) {
    try {
      if (parser.matches(url)) {
        return parser.parse(url, pageTitle);
      }
    } catch {
      // A malformed URL or unexpected shape should never break the pipeline.
      continue;
    }
  }
  return { sourceType: "generic", contentTitle: pageTitle || "" };
}
