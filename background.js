// background.js
// Manifest V3 service worker. Keeps listeners lightweight and event-driven
// (no polling, no content scripts, no network calls) per the performance
// requirements in the spec.

import { recordNavigation, updateTabTitle, forgetTab } from "./js/context-tracker.js";
import { handleDeterminingFilename } from "./js/download-manager.js";
import { getSettings } from "./js/storage.js";

// ---------------------------------------------------------------------------
// Context tracking: keep tab URL/title fresh so downloads can be associated
// with the page that likely triggered them.
// ---------------------------------------------------------------------------

chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId !== 0) return; // main frame only
  chrome.tabs.get(details.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    recordNavigation(details.tabId, tab.url, tab.title);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.title) {
    updateTabTitle(tabId, changeInfo.title);
  } else if (changeInfo.url && tab.url) {
    recordNavigation(tabId, tab.url, tab.title);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => forgetTab(tabId));

// ---------------------------------------------------------------------------
// The core pipeline: suggest a relative filename/path while Chrome is
// determining where a download should go.
// ---------------------------------------------------------------------------

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  handleDeterminingFilename(downloadItem, suggest);
  return true; // keep the channel open for the async suggest() call
});

// ---------------------------------------------------------------------------
// Notifications: one per download normally, collapsed into a single rolling
// summary if downloads are arriving quickly (avoids spamming the user).
// ---------------------------------------------------------------------------

const NOTIF_ID = "Alterer-summary";
let burstCount = 0;
let burstTimer = null;
const BURST_WINDOW_MS = 12000;
const BURST_THRESHOLD = 3;

async function notifyOrganized(filename, folder) {
  const settings = await getSettings();
  if (!settings.notificationsEnabled) return;

  burstCount += 1;
  if (burstTimer) clearTimeout(burstTimer);
  burstTimer = setTimeout(() => {
    burstCount = 0;
  }, BURST_WINDOW_MS);

  if (burstCount <= BURST_THRESHOLD) {
    chrome.notifications.create(`Alterer-${Date.now()}`, {
      type: "basic",
      iconUrl: "assets/icons/icon128.png",
      title: "Download organized",
      message: `${filename}\nSaved to Downloads/${folder}/`,
      priority: 0,
    });
  } else {
    chrome.notifications.create(NOTIF_ID, {
      type: "basic",
      iconUrl: "assets/icons/icon128.png",
      title: "Alterer",
      message: `Organized ${burstCount} downloads so far`,
      priority: 0,
    });
  }
}

// Fire a lightweight notification once a download actually completes, so we
// only notify for downloads that really landed (not cancelled/interrupted).
chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.state || delta.state.current !== "complete") return;
  chrome.downloads.search({ id: delta.id }, async ([item]) => {
    if (!item) return;
    const settings = await getSettings();
    if (!settings.organizerEnabled) return;
    // Only notify when the file actually ended up in a subfolder (i.e. we organized it).
    const relPath = (item.filename || "").replace(/\\/g, "/");
    const parts = relPath.split("/");
    if (parts.length < 2) return; // sits in root Downloads, nothing to announce
    const name = parts[parts.length - 1];
    const folderGuess = parts[parts.length - 2];
    notifyOrganized(name, folderGuess);
  });
});

// ---------------------------------------------------------------------------
// Install/update bookkeeping.
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("Alterer installed. Everything runs locally — no data leaves your browser.");
  }
});
