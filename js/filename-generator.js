// js/filename-generator.js
// Expands a rename template (e.g. "{query}.{ext}") into a concrete,
// sanitized filename base using the resolved DownloadContext.

import { sanitizeFilenameBase } from "./sanitization.js";
import { baseNameWithoutExtension } from "./utilities.js";

/**
 * Resolve a single {token} against a context. Returns "" if unavailable —
 * callers should treat an all-empty result as "fall back to original name".
 */
function resolveToken(token, context, ext) {
  switch (token) {
    case "query":
      return context.searchQuery || "";
    case "title":
      return context.contentTitle || "";
    case "domain":
      return context.domain || "";
    case "date":
      return new Date(context.startedAt || Date.now())
        .toISOString()
        .slice(0, 10); // YYYY-MM-DD
    case "repository": {
      const repo = context.repository || "";
      // Use only the repo name (not "owner/repo") as a filename component.
      return repo.includes("/") ? repo.split("/").pop() : repo;
    }
    case "original":
      return baseNameWithoutExtension(context.originalFilename || "");
    case "ext":
      return ext || "";
    default:
      return "";
  }
}

/**
 * Expand a template string against a context. Returns null when the
 * template references tokens that all resolved empty (nothing useful to
 * rename with), so the caller can fall back to the original filename.
 *
 * @param {string} template - e.g. "{query}.{ext}"
 * @param {object} context - normalized DownloadContext
 * @param {string} ext - lowercase extension without the dot
 * @param {object} [opts]
 * @param {number} [opts.maxLength]
 * @param {"preserve"|"lowercase"} [opts.filenameStyle]
 * @returns {{ base: string, ext: string } | null}
 */
export function generateFilename(template, context, ext, opts = {}) {
  if (!template) return null;

  const tokenPattern = /\{(\w+)\}/g;
  let matchedAnyMeaningfulToken = false;
  let hadMeaningfulToken = false;

  let expanded = template.replace(tokenPattern, (_, token) => {
    if (token !== "ext") hadMeaningfulToken = true;
    const value = resolveToken(token, context, ext);
    if (value && token !== "ext") matchedAnyMeaningfulToken = true;
    return value;
  });

  // If the template had a meaningful (non-{ext}) token and none of them
  // resolved to anything, there's nothing useful to rename with.
  if (hadMeaningfulToken && !matchedAnyMeaningfulToken) return null;

  // Split off the extension portion (everything after the final dot) so we
  // sanitize only the base name.
  const dotIdx = expanded.lastIndexOf(".");
  let base = dotIdx > 0 ? expanded.slice(0, dotIdx) : expanded;
  const trailingExt = dotIdx > 0 ? expanded.slice(dotIdx + 1) : ext;

  if (opts.filenameStyle === "lowercase") base = base.toLowerCase();

  const safeBase = sanitizeFilenameBase(base, { maxLength: opts.maxLength });
  if (!safeBase) return null;

  return { base: safeBase, ext: (trailingExt || ext || "").toLowerCase() };
}
