#!/usr/bin/env node
/**
 * Generates AI-draft annotations for ayat and stores them in data/annotations (unreviewed).
 * Resumable: ayat that already have all three kinds are skipped, and nothing is ever overwritten.
 *
 *   node modules/quran/scripts/generate-annotations.js --surah 112              one surah
 *   node modules/quran/scripts/generate-annotations.js --surah 2 --from 1 --to 20
 *   node modules/quran/scripts/generate-annotations.js --surah 108 --dry-run    show what would be sent, no network
 *
 * Env: PILOT_API_KEY, PILOT_MODEL and PILOT_FREE_TIER=true (see modules/quran/README.md). Free tier: at
 * most PILOT_MAX_CALLS requests per run (default 60), paced by PILOT_MIN_INTERVAL_MS (default 6500).
 * Re-run on another day to continue when the daily free quota is used up.
 */
require("dotenv").config();
const { loadPack, AYAH_COUNTS } = require("../src/pack");
const { loadAnnotations } = require("../src/annotations");
const { buildAyahPrompt, validateGenerated, ensureSources, existingKinds, storeGenerated } = require("../src/annotationGenerator");
const { CostGuard } = require("../pilot/costGuard");
const { callModel } = require("../pilot/client");
const { ayahWords } = require("../pilot/prompt");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

async function main() {
  const surah = Number.parseInt(arg("surah"), 10);
  if (!(surah >= 1 && surah <= 114)) throw new Error("--surah must be 1..114");
  const from = Number.parseInt(arg("from", "1"), 10);
  const to = Number.parseInt(arg("to", String(AYAH_COUNTS[surah - 1])), 10);
  if (!(from >= 1 && to <= AYAH_COUNTS[surah - 1] && from <= to)) throw new Error(`--from/--to must fit surah ${surah} (1..${AYAH_COUNTS[surah - 1]})`);
  const dryRun = process.argv.includes("--dry-run");

  const pack = loadPack();
  const todo = [];
  for (let n = from; n <= to; n += 1) {
    if (existingKinds(surah, n).length < 3) todo.push(n);
  }
  console.log(`Surah ${surah}, ayat ${from}-${to}: ${todo.length} need drafts, ${to - from + 1 - todo.length} already have all three.`);
  if (dryRun || todo.length === 0) {
    if (dryRun && todo.length) console.log(`--dry-run: first prompt:\n${buildAyahPrompt(surah, todo[0], ayahWords(pack, surah, todo[0]).join(" "))}`);
    return;
  }

  const env = process.env;
  if (env.PILOT_FREE_TIER !== "true") throw new Error("Set PILOT_FREE_TIER=true (this script only runs in free-tier mode).");
  const missing = ["PILOT_API_KEY", "PILOT_MODEL"].filter((k) => !env[k]);
  if (missing.length) throw new Error(`missing env: ${missing.join(", ")}`);
  const guard = CostGuard.free({ maxCalls: Number.parseInt(env.PILOT_MAX_CALLS || "60", 10) });
  const interval = Number.parseInt(env.PILOT_MIN_INTERVAL_MS || "6500", 10);
  ensureSources();

  let stored = 0;
  let rejected = 0;
  let streak = 0; // consecutive failures: a daily quota or an outage, not a bad ayah
  try {
    for (const [i, n] of todo.entries()) {
      if (streak >= 4) {
        console.log("  stopping: 4 failures in a row (quota or outage). Run again later; nothing is lost.");
        process.exitCode = 3;
        break;
      }
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, interval));
      const text = ayahWords(pack, surah, n).join(" ");
      try {
        const r = await callModel({ apiKey: env.PILOT_API_KEY, model: env.PILOT_MODEL, prompt: buildAyahPrompt(surah, n, text), temperature: 0.2, guard, maxOutputTokens: 4096, retryDelayMs: 30000, validate: validateGenerated });
        storeGenerated(surah, n, r.json);
        stored += 1;
        streak = 0;
        console.log(`  ${surah}:${n} stored`);
      } catch (err) {
        if (err.code === "BUDGET_EXCEEDED") throw err;
        rejected += 1;
        streak += 1;
        console.log(`  ${surah}:${n} skipped (${err.message})`);
      }
    }
  } finally {
    // The packs must still pass the content-policy validation after every run.
    loadAnnotations({ includeUnreviewed: true });
    console.log(`Done: ${stored} stored, ${rejected} skipped, ${guard.attempts}/${guard.maxCalls} requests used. Review with: npm run validate:annotations`);
  }
}

main().catch((err) => {
  console.error(err.code === "BUDGET_EXCEEDED" ? `STOPPED (limit reached; run again later to continue): ${err.message}` : `ERROR: ${err.message}`);
  process.exit(1);
});
