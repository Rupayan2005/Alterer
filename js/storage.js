// js/storage.js
// Single source of truth for everything persisted in chrome.storage.local.
// All extension data stays on-device; nothing here is ever sent anywhere.

export const STORAGE_KEYS = {
  SETTINGS: "settings",
  FOLDER_MAP: "folderMap",
  SITE_RULES: "siteRules",
  CUSTOM_RULES: "customRules",
  HISTORY: "history",
  USED_PATHS: "usedPaths",
};

export const DEFAULT_SETTINGS = {
  organizerEnabled: true,
  notificationsEnabled: true,
  // 'paren' -> "dog (1).jpg", 'underscore' -> "dog_1.jpg",
  // 'keep-original' -> never rename on conflict (let Chrome uniquify silently),
  // 'overwrite' -> allow overwriting existing files with the same name.
  duplicateStrategy: "paren",
  // 'preserve' keeps the case/spacing produced by templates (spaces -> _),
  // 'lowercase' forces the generated base name to lowercase.
  filenameStyle: "preserve",
  maxFilenameLength: 150,
  maxHistoryItems: 750,
  theme: "system", // 'system' | 'light' | 'dark'
  createdFolders: {}, // folder path -> true, tracks "already created" for lazy folder creation UX
};

// Default extension -> folder mappings (the "file-type" tier of the rule engine).
export const DEFAULT_FOLDER_MAP = {
  jpg: "Images",
  jpeg: "Images",
  png: "Images",
  gif: "Images",
  webp: "Images",
  svg: "Images",
  bmp: "Images",
  ico: "Images",
  pdf: "PDFs",
  mp4: "Videos",
  webm: "Videos",
  mkv: "Videos",
  avi: "Videos",
  mov: "Videos",
  mp3: "Music",
  wav: "Music",
  flac: "Music",
  ogg: "Music",
  m4a: "Music",
  zip: "Archives",
  rar: "Archives",
  "7z": "Archives",
  tar: "Archives",
  gz: "Archives",
  cpp: "Code/CPP",
  cc: "Code/CPP",
  c: "Code/CPP",
  h: "Code/CPP",
  hpp: "Code/CPP",
  py: "Code/Python",
  java: "Code/Java",
  js: "Code/Web",
  ts: "Code/Web",
  jsx: "Code/Web",
  tsx: "Code/Web",
  csv: "Documents/Spreadsheets",
  xlsx: "Documents/Spreadsheets",
  xls: "Documents/Spreadsheets",
  doc: "Documents/Word",
  docx: "Documents/Word",
  ppt: "Documents/Presentations",
  pptx: "Documents/Presentations",
};

// Built-in, editable/disable-able site rules. Users can also add their own
// custom rules of the exact same shape via the rule builder (see rule-engine.js).
export const DEFAULT_SITE_RULES = [
  {
    id: "sys_google_images",
    name: "Google Images",
    enabled: true,
    isSystem: true,
    conditions: { sourceType: "google", domain: null, extensions: ["jpg", "jpeg", "png", "gif", "webp"] },
    actions: { renameTemplate: "{query}.{ext}", folder: "Images" },
  },
  {
    id: "sys_youtube",
    name: "YouTube",
    enabled: true,
    isSystem: true,
    conditions: { sourceType: "youtube", domain: null, extensions: null },
    actions: { renameTemplate: "{title}.{ext}", folder: "Videos" },
  },
  {
    id: "sys_github",
    name: "GitHub",
    enabled: true,
    isSystem: true,
    conditions: { sourceType: "github", domain: null, extensions: null },
    actions: { renameTemplate: "{repository}.{ext}", folder: "GitHub" },
  },
  {
    id: "sys_leetcode",
    name: "LeetCode",
    enabled: true,
    isSystem: true,
    conditions: { sourceType: "leetcode", domain: null, extensions: null },
    actions: { renameTemplate: "{title}.{ext}", folder: "LeetCode" },
  },
  {
    id: "sys_reddit",
    name: "Reddit",
    enabled: true,
    isSystem: true,
    conditions: { sourceType: "reddit", domain: null, extensions: null },
    actions: { renameTemplate: "{original}.{ext}", folder: "Reddit" },
  },
];

const cache = {}; // in-memory read cache within the service worker's lifetime

export async function getSettings() {
  const { [STORAGE_KEYS.SETTINGS]: stored } = await chrome.storage.local.get(
    STORAGE_KEYS.SETTINGS
  );
  return { ...DEFAULT_SETTINGS, ...(stored || {}) };
}

export async function setSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: next });
  return next;
}

export async function getFolderMap() {
  const { [STORAGE_KEYS.FOLDER_MAP]: stored } = await chrome.storage.local.get(
    STORAGE_KEYS.FOLDER_MAP
  );
  return stored && Object.keys(stored).length ? stored : { ...DEFAULT_FOLDER_MAP };
}

export async function setFolderMap(map) {
  await chrome.storage.local.set({ [STORAGE_KEYS.FOLDER_MAP]: map });
  return map;
}

export async function getSiteRules() {
  const { [STORAGE_KEYS.SITE_RULES]: stored } = await chrome.storage.local.get(
    STORAGE_KEYS.SITE_RULES
  );
  return stored || DEFAULT_SITE_RULES.map((r) => ({ ...r }));
}

export async function setSiteRules(rules) {
  await chrome.storage.local.set({ [STORAGE_KEYS.SITE_RULES]: rules });
  return rules;
}

export async function getCustomRules() {
  const { [STORAGE_KEYS.CUSTOM_RULES]: stored } = await chrome.storage.local.get(
    STORAGE_KEYS.CUSTOM_RULES
  );
  return stored || [];
}

export async function setCustomRules(rules) {
  await chrome.storage.local.set({ [STORAGE_KEYS.CUSTOM_RULES]: rules });
  return rules;
}

export async function getHistory() {
  const { [STORAGE_KEYS.HISTORY]: stored } = await chrome.storage.local.get(
    STORAGE_KEYS.HISTORY
  );
  return stored || [];
}

export async function setHistory(history) {
  await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: history });
  return history;
}

/** Small persisted set of "folder/filename" strings we've already assigned,
 * used as one signal (alongside the in-memory session set) for duplicate detection. */
export async function getUsedPaths() {
  const { [STORAGE_KEYS.USED_PATHS]: stored } = await chrome.storage.local.get(
    STORAGE_KEYS.USED_PATHS
  );
  return stored || [];
}

export async function addUsedPath(path, maxTracked = 2000) {
  const paths = await getUsedPaths();
  paths.push(path);
  const trimmed = paths.length > maxTracked ? paths.slice(paths.length - maxTracked) : paths;
  await chrome.storage.local.set({ [STORAGE_KEYS.USED_PATHS]: trimmed });
}

export async function resetAllData() {
  await chrome.storage.local.clear();
}

export const _cache = cache; // exported only for debugging in the service worker console
