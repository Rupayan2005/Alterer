// js/pending-downloads.js
// A download's filename is "determined" before the user has actually
// confirmed anything (e.g. the Save As dialog can still be cancelled), so
// we must not write to history at that point. This module holds the plan
// for each in-flight download and is only consumed once Chrome reports the
// download as actually complete.
//
// Backed by chrome.storage.session (not a plain in-memory object) so a
// download that's still in flight when the MV3 service worker gets
// suspended and restarted isn't silently lost.

const KEY = "sdo_pendingDownloadPlans";

async function readAll() {
  try {
    const stored = await chrome.storage.session.get(KEY);
    return stored[KEY] || {};
  } catch {
    return {};
  }
}

async function writeAll(all) {
  try {
    await chrome.storage.session.set({ [KEY]: all });
  } catch {
    /* ignore — worst case we lose one pending entry, never block a download */
  }
}

/** Record the plan for a download that's in flight (not yet confirmed complete). */
export async function setPendingPlan(downloadId, summary) {
  const all = await readAll();
  all[downloadId] = summary;
  await writeAll(all);
}

/** Retrieve and remove the plan for a download, e.g. once it completes. */
export async function takePendingPlan(downloadId) {
  const all = await readAll();
  const summary = all[downloadId];
  if (summary !== undefined) {
    delete all[downloadId];
    await writeAll(all);
  }
  return summary || null;
}

/** Discard a plan without recording anything, e.g. the download was cancelled/interrupted. */
export async function discardPendingPlan(downloadId) {
  await takePendingPlan(downloadId);
}