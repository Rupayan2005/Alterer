// js/context-tracker.js
// Keeps a light map of recent tab/navigation state so downloads can be
// associated with the page/context that likely triggered them.
//
// IMPORTANT: MV3 service workers are terminated after a short period of
// inactivity (roughly 30s-5min), which wipes any plain in-memory state.
// A plain JS Map here would silently lose all tracked tabs the moment the
// worker goes idle, causing renaming to "randomly" stop working until the
// next full browser restart. chrome.storage.session persists across those
// worker restarts (while still clearing when the browser itself closes),
// so we mirror the in-memory map to it and rehydrate on first use.

import { domainFromUrl } from "./utilities.js";
import { parseSiteContext } from "./parsers/index.js";

const MAX_RECENT_NAVIGATIONS = 40;
const MAX_TRACKED_TABS = 80;
const SESSION_KEY = "sdo_tabContextSnapshot";

/** tabId -> { tabId, url, title, domain, sourceType, searchQuery, repository, contentTitle, lastNavigation } */
const tabContext = new Map();

/** Rolling list of recent navigations for timing-based fallback matching. */
const recentNavigations = [];

let hydrated = false;
let hydratePromise = null;

async function ensureHydrated() {
  if (hydrated) return;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const stored = await chrome.storage.session.get(SESSION_KEY);
        const snapshot = stored[SESSION_KEY];
        if (Array.isArray(snapshot)) {
          for (const [tabId, entry] of snapshot) {
            tabContext.set(tabId, entry);
          }
        }
      } catch {
        // chrome.storage.session unavailable — safe to continue with an empty map.
      } finally {
        hydrated = true;
      }
    })();
  }
  await hydratePromise;
}

function persist() {
  try {
    chrome.storage.session.set({ [SESSION_KEY]: [...tabContext.entries()] }).catch(() => {});
  } catch {
    /* ignore — never let persistence issues break tracking */
  }
}

function pruneOldTabsIfNeeded() {
  if (tabContext.size <= MAX_TRACKED_TABS) return;
  const entries = [...tabContext.entries()].sort((a, b) => a[1].lastNavigation - b[1].lastNavigation);
  const excess = entries.length - MAX_TRACKED_TABS;
  for (let i = 0; i < excess; i += 1) {
    tabContext.delete(entries[i][0]);
  }
}

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

  pruneOldTabsIfNeeded();
  persist();

  return entry;
}

/** Update tracked context for a tab after navigation completes. */
export async function recordNavigation(tabId, url, title) {
  if (typeof tabId !== "number" || tabId < 0 || !url) return;
  if (!/^https?:/i.test(url)) return; // ignore chrome://, file://, etc.
  await ensureHydrated();
  buildContextForTab(tabId, url, title);
}

/** Update just the title for an already-tracked tab (e.g. after page finishes rendering). */
export async function updateTabTitle(tabId, title) {
  await ensureHydrated();
  const existing = tabContext.get(tabId);
  if (!existing || !title) return;
  const parsed = parseSiteContext(existing.url, title);
  tabContext.set(tabId, { ...existing, title, ...parsed });
  persist();
}

/** Remove a closed tab from tracking. */
export async function forgetTab(tabId) {
  await ensureHydrated();
  if (tabContext.delete(tabId)) persist();
}

/** Look up tracked context for a specific tab id. */
export async function getTabContext(tabId) {
  await ensureHydrated();
  return tabContext.get(tabId) || null;
}

/**
 * Best-effort resolution of the browser context for a download, using the
 * strongest available signal first:
 *   1. Exact tab match on the download's tabId (rarely available, but used if present)
 *   2. A tracked tab whose URL equals the download's referrer
 *   3. A tracked tab on the same domain as the referrer, most recently active
 *   4. A tracked tab on the same domain as the download URL itself
 *   5. The currently active tab, IF its domain matches the referrer/url domain
 *      (covers the case where a worker restart wiped tracking but the page
 *      that triggered the download is still open and focused)
 *   6. null (caller falls back to parsing the referrer/url directly)
 */
export async function resolveDownloadContext({ tabId, referrer, url }) {
  await ensureHydrated();

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

  const targetDomain = domainFromUrl(referrer) || urlDomain;
  if (targetDomain) {
    const activeTab = await getActiveTabIfDomainMatches(targetDomain);
    if (activeTab) return activeTab;
  }

  return null;
}

/** Query the currently focused tab and use it only if its domain matches, to avoid false positives. */
function getActiveTabIfDomainMatches(targetDomain) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (chrome.runtime.lastError || !tabs || !tabs[0] || !tabs[0].url) {
          resolve(null);
          return;
        }
        const tab = tabs[0];
        if (domainFromUrl(tab.url) !== targetDomain) {
          resolve(null);
          return;
        }
        const parsed = parseSiteContext(tab.url, tab.title || "");
        resolve({
          tabId: tab.id,
          url: tab.url,
          title: tab.title || "",
          domain: targetDomain,
          lastNavigation: Date.now(),
          ...parsed,
        });
      });
    } catch {
      resolve(null);
    }
  });
}