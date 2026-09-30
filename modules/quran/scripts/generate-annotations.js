#!/usr/bin/env node
/**
 * Generates AI-draft annotations and stores them in data/annotations (unreviewed, labelled).
 * Resumable and safe to stop at any time: finished ayat are skipped, nothing is ever overwritten.
 *
 *   node modules/quran/scripts/generate-annotations.js --surahs 112 --only i3rab
 *   node modules/quran/scripts/generate-annotations.js --surahs all --only i3rab      whole Quran, most-read part first
 *   node modules/quran/scripts/generate-annotations.js --surahs 78-114 --dry-run      preview, no network
 *
 * Options:  --surahs <list|all>   e.g. 112, 78-114, 110-108,1, all   (default: all)
 *           --only i3rab          only the i'rab (the tafsir books already cover meaning)
 *           --max-ayat N          stop after storing N ayat this run
 *           --dry-run             show the plan and the first prompt, no network
 *
 * Env: PILOT_API_KEY, PILOT_FREE_TIER=true, and PILOT_MODELS=modelA,modelB,... (or PILOT_MODEL).
 * Free-tier daily quotas are per model, so several models are rotated; a model that reports its
 * daily quota is retired for the run. Pacing: PILOT_MIN_INTERVAL_MS (default 4000).
 * Exit codes: 0 finished, 3 stopped because quotas ran out or too many failures (run again later).
 */
require("dotenv").config();
const { loadPack } = require("../src/pack");
const { loadAnnotations } = require("../src/annotations");
const { buildAyahPrompt, validateGenerated, ensureSources, needsGeneration, storeGenerated } = require("../src/annotationGenerator");
const { ModelPool, runGeneration, parseSurahList } = require("../src/generationRun");
const { CostGuard } = require("../pilot/costGuard");
const { callModel } = require("../pilot/client");
const { ayahWords } = require("../pilot/prompt");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

async function main() {
  const surahs = parseSurahList(arg("surahs", "all"));
  const only = arg("only");
  if (only && only !== "i3rab") throw new Error('--only supports "i3rab"');
  const maxStored = arg("max-ayat") ? Number.parseInt(arg("max-ayat"), 10) : Infinity;

  const pack = loadPack();
  const targets = [];
  for (const surah of surahs) {
    for (let ayah = 1; ayah <= pack.surahs[surah - 1].length; ayah += 1) {
      const words = ayahWords(pack, surah, ayah);
      targets.push({ surah, ayah, text: words.join(" "), wordCount: words.length });
    }
  }
  const needs = (s, a) => needsGeneration(s, a, { only });
  const missing = targets.filter((t) => needs(t.surah, t.ayah));
  console.log(`Surahs ${arg("surahs", "all")}: ${targets.length} ayat, ${missing.length} still need ${only || "all three kinds"}, ${targets.length - missing.length} done.`);

  if (flag("dry-run") || missing.length === 0) {
    if (flag("dry-run") && missing.length) console.log(`--dry-run: first prompt:\n${buildAyahPrompt(missing[0].surah, missing[0].ayah, missing[0].text, { only })}`);
    return;
  }

  const env = process.env;
  if (env.PILOT_FREE_TIER !== "true") throw new Error("Set PILOT_FREE_TIER=true (this script only runs in free-tier mode).");
  if (!env.PILOT_API_KEY) throw new Error("missing env: PILOT_API_KEY");
  const models = (env.PILOT_MODELS || env.PILOT_MODEL || "").split(",");
  const pool = new ModelPool(models);
  const guard = CostGuard.free({ maxCalls: Number.parseInt(env.PILOT_MAX_CALLS || "100000", 10) });
  const intervalMs = Number.parseInt(env.PILOT_MIN_INTERVAL_MS || "4000", 10);
  ensureSources();
  console.log(`Models: ${pool.models.join(", ")}  (interval ${intervalMs}ms)`);

  let stored = 0;
  const summary = await runGeneration({
    targets: missing,
    needs,
    pool,
    intervalMs,
    maxStored,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    generate: async ({ model, surah, ayah, text, wordCount }) => {
      const r = await callModel({
        apiKey: env.PILOT_API_KEY, model, guard, temperature: 0.2, maxOutputTokens: 8192, retryDelayMs: 10000, maxAttempts: 3,
        prompt: buildAyahPrompt(surah, ayah, text, { only }),
        validate: (json) => validateGenerated(json, { only, wordCount }),
      });
      return r.json;
    },
    store: (surah, ayah, json, model) => {
      const target = missing.find((t) => t.surah === surah && t.ayah === ayah);
      storeGenerated(surah, ayah, json, { only, model, wordCount: target && target.wordCount, ayahText: target && target.text });
    },
    onEvent: (e) => {
      if (e.type === "stored") {
        stored += 1;
        if (stored % 10 === 0 || stored <= 3) console.log(`  stored ${stored}  (${e.surah}:${e.ayah}, ${e.model})`);
      } else if (e.type === "retired") console.log(`  ${e.model}: daily quota reached, retired for this run. Left: ${pool.remaining().join(", ") || "none"}`);
      else if (e.type === "cooling") console.log(`  ${e.model}: ${e.reason}; resting it for a few minutes, trying the next model`);
      else if (e.type === "waiting") console.log(`  every remaining model is resting; waiting ${Math.round(e.ms / 1000)}s`);
      else if (e.type === "failed") console.log(`  ${e.surah}:${e.ayah} skipped (${e.reason})`);
    },
  });

  // The packs must still pass the content-policy validation after every run.
  loadAnnotations({ includeUnreviewed: true });
  console.log(`\nStopped: ${summary.stopReason}. Stored ${summary.stored}, skipped ${summary.failed}, already done ${summary.skippedExisting}.`);
  console.log(`By model: ${JSON.stringify(summary.byModel)}${summary.retired.length ? `; retired: ${summary.retired.join(", ")}` : ""}`);
  if (["ALL_MODELS_EXHAUSTED", "TOO_MANY_FAILURES"].includes(summary.stopReason)) {
    console.log("Run again later to continue; nothing is lost.");
    process.exitCode = 3;
  }
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
