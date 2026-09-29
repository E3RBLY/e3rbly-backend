// Comparison and reporting helpers for the pilot. Pure functions, unit tested.
const FIELDS = ["pos", "root", "role", "case"];

// Compare Arabic labels without marks/tatweel/alef variants so "مَرفوع" equals "مرفوع".
const norm = (s) =>
  String(s === undefined || s === null ? "" : s)
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .trim();

/** The draft must repeat every input word exactly; anything else is rejected as text alteration. */
function validateDraft(json, words) {
  if (!json || !Array.isArray(json.words)) return "missing words array";
  if (json.words.length !== words.length) return `expected ${words.length} words, got ${json.words.length}`;
  for (let i = 0; i < words.length; i += 1) {
    if (!json.words[i] || json.words[i].text !== words[i]) return `word ${i} was altered`;
  }
  return null;
}

/** Number of words (and per field) where two passes differ. */
function disagreement(a, b) {
  const per = Object.fromEntries(FIELDS.map((f) => [f, 0]));
  let anyDiff = 0;
  const n = a.words.length;
  for (let i = 0; i < n; i += 1) {
    let differs = false;
    for (const f of FIELDS) {
      if (norm(a.words[i][f]) !== norm(b.words[i][f])) {
        per[f] += 1;
        differs = true;
      }
    }
    if (differs) anyDiff += 1;
  }
  return { words: n, anyDiff, per };
}

/** Error counts by field against a gold list [{pos, root, role, case}] (same word order). */
function errorsAgainstGold(draft, gold) {
  const per = Object.fromEntries(FIELDS.map((f) => [f, { compared: 0, wrong: 0 }]));
  draft.words.forEach((w, i) => {
    const g = gold[i];
    if (!g) return;
    for (const f of FIELDS) {
      if (g[f] === undefined || g[f] === null || g[f] === "") continue;
      per[f].compared += 1;
      if (norm(w[f]) !== norm(g[f])) per[f].wrong += 1;
    }
  });
  return per;
}

const pick = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

/**
 * Summarise calls [{ref, words, inTok, outTok, costUsd, latencyMs, attempts}] and extrapolate to the
 * whole Quran as a RANGE (min / mean / max cost per word seen in the pilot). Short ayat carry more
 * fixed overhead per word, so min and max are wide; the mean is not a guarantee.
 */
function summarize(calls, { totalWords, passes = 1, retryOverhead = 0.3 }) {
  const n = calls.length;
  const sum = (f) => calls.reduce((a, c) => a + f(c), 0);
  const lat = calls.map((c) => c.latencyMs).sort((a, b) => a - b);
  const perWord = calls.map((c) => c.costUsd / c.words).sort((a, b) => a - b);
  const scale = (perWordCost) => perWordCost * totalWords * passes * (1 + retryOverhead);
  return {
    calls: n,
    tokensInPerCall: sum((c) => c.inTok) / n,
    tokensOutPerCall: sum((c) => c.outTok) / n,
    costPerCallUsd: sum((c) => c.costUsd) / n,
    latencyP50Ms: pick(lat, 0.5),
    latencyMaxMs: lat[lat.length - 1],
    retryRate: sum((c) => c.attempts - 1) / n,
    extrapolationUsd: { low: scale(perWord[0]), mean: scale(sum((c) => c.costUsd) / sum((c) => c.words)), high: scale(perWord[perWord.length - 1]) },
    assumptions: { totalWords, passes, retryOverhead },
  };
}

module.exports = { FIELDS, norm, validateDraft, disagreement, errorsAgainstGold, summarize };
