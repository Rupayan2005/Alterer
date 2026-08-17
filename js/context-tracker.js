// js/context-tracker.js
// Keeps a light in-memory map of recent tab/navigation state so downloads
// can be associated with the page/context that likely triggered them.
// The chrome.downloads API does not reliably expose an "initiating tab",
// so this module tracks the strongest signals we *can* get: referrer URL,
// per-tab URL/title, and recent navigation timing.

import { domainFromUrl } from "./utilities.js";
import { parseSiteContext } from "./parsers/index.js";

const MAX_RECENT_NAVIGATIONS = 40;

/** tabId -> { tabId, url, title, domain, sourceType, searchQuery, repository, contentTitle, lastNavigation } */
const tabContext = new Map();

/** Rolling list of recent navigations for timing-based fallback matching. */
const recentNavigations = [];

function buildContextForTab(tabId, url, title) {
  const domain = domainFromUrl(url);
  const parsed = parseSiteContext(url, title);
  const entry = {
    tabId,
    url,
    title: title || "",
    domain,
    lastNavigation: Date.now(),
    ...parsed,
  };
  tabContext.set(tabId, entry);

  recentNavigations.push({ url, domain, timestamp: entry.lastNavigation });
  if (recentNavigations.length > MAX_RECENT_NAVIGATIONS) {
    recentNavigations.shift();
  }

  return entry;
}

/** Update tracked context for a tab after navigation completes. */
export function recordNavigation(tabId, url, title) {
  if (typeof tabId !== "number" || tabId < 0 || !url) return;
  if (!/^https?:/i.test(url)) return; // ignore chrome://, file://, etc.
  buildContextForTab(tabId, url, title);
}

/** Update just the title for an already-tracked tab (e.g. after page finishes rendering). */
export function updateTabTitle(tabId, title) {
  const existing = tabContext.get(tabId);
  if (!existing || !title) return;
  const parsed = parseSiteContext(existing.url, title);
  tabContext.set(tabId, { ...existing, title, ...parsed });
}

/** Remove a closed tab from tracking. */
export function forgetTab(tabId) {
  tabContext.delete(tabId);
}

/** Look up tracked context for a specific tab id. */
export function getTabContext(tabId) {
  return tabContext.get(tabId) || null;
}

/**
 * Best-effort resolution of the browser context for a download, using the
 * strongest available signal first:
 *   1. Exact tab match on the download's tabId (rarely available, but used if present)
 *   2. A tracked tab whose URL equals the download's referrer
 *   3. A tracked tab on the same domain as the referrer, most recently active
 *   4. A tracked tab on the same domain as the download URL itself
 *   5. null (caller falls back to the generic parser using the download URL alone)
 */
export function resolveDownloadContext({ tabId, referrer, url }) {
  if (typeof tabId === "number" && tabContext.has(tabId)) {
    return tabContext.get(tabId);
  }

  if (referrer) {
    for (const ctx of tabContext.values()) {
      if (ctx.url === referrer) return ctx;
    }
    const referrerDomain = domainFromUrl(referrer);
    if (referrerDomain) {
      const candidates = [...tabContext.values()]
        .filter((ctx) => ctx.domain === referrerDomain)
        .sort((a, b) => b.lastNavigation - a.lastNavigation);
      if (candidates.length) return candidates[0];
    }
  }

  const urlDomain = domainFromUrl(url);
  if (urlDomain) {
    const candidates = [...tabContext.values()]
      .filter((ctx) => ctx.domain === urlDomain)
      .sort((a, b) => b.lastNavigation - a.lastNavigation);
    if (candidates.length) return candidates[0];
  }

  return null;
}
