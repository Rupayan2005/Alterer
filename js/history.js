// js/history.js
// Records what happened to each download so the popup/options pages can
// show recent activity, search, and statistics. Bounded to settings.maxHistoryItems.

import { getHistory, setHistory, getSettings } from "./storage.js";

/**
 * @typedef {object} HistoryEntry
 * @property {string} id
 * @property {number} downloadId
 * @property {string} originalFilename
 * @property {string} finalFilename
 * @property {string} folder - relative folder, "" for root
 * @property {string} sourceType
 * @property {string} domain
 * @property {string} ext
 * @property {boolean} matched - whether any rule/folder-map applied
 * @property {boolean} wasDuplicate
 * @property {number} timestamp
 */

export async function addHistoryEntry(entry) {
  const settings = await getSettings();
  const history = await getHistory();
  history.unshift(entry);
  const trimmed =
    history.length > settings.maxHistoryItems
      ? history.slice(0, settings.maxHistoryItems)
      : history;
  await setHistory(trimmed);
  return trimmed;
}

export async function clearHistory() {
  await setHistory([]);
}

/** Filter history entries by a simple query string + category/time filters, for the History page. */
export function filterHistory(history, { search = "", category = "all", timeframe = "all" } = {}) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  return history.filter((entry) => {
    if (search) {
      const haystack = `${entry.finalFilename} ${entry.originalFilename} ${entry.folder} ${entry.sourceType}`.toLowerCase();
      if (!haystack.includes(search.toLowerCase())) return false;
    }

    if (category !== "all") {
      const top = (entry.folder || "").split("/")[0].toLowerCase();
      if (category === "website") {
        if (!entry.sourceType || entry.sourceType === "generic") return false;
      } else if (top !== category.toLowerCase()) {
        return false;
      }
    }

    if (timeframe !== "all") {
      const diff = now - entry.timestamp;
      if (timeframe === "today" && diff > dayMs) return false;
      if (timeframe === "week" && diff > 7 * dayMs) return false;
      if (timeframe === "month" && diff > 30 * dayMs) return false;
    }

    return true;
  });
}
