// js/stats.js
// All statistics are computed on demand from the (bounded) history log
// rather than maintained as separate counters, so they can never drift
// out of sync with what's actually recorded.

import { startOfDay, daysAgo, topLevelFolder } from "./utilities.js";

export function computeStats(history) {
  const todayStart = startOfDay();
  const weekStart = daysAgo(7);

  const stats = {
    totalOrganized: history.length,
    today: 0,
    thisWeek: 0,
    byCategory: {},
    bySource: {},
  };

  for (const entry of history) {
    if (entry.timestamp >= todayStart) stats.today += 1;
    if (entry.timestamp >= weekStart) stats.thisWeek += 1;

    const category = entry.folder ? topLevelFolder(entry.folder) : "Root";
    stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;

    const source = entry.sourceType && entry.sourceType !== "generic" ? entry.sourceType : entry.domain || "other";
    stats.bySource[source] = (stats.bySource[source] || 0) + 1;
  }

  stats.topCategories = Object.entries(stats.byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  stats.topSources = Object.entries(stats.bySource)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return stats;
}
