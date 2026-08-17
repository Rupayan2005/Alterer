// options.js
import {
  getSettings,
  setSettings,
  getFolderMap,
  setFolderMap,
  getSiteRules,
  setSiteRules,
  getCustomRules,
  setCustomRules,
  getHistory,
  DEFAULT_FOLDER_MAP,
  DEFAULT_SITE_RULES,
} from "./js/storage.js";
import { clearHistory as clearHistoryEntries, filterHistory } from "./js/history.js";
import { computeStats } from "./js/stats.js";
import { generateId, formatRelativeTime, categoryGlyph, startOfDay } from "./js/utilities.js";

const html = document.documentElement;

// --------------------------------------------------------------------------
// State
// --------------------------------------------------------------------------

let state = {
  settings: null,
  folderMap: null,
  siteRules: null,
  customRules: null,
  history: null,
};

let historyFilters = { search: "", timeframe: "all", category: "all" };
let editingRule = null; // { rule, isCustom } | null when adding new

// --------------------------------------------------------------------------
// Toast
// --------------------------------------------------------------------------

let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2200);
}

// --------------------------------------------------------------------------
// Navigation
// --------------------------------------------------------------------------

const SECTIONS = ["overview", "rules", "folders", "history", "settings"];

function goToSection(section) {
  if (!SECTIONS.includes(section)) section = "overview";
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.hidden = panel.id !== `panel-${section}`;
  });
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.section === section);
  });
  window.location.hash = section;
  document.getElementById("content").scrollTop = 0;
}

document.getElementById("sidebar-nav").addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-tab");
  if (!btn) return;
  goToSection(btn.dataset.section);
});

window.addEventListener("hashchange", () => {
  goToSection(window.location.hash.replace("#", ""));
});

// --------------------------------------------------------------------------
// Power toggle (sidebar)
// --------------------------------------------------------------------------

function setPowerUI(enabled) {
  const toggle = document.getElementById("power-toggle");
  const checkbox = document.getElementById("power-checkbox");
  const label = document.getElementById("power-label");
  checkbox.checked = enabled;
  label.textContent = enabled ? "Organizer On" : "Organizer Off";
  toggle.toggleAttribute("data-off", !enabled);

  const settingEnabled = document.getElementById("setting-enabled");
  if (settingEnabled) settingEnabled.checked = enabled;
}

document.getElementById("power-toggle").addEventListener("click", async (e) => {
  e.preventDefault();
  const next = !document.getElementById("power-checkbox").checked;
  setPowerUI(next);
  state.settings = await setSettings({ organizerEnabled: next });
  showToast(next ? "Organizer turned on" : "Organizer turned off");
});

// --------------------------------------------------------------------------
// Load everything
// --------------------------------------------------------------------------

async function loadAll() {
  const [settings, folderMap, siteRules, customRules, history] = await Promise.all([
    getSettings(),
    getFolderMap(),
    getSiteRules(),
    getCustomRules(),
    getHistory(),
  ]);
  state = { settings, folderMap, siteRules, customRules, history };

  html.setAttribute("data-theme", settings.theme || "system");
  setPowerUI(settings.organizerEnabled);

  renderOverview();
  renderRules();
  renderFolderMap();
  renderHistory();
  renderSettingsForm();
}

// --------------------------------------------------------------------------
// Overview
// --------------------------------------------------------------------------

function renderOverview() {
  const stats = computeStats(state.history);

  document.getElementById("stat-row").innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${stats.today}</div>
      <div class="stat-label">Organized today</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.thisWeek}</div>
      <div class="stat-label">Organized this week</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${stats.totalOrganized}</div>
      <div class="stat-label">Total organized</div>
    </div>
  `;

  const catWrap = document.getElementById("category-bars");
  if (!stats.topCategories.length) {
    catWrap.innerHTML = `<div class="empty-state"><div class="glyph">&#128202;</div><div class="title">No data yet</div><div class="hint">Categories will appear once downloads are organized.</div></div>`;
  } else {
    const max = stats.topCategories[0][1] || 1;
    catWrap.innerHTML = stats.topCategories
      .map(([label, count]) => {
        const pct = Math.max(6, Math.round((count / max) * 100));
        return `
          <div class="bar-row">
            <span class="bar-label">${escapeHtml(label)}</span>
            <span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span>
            <span class="mono">${count}</span>
          </div>`;
      })
      .join("");
  }

  const srcWrap = document.getElementById("source-list");
  if (!stats.topSources.length) {
    srcWrap.innerHTML = `<div class="empty-state"><div class="glyph">&#127760;</div><div class="title">No sources yet</div><div class="hint">Top websites you download from will show up here.</div></div>`;
  } else {
    srcWrap.innerHTML = stats.topSources
      .map(([label, count]) => `
        <div class="source-row">
          <span>${escapeHtml(sourceDisplayName(label))}</span>
          <span class="count">${count}</span>
        </div>`)
      .join("");
  }
}

function sourceDisplayName(key) {
  const names = { google: "Google Images", youtube: "YouTube", github: "GitHub", leetcode: "LeetCode", reddit: "Reddit", other: "Other" };
  return names[key] || key;
}

// --------------------------------------------------------------------------
// Rules
// --------------------------------------------------------------------------

function ruleSummary(rule) {
  const c = rule.conditions || {};
  const a = rule.actions || {};
  const when = [];
  if (c.sourceType && c.sourceType !== "any") when.push(sourceDisplayName(c.sourceType));
  if (c.domain) when.push(c.domain);
  if (c.extensions && c.extensions.length) when.push(c.extensions.join("/"));
  const whenText = when.length ? when.join(" + ") : "Any download";
  const renameText = a.renameTemplate ? `rename \u2192 ${a.renameTemplate}` : "keep name";
  const folderText = a.folder ? `${a.folder}/` : "Downloads/";
  return `${whenText}  \u2192  ${renameText}, save to ${folderText}`;
}

function renderRules() {
  const siteWrap = document.getElementById("site-rules-list");
  const customWrap = document.getElementById("custom-rules-list");

  siteWrap.innerHTML = "";
  state.siteRules.forEach((rule) => siteWrap.appendChild(ruleRow(rule, false)));

  if (!state.customRules.length) {
    customWrap.innerHTML = `<div class="empty-state"><div class="glyph">&#9995;</div><div class="title">No custom rules yet</div><div class="hint">Add a rule to control exactly how a website or file type gets organized.</div></div>`;
  } else {
    customWrap.innerHTML = "";
    state.customRules.forEach((rule) => customWrap.appendChild(ruleRow(rule, true)));
  }
}

function ruleRow(rule, isCustom) {
  const row = document.createElement("div");
  row.className = `rule-row${rule.enabled ? "" : " is-disabled"}`;

  const info = document.createElement("div");
  info.className = "rule-info";
  info.innerHTML = `
    <div class="rule-name">${escapeHtml(rule.name || "Untitled rule")}</div>
    <div class="rule-summary">${escapeHtml(ruleSummary(rule))}</div>
  `;

  const actions = document.createElement("div");
  actions.className = "rule-actions";

  const toggleLabel = document.createElement("span");
  toggleLabel.className = "switch";
  toggleLabel.innerHTML = `<input type="checkbox" ${rule.enabled ? "checked" : ""}/><span class="switch-track"></span>`;
  toggleLabel.querySelector("input").addEventListener("change", async (e) => {
    await toggleRule(rule.id, isCustom, e.target.checked);
  });

  const editBtn = document.createElement("button");
  editBtn.className = "btn btn--sm";
  editBtn.type = "button";
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", () => openRuleModal(rule, isCustom));

  actions.appendChild(toggleLabel);
  actions.appendChild(editBtn);

  if (isCustom) {
    const delBtn = document.createElement("button");
    delBtn.className = "btn btn--sm btn--danger";
    delBtn.type = "button";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => deleteCustomRule(rule.id));
    actions.appendChild(delBtn);
  }

  row.appendChild(info);
  row.appendChild(actions);
  return row;
}

async function toggleRule(id, isCustom, enabled) {
  if (isCustom) {
    state.customRules = state.customRules.map((r) => (r.id === id ? { ...r, enabled } : r));
    await setCustomRules(state.customRules);
  } else {
    state.siteRules = state.siteRules.map((r) => (r.id === id ? { ...r, enabled } : r));
    await setSiteRules(state.siteRules);
  }
  renderRules();
  showToast(enabled ? "Rule enabled" : "Rule disabled");
}

async function deleteCustomRule(id) {
  if (!confirm("Delete this rule? This can't be undone.")) return;
  state.customRules = state.customRules.filter((r) => r.id !== id);
  await setCustomRules(state.customRules);
  renderRules();
  showToast("Rule deleted");
}

// ---- Rule modal ----

const renameOptionForTemplate = {
  "": "keep",
  "{query}.{ext}": "query",
  "{title}.{ext}": "title",
  "{repository}.{ext}": "repository",
  "{domain}_{date}.{ext}": "domain-date",
  "{original}.{ext}": "original",
};
const templateForRenameOption = {
  keep: "",
  query: "{query}.{ext}",
  title: "{title}.{ext}",
  repository: "{repository}.{ext}",
  "domain-date": "{domain}_{date}.{ext}",
  original: "{original}.{ext}",
};

function openRuleModal(rule, isCustom) {
  editingRule = rule ? { rule, isCustom } : null;
  const overlay = document.getElementById("rule-modal-overlay");
  document.getElementById("rule-modal-title").textContent = rule ? "Edit Rule" : "New Rule";

  const c = (rule && rule.conditions) || {};
  const a = (rule && rule.actions) || {};

  document.getElementById("rule-source").value = c.sourceType || "any";
  document.getElementById("rule-domain").value = c.domain || "";
  document.getElementById("rule-extensions").value = (c.extensions || []).join(", ");
  document.getElementById("rule-name").value = (rule && rule.name) || "";
  document.getElementById("rule-folder").value = a.folder || "";

  const knownOption = renameOptionForTemplate[a.renameTemplate || ""];
  const renameSelect = document.getElementById("rule-rename");
  const templateWrap = document.getElementById("rule-template-wrap");
  const templateInput = document.getElementById("rule-template");

  if (a.renameTemplate && !knownOption) {
    renameSelect.value = "custom";
    templateInput.value = a.renameTemplate;
    templateWrap.hidden = false;
  } else {
    renameSelect.value = knownOption || "keep";
    templateInput.value = "";
    templateWrap.hidden = true;
  }

  overlay.hidden = false;
  document.getElementById("rule-name").focus();
}

function closeRuleModal() {
  document.getElementById("rule-modal-overlay").hidden = true;
  editingRule = null;
}

document.getElementById("btn-add-rule").addEventListener("click", () => openRuleModal(null, true));
document.getElementById("rule-modal-close").addEventListener("click", closeRuleModal);
document.getElementById("rule-cancel").addEventListener("click", closeRuleModal);
document.getElementById("rule-modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "rule-modal-overlay") closeRuleModal();
});

document.getElementById("rule-rename").addEventListener("change", (e) => {
  document.getElementById("rule-template-wrap").hidden = e.target.value !== "custom";
});

document.getElementById("rule-save").addEventListener("click", async () => {
  const name = document.getElementById("rule-name").value.trim();
  const folder = document.getElementById("rule-folder").value.trim();
  if (!folder) {
    showToast("Please choose a destination folder");
    return;
  }

  const sourceType = document.getElementById("rule-source").value;
  const domain = document.getElementById("rule-domain").value.trim() || null;
  const extensionsRaw = document.getElementById("rule-extensions").value.trim();
  const extensions = extensionsRaw
    ? extensionsRaw.split(",").map((s) => s.trim().replace(/^\./, "").toLowerCase()).filter(Boolean)
    : null;

  const renameOption = document.getElementById("rule-rename").value;
  const renameTemplate =
    renameOption === "custom"
      ? document.getElementById("rule-template").value.trim() || null
      : templateForRenameOption[renameOption] || null;

  const payload = {
    name: name || folder,
    enabled: true,
    conditions: { sourceType: sourceType === "any" ? "any" : sourceType, domain, extensions },
    actions: { renameTemplate, folder },
  };

  if (editingRule) {
    const { rule, isCustom } = editingRule;
    const updated = { ...rule, ...payload, isSystem: rule.isSystem, id: rule.id };
    if (isCustom) {
      state.customRules = state.customRules.map((r) => (r.id === rule.id ? updated : r));
      await setCustomRules(state.customRules);
    } else {
      state.siteRules = state.siteRules.map((r) => (r.id === rule.id ? updated : r));
      await setSiteRules(state.siteRules);
    }
    showToast("Rule updated");
  } else {
    const newRule = { id: generateId("rule"), isSystem: false, ...payload };
    state.customRules = [newRule, ...state.customRules];
    await setCustomRules(state.customRules);
    showToast("Rule created");
  }

  closeRuleModal();
  renderRules();
});

// --------------------------------------------------------------------------
// Folder mapping
// --------------------------------------------------------------------------

function groupsFromFolderMap(folderMap) {
  const byFolder = new Map();
  Object.entries(folderMap).forEach(([ext, folder]) => {
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder).push(ext);
  });
  return [...byFolder.entries()].map(([folder, extensions]) => ({ folder, extensions }));
}

function renderFolderMap() {
  const table = document.getElementById("folder-map-table");
  table.querySelectorAll(".folder-map-row:not(.folder-map-row--head)").forEach((r) => r.remove());

  const groups = groupsFromFolderMap(state.folderMap);
  groups.forEach((group) => table.appendChild(folderMapRow(group)));
}

function folderMapRow(group) {
  const row = document.createElement("div");
  row.className = "folder-map-row";

  const extInput = document.createElement("input");
  extInput.className = "input mono";
  extInput.value = group.extensions.join(", ");
  extInput.placeholder = "jpg, jpeg, png";

  const folderInput = document.createElement("input");
  folderInput.className = "input";
  folderInput.value = group.folder;
  folderInput.placeholder = "Images";

  const removeBtn = document.createElement("button");
  removeBtn.className = "btn btn--sm btn--ghost";
  removeBtn.type = "button";
  removeBtn.textContent = "\u2715";
  removeBtn.title = "Remove mapping";
  removeBtn.addEventListener("click", async () => {
    row.remove();
    await saveFolderMapFromDOM();
  });

  [extInput, folderInput].forEach((input) => {
    input.addEventListener("change", saveFolderMapFromDOM);
  });

  row.appendChild(extInput);
  row.appendChild(folderInput);
  row.appendChild(removeBtn);
  return row;
}

async function saveFolderMapFromDOM() {
  const rows = [...document.querySelectorAll("#folder-map-table .folder-map-row:not(.folder-map-row--head)")];
  const newMap = {};
  rows.forEach((row) => {
    const inputs = row.querySelectorAll("input");
    const extensions = inputs[0].value.split(",").map((s) => s.trim().replace(/^\./, "").toLowerCase()).filter(Boolean);
    const folder = inputs[1].value.trim();
    if (!folder || !extensions.length) return;
    extensions.forEach((ext) => {
      newMap[ext] = folder;
    });
  });
  state.folderMap = newMap;
  await setFolderMap(newMap);
  showToast("Folder mapping saved");
}

document.getElementById("btn-add-mapping").addEventListener("click", () => {
  const table = document.getElementById("folder-map-table");
  const row = folderMapRow({ folder: "", extensions: [] });
  table.appendChild(row);
  row.querySelector("input").focus();
});

// --------------------------------------------------------------------------
// History
// --------------------------------------------------------------------------

function renderHistory() {
  const list = document.getElementById("history-list");
  const filtered = filterHistory(state.history, historyFilters);

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><div class="glyph">&#128269;</div><div class="title">Nothing here</div><div class="hint">Try a different search or filter.</div></div>`;
    return;
  }

  const groups = new Map(); // dayStart -> entries
  filtered.forEach((entry) => {
    const day = startOfDay(entry.timestamp);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(entry);
  });

  const sortedDays = [...groups.keys()].sort((a, b) => b - a);
  const today = startOfDay();

  list.innerHTML = "";
  sortedDays.forEach((day) => {
    const wrap = document.createElement("div");
    wrap.className = "history-day";
    const label = document.createElement("div");
    label.className = "history-day-label";
    label.textContent =
      day === today
        ? "Today"
        : new Date(day).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    wrap.appendChild(label);

    groups.get(day).forEach((entry) => wrap.appendChild(historyRow(entry)));
    list.appendChild(wrap);
  });
}

function historyRow(entry) {
  const row = document.createElement("div");
  row.className = "history-row";
  row.innerHTML = `
    <span class="entry-glyph">${categoryGlyph(entry.folder, entry.ext)}</span>
    <span class="h-name mono" title="${escapeHtml(entry.finalFilename)}">${escapeHtml(entry.finalFilename)}</span>
    <span class="h-source">${escapeHtml(sourceDisplayName(entry.sourceType) === entry.sourceType ? (entry.domain || "\u2014") : sourceDisplayName(entry.sourceType))}</span>
    <span class="h-folder mono">${entry.folder ? escapeHtml(entry.folder) + "/" : "Downloads/"}</span>
    <span class="h-time">${formatRelativeTime(entry.timestamp)}</span>
  `;
  return row;
}

document.getElementById("history-search").addEventListener("input", (e) => {
  historyFilters.search = e.target.value;
  renderHistory();
});

document.getElementById("time-chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  document.querySelectorAll("#time-chips .chip").forEach((c) => c.classList.remove("chip--active"));
  chip.classList.add("chip--active");
  historyFilters.timeframe = chip.dataset.timeframe;
  renderHistory();
});

document.getElementById("category-chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  document.querySelectorAll("#category-chips .chip").forEach((c) => c.classList.remove("chip--active"));
  chip.classList.add("chip--active");
  historyFilters.category = chip.dataset.category;
  renderHistory();
});

document.getElementById("btn-clear-history").addEventListener("click", async () => {
  if (!confirm("Clear all download history? This can't be undone.")) return;
  await clearHistoryEntries();
  state.history = [];
  renderHistory();
  renderOverview();
  showToast("History cleared");
});

// --------------------------------------------------------------------------
// Settings
// --------------------------------------------------------------------------

function renderSettingsForm() {
  const s = state.settings;
  document.getElementById("setting-enabled").checked = s.organizerEnabled;
  document.getElementById("setting-notifications").checked = s.notificationsEnabled;
  document.getElementById("setting-duplicate").value = s.duplicateStrategy;
  document.getElementById("setting-filename-style").value = s.filenameStyle;
  document.getElementById("setting-max-length").value = s.maxFilenameLength;
  document.getElementById("setting-theme").value = s.theme;
}

document.getElementById("setting-enabled").addEventListener("change", async (e) => {
  state.settings = await setSettings({ organizerEnabled: e.target.checked });
  setPowerUI(e.target.checked);
  showToast("Saved");
});
document.getElementById("setting-notifications").addEventListener("change", async (e) => {
  state.settings = await setSettings({ notificationsEnabled: e.target.checked });
  showToast("Saved");
});
document.getElementById("setting-duplicate").addEventListener("change", async (e) => {
  state.settings = await setSettings({ duplicateStrategy: e.target.value });
  showToast("Saved");
});
document.getElementById("setting-filename-style").addEventListener("change", async (e) => {
  state.settings = await setSettings({ filenameStyle: e.target.value });
  showToast("Saved");
});
document.getElementById("setting-max-length").addEventListener("change", async (e) => {
  const val = Math.max(20, Math.min(255, parseInt(e.target.value, 10) || 150));
  e.target.value = val;
  state.settings = await setSettings({ maxFilenameLength: val });
  showToast("Saved");
});
document.getElementById("setting-theme").addEventListener("change", async (e) => {
  state.settings = await setSettings({ theme: e.target.value });
  html.setAttribute("data-theme", e.target.value);
  showToast("Saved");
});

document.getElementById("btn-reset-defaults").addEventListener("click", async () => {
  if (!confirm("Reset rules and folder mapping to their defaults?")) return;
  state.folderMap = { ...DEFAULT_FOLDER_MAP };
  state.siteRules = DEFAULT_SITE_RULES.map((r) => ({ ...r }));
  state.customRules = [];
  await Promise.all([
    setFolderMap(state.folderMap),
    setSiteRules(state.siteRules),
    setCustomRules(state.customRules),
  ]);
  renderRules();
  renderFolderMap();
  showToast("Defaults restored");
});

document.getElementById("btn-erase-all").addEventListener("click", async () => {
  if (!confirm("This clears ALL Alterer data on this device, including history. Continue?")) return;
  await chrome.storage.local.clear();
  await loadAll();
  showToast("All data erased");
});

// --------------------------------------------------------------------------
// Utils
// --------------------------------------------------------------------------

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

// --------------------------------------------------------------------------
// Init
// --------------------------------------------------------------------------

goToSection(window.location.hash.replace("#", "") || "overview");
loadAll();
