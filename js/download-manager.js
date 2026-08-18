// js/download-manager.js
// Orchestrates the full pipeline described in the spec:
//   capture event -> collect metadata -> resolve context -> detect source
//   -> extract context -> rule engine -> sanitize -> duplicate check
//   -> final path -> suggest to Chrome -> (on actual completion) record history -> notify.
//
// Reliability rule: organizing must NEVER prevent a download from
// completing. Every step here is wrapped so that any failure falls back
// to "let Chrome use its default filename" rather than blocking anything.
//
// History is only ever written once Chrome confirms a download actually
// completed (see finalizeDownload, called from background.js's
// chrome.downloads.onChanged listener) — never at the moment the filename
// is merely suggested, since the user can still cancel a Save As dialog.

import {
  getSettings,
  getFolderMap,
  getSiteRules,
  getCustomRules,
  getUsedPaths,
  addUsedPath,
} from "./storage.js";
import { resolveDownloadContext } from "./context-tracker.js";
import { parseSiteContext } from "./parsers/index.js";
import { resolveDestination } from "./rule-engine.js";
import { generateFilename } from "./filename-generator.js";
import { resolveUniqueName, markPathUsed } from "./duplicate-handler.js";
import { joinDownloadPath, sanitizeFilenameBase } from "./sanitization.js";
import { extensionFromFilename, domainFromUrl, baseNameWithoutExtension } from "./utilities.js";
import { addHistoryEntry } from "./history.js";
import { setPendingPlan, takePendingPlan, discardPendingPlan } from "./pending-downloads.js";

/** Build the normalized DownloadContext object described in the spec. */
async function buildDownloadContext(downloadItem) {
  const originalFilename = downloadItem.filename || "";
  const ext = extensionFromFilename(originalFilename);
  const referrer = downloadItem.referrer || "";
  const url = downloadItem.url || downloadItem.finalUrl || "";

  const tabContext = await resolveDownloadContext({
    tabId: downloadItem.tabId,
    referrer,
    url,
  });

  let siteContext;
  if (tabContext) {
    siteContext = {
      sourceType: tabContext.sourceType,
      searchQuery: tabContext.searchQuery,
      repository: tabContext.repository,
      contentTitle: tabContext.contentTitle,
      domain: tabContext.domain,
      pageUrl: tabContext.url,
      pageTitle: tabContext.title,
    };
  } else {
    // No tracked tab — fall back to parsing the download/referrer URL directly.
    const bestUrl = referrer || url;
    siteContext = parseSiteContext(bestUrl, "");
    siteContext.domain = domainFromUrl(bestUrl);
  }

  return {
    downloadId: downloadItem.id,
    originalFilename: originalFilename.split(/[\\/]/).pop(),
    extension: ext,
    mimeType: downloadItem.mime || "",
    url,
    referrer,
    sourceDomain: siteContext.domain || domainFromUrl(url),
    tabId: downloadItem.tabId,
    pageUrl: siteContext.pageUrl || "",
    pageTitle: siteContext.pageTitle || "",
    sourceType: siteContext.sourceType || "generic",
    searchQuery: siteContext.searchQuery || "",
    repository: siteContext.repository || "",
    contentTitle: siteContext.contentTitle || "",
    domain: siteContext.domain || domainFromUrl(url),
    startedAt: Date.now(),
  };
}

/**
 * Compute the full plan for a download without touching Chrome's
 * suggest()/history APIs. Pure(ish) and easy to reason about / unit test.
 */
export async function planDownload(downloadItem) {
  const [settings, folderMap, siteRules, customRules, usedPaths] = await Promise.all([
    getSettings(),
    getFolderMap(),
    getSiteRules(),
    getCustomRules(),
    getUsedPaths(),
  ]);

  const context = await buildDownloadContext(downloadItem);
  const ext = context.extension;

  const destination = resolveDestination({
    siteRules,
    customRules,
    folderMap,
    context,
    ext,
  });

  const originalBase = baseNameWithoutExtension(context.originalFilename);

  let base = sanitizeFilenameBase(originalBase, { maxLength: settings.maxFilenameLength });
  let renamed = false;

  if (destination.renameTemplate) {
    const generated = generateFilename(destination.renameTemplate, context, ext, {
      maxLength: settings.maxFilenameLength,
      filenameStyle: settings.filenameStyle,
    });
    if (generated && generated.base) {
      base = generated.base;
      renamed = true;
    }
  }

  const matched = destination.tier !== "unmatched";
  const folder = matched ? destination.folder : "";

  let finalBase = base;
  let wasDuplicate = false;

  if (matched) {
    const unique = resolveUniqueName({
      folder,
      base,
      ext,
      strategy: settings.duplicateStrategy,
      knownPaths: usedPaths,
    });
    finalBase = unique.base;
    wasDuplicate = unique.wasDuplicate;
  }

  const finalFilename = ext ? `${finalBase}.${ext}` : finalBase;
  const relativePath = matched ? joinDownloadPath(folder, finalFilename) : null;

  return {
    context,
    destination,
    matched,
    renamed,
    wasDuplicate,
    folder,
    finalFilename,
    relativePath, // null means "don't override, leave Chrome's default in root Downloads"
  };
}

/**
 * Entry point called from the chrome.downloads.onDeterminingFilename
 * listener. Always resolves — never throws — and always calls `suggest`.
 * Does NOT write to history: the download may still be cancelled by the
 * user (e.g. a Save As dialog). The plan is stashed and only turned into
 * a history entry by finalizeDownload() once the download truly completes.
 */
export async function handleDeterminingFilename(downloadItem, suggest) {
  try {
    const settings = await getSettings();

    if (!settings.organizerEnabled) {
      suggest(); // organizer off: let Chrome behave normally
      return;
    }

    const plan = await planDownload(downloadItem);

    if (!plan.matched || !plan.relativePath) {
      suggest(); // no rule/folder matched: leave file in root Downloads, untouched
      await setPendingPlan(downloadItem.id, historySummary(plan, false));
      return;
    }

    suggest({ filename: plan.relativePath, conflictAction: "uniquify" });
    markPathUsed(plan.folder, plan.finalFilename);
    addUsedPath(`${plan.folder}/${plan.finalFilename}`.toLowerCase()).catch(() => {});
    await setPendingPlan(downloadItem.id, historySummary(plan, true));
  } catch (err) {
    // Absolute last resort: never block the download.
    try {
      suggest();
    } catch {
      /* ignore */
    }
    console.error("Alterer: failed to plan download, using default filename.", err);
  }
}

/**
 * Called from background.js when chrome.downloads.onChanged reports a
 * download's state as "complete". Turns the stashed plan into a real
 * history entry. If the download never completes (cancelled, interrupted,
 * or the user picked "Save As" and clicked Cancel), this is simply never
 * called for that id and nothing is ever written to history.
 */
export async function finalizeDownload(downloadId) {
  const summary = await takePendingPlan(downloadId);
  if (!summary) return;
  await addHistoryEntry({ ...summary, timestamp: Date.now() });
}

/** Called when a download is interrupted/cancelled — discard without recording. */
export async function discardDownload(downloadId) {
  await discardPendingPlan(downloadId);
}

function historySummary(plan, organized) {
  return {
    id: `hist_${plan.context.downloadId}_${Date.now()}`,
    downloadId: plan.context.downloadId,
    originalFilename: plan.context.originalFilename,
    finalFilename: organized ? plan.finalFilename : plan.context.originalFilename,
    folder: organized ? plan.folder : "",
    sourceType: plan.context.sourceType,
    domain: plan.context.domain,
    ext: plan.context.extension,
    matched: organized,
    renamed: plan.renamed,
    wasDuplicate: plan.wasDuplicate,
  };
}