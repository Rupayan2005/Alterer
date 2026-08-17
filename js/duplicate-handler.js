// js/duplicate-handler.js
// Decides whether a proposed "folder/base.ext" path collides with one we've
// already assigned (this session or previously), and produces a unique
// name according to the user's chosen duplicateStrategy. Chrome's own
// conflictAction: "uniquify" is layered on top as a final safety net for
// collisions with files we don't know about (e.g. not downloaded via us).

// In-memory set covering the current service-worker lifetime. This is the
// primary defense against rapid-fire duplicate downloads racing each other,
// since chrome.storage writes are async and could otherwise interleave.
const sessionPaths = new Set();

function pathKey(folder, filename) {
  return `${folder}/${filename}`.replace(/^\/+/, "").toLowerCase();
}

/** Mark a path as used for the remainder of this service worker's lifetime. */
export function markPathUsed(folder, filename) {
  sessionPaths.add(pathKey(folder, filename));
}

/**
 * @param {object} params
 * @param {string} params.folder - sanitized folder path (may be "")
 * @param {string} params.base - sanitized filename base (no extension)
 * @param {string} params.ext - lowercase extension (no dot)
 * @param {"paren"|"underscore"|"keep-original"|"overwrite"} params.strategy
 * @param {string[]} params.knownPaths - persisted "folder/filename" strings, lowercase
 * @returns {{ base: string, filename: string, wasDuplicate: boolean }}
 */
export function resolveUniqueName({ folder, base, ext, strategy, knownPaths = [] }) {
  const known = new Set(knownPaths.map((p) => p.toLowerCase()));
  const extSuffix = ext ? `.${ext}` : "";

  const exists = (candidateBase) => {
    const key = pathKey(folder, `${candidateBase}${extSuffix}`);
    return sessionPaths.has(key) || known.has(key);
  };

  if (!exists(base) || strategy === "overwrite") {
    return { base, filename: `${base}${extSuffix}`, wasDuplicate: false };
  }

  if (strategy === "keep-original") {
    // Let Chrome's own uniquify handle it silently; we don't rename further.
    return { base, filename: `${base}${extSuffix}`, wasDuplicate: true };
  }

  let index = 1;
  let candidate;
  do {
    candidate =
      strategy === "underscore" ? `${base}_${index}` : `${base} (${index})`;
    index += 1;
  } while (exists(candidate) && index < 10000);

  return { base: candidate, filename: `${candidate}${extSuffix}`, wasDuplicate: true };
}
