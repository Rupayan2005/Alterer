// js/rule-engine.js
// Deterministic rule resolution, per the priority order:
//   1. User-created custom rule
//   2. Website + file-type rule (built-in site rule with an extension condition)
//   3. Website rule (built-in site rule, no extension condition)
//   4. File-type rule (the default extension -> folder map)
//   5. Generic fallback (root Downloads, original filename, untouched)

import { folderForExtension, normalizeFolder } from "./folder-manager.js";

/**
 * @typedef {object} Rule
 * @property {string} id
 * @property {string} name
 * @property {boolean} enabled
 * @property {boolean} isSystem
 * @property {{sourceType: string|null, domain: string|null, extensions: string[]|null}} conditions
 * @property {{renameTemplate: string|null, folder: string}} actions
 */

function ruleMatches(rule, context, ext) {
  if (!rule.enabled) return false;
  const { sourceType, domain, extensions } = rule.conditions || {};

  if (sourceType && sourceType !== "any" && sourceType !== context.sourceType) {
    return false;
  }
  if (domain && context.domain && domain.toLowerCase() !== context.domain.toLowerCase()) {
    return false;
  }
  if (domain && !context.domain) {
    return false;
  }
  if (extensions && extensions.length && !extensions.includes(ext)) {
    return false;
  }
  return true;
}

function specificityScore(rule, isCustom) {
  const { sourceType, domain, extensions } = rule.conditions || {};
  let score = isCustom ? 1000 : 0;
  if ((sourceType && sourceType !== "any") || domain) score += 200;
  if (extensions && extensions.length) score += 100;
  return score;
}

/**
 * Evaluate all rules against a context + extension and return the winning
 * decision, or null if nothing matched (caller should fall back to the
 * folder map, then to the untouched original filename).
 *
 * @param {object} params
 * @param {Rule[]} params.siteRules
 * @param {Rule[]} params.customRules
 * @param {object} params.context - normalized DownloadContext
 * @param {string} params.ext - lowercase extension without the dot
 * @returns {{ folder: string, renameTemplate: string|null, matchedRule: Rule } | null}
 */
export function evaluateRules({ siteRules, customRules, context, ext }) {
  const candidates = [];

  for (const rule of customRules || []) {
    if (ruleMatches(rule, context, ext)) {
      candidates.push({ rule, isCustom: true, score: specificityScore(rule, true) });
    }
  }
  for (const rule of siteRules || []) {
    if (ruleMatches(rule, context, ext)) {
      candidates.push({ rule, isCustom: false, score: specificityScore(rule, false) });
    }
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => b.score - a.score);
  const winner = candidates[0];

  return {
    folder: normalizeFolder(winner.rule.actions.folder),
    renameTemplate: winner.rule.actions.renameTemplate || null,
    matchedRule: winner.rule,
  };
}

/**
 * Full resolution pipeline: rules first, then the file-type folder map,
 * then "no match" (root Downloads, original filename).
 *
 * @returns {{ folder: string, renameTemplate: string|null, matchedRule: Rule|null, tier: string }}
 */
export function resolveDestination({ siteRules, customRules, folderMap, context, ext }) {
  const ruleResult = evaluateRules({ siteRules, customRules, context, ext });
  if (ruleResult) {
    return { ...ruleResult, tier: ruleResult.matchedRule.isSystem === false ? "custom-rule" : "site-rule" };
  }

  const folder = folderForExtension(folderMap, ext);
  if (folder) {
    return { folder, renameTemplate: null, matchedRule: null, tier: "file-type" };
  }

  return { folder: "", renameTemplate: null, matchedRule: null, tier: "unmatched" };
}
