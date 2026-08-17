// popup.js
import { getSettings, setSettings, getHistory } from "./js/storage.js";
import { computeStats } from "./js/stats.js";
import { formatRelativeTime, categoryGlyph } from "./js/utilities.js";

const els = {
  html: document.documentElement,
  powerToggle: document.getElementById("power-toggle"),
  powerCheckbox: document.getElementById("power-checkbox"),
  powerLabel: document.getElementById("power-label"),
  todayCount: document.getElementById("today-count"),
  recentList: document.getElementById("recent-list"),
  errorBanner: document.getElementById("error-banner"),
  errorText: document.getElementById("error-text"),
  btnHistory: document.getElementById("btn-history"),
  btnSettings: document.getElementById("btn-settings"),
};

function renderSkeleton() {
  els.recentList.innerHTML = "";
  for (let i = 0; i < 3; i += 1) {
    const row = document.createElement("div");
    row.className = "skeleton skeleton-row";
    els.recentList.appendChild(row);
  }
}

function renderEmpty() {
  els.recentList.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "empty-state";
  wrap.innerHTML = `
    <div class="glyph">\u{1F4C2}</div>
    <div class="title">No downloads organized yet</div>
    <div class="hint">Download something and Alterer will sort it into place automatically.</div>
  `;
  els.recentList.appendChild(wrap);
}

function entryCard(entry) {
  const card = document.createElement("div");
  card.className = "entry-card";

  const glyph = document.createElement("div");
  glyph.className = "entry-glyph";
  glyph.textContent = categoryGlyph(entry.folder, entry.ext);

  const main = document.createElement("div");
  main.className = "entry-main";

  const name = document.createElement("div");
  name.className = "entry-name mono";
  name.title = entry.finalFilename;
  name.textContent = entry.finalFilename;

  const meta = document.createElement("div");
  meta.className = "entry-meta";

  const sourceLabel = sourceDisplayName(entry.sourceType, entry.domain);
  if (sourceLabel) {
    const pill = document.createElement("span");
    pill.className = "pill pill--teal";
    pill.textContent = sourceLabel;
    meta.appendChild(pill);
  }

  const folderPill = document.createElement("span");
  folderPill.className = "pill pill--accent mono";
  folderPill.textContent = entry.folder ? `${entry.folder}/` : "Downloads/";
  meta.appendChild(folderPill);

  main.appendChild(name);
  main.appendChild(meta);

  const time = document.createElement("div");
  time.className = "entry-time";
  time.textContent = formatRelativeTime(entry.timestamp);

  card.appendChild(glyph);
  card.appendChild(main);
  card.appendChild(time);
  return card;
}

function sourceDisplayName(sourceType, domain) {
  const names = {
    google: "Google Images",
    youtube: "YouTube",
    github: "GitHub",
    leetcode: "LeetCode",
    reddit: "Reddit",
  };
  if (sourceType && names[sourceType]) return names[sourceType];
  return domain || "";
}

function applyTheme(theme) {
  els.html.setAttribute("data-theme", theme || "system");
}

function setPowerUI(enabled) {
  els.powerCheckbox.checked = enabled;
  els.powerLabel.textContent = enabled ? "On" : "Off";
  if (enabled) {
    els.powerToggle.removeAttribute("data-off");
  } else {
    els.powerToggle.setAttribute("data-off", "");
  }
}

async function load() {
  renderSkeleton();
  try {
    const [settings, history] = await Promise.all([getSettings(), getHistory()]);
    applyTheme(settings.theme);
    setPowerUI(settings.organizerEnabled);

    const stats = computeStats(history);
    els.todayCount.innerHTML = `<strong>${stats.today}</strong> organized today`;

    if (!history.length) {
      renderEmpty();
      return;
    }

    els.recentList.innerHTML = "";
    history.slice(0, 6).forEach((entry) => {
      els.recentList.appendChild(entryCard(entry));
    });
  } catch (err) {
    console.error(err);
    els.errorBanner.hidden = false;
    els.errorText.textContent = "Couldn't load your activity. Try reopening the popup.";
    els.recentList.innerHTML = "";
  }
}

els.powerToggle.addEventListener("click", async (e) => {
  e.preventDefault();
  const next = !els.powerCheckbox.checked;
  setPowerUI(next);
  try {
    await setSettings({ organizerEnabled: next });
  } catch (err) {
    console.error(err);
    setPowerUI(!next); // revert on failure
  }
});

els.btnHistory.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("options.html#history") });
});

els.btnSettings.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("options.html#settings") });
});

load();
