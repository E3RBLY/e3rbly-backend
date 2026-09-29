#!/usr/bin/env node
/**
 * Pilot runner. Draft output is LOCAL ONLY (pilot-output/, git-ignored), labelled ai_draft, never served.
 *
 *   node modules/quran/pilot/run.js                 dry run: prints the plan, no network, no key needed
 *   node modules/quran/pilot/run.js --run           real calls (needs the env below)
 *   node modules/quran/pilot/run.js --run --gold gold/pilot-gold.json    also score against a gold file
 *
 * Env (--run only): PILOT_API_KEY, PILOT_MODEL, PILOT_CAP_USD, PILOT_PRICE_IN_PER_M, PILOT_PRICE_OUT_PER_M
 * Prices are USD per 1M tokens, copied by the owner from the provider's pricing page. Nothing is assumed.
 */
const fs = require("fs");
const path = require("path");
const { loadPack } = require("../src/pack");
const { PILOT_REFS } = require("./refs");
const { ayahWords, buildPrompt } = require("./prompt");
const { CostGuard } = require("./costGuard");
const { callModel, estimateTokens } = require("./client");
const { validateDraft, disagreement, errorsAgainstGold, summarize } = require("./analysis");

const OUT_DIR = path.join(__dirname, "..", "..", "..", "pilot-output");
const TEMPERATURES = [0, 0.5]; // two passes to measure agreement; same model, so NOT fully independent

function totalQuranWords(pack) {
  let n = 0;
  pack.surahs.forEach((ayat, i) => ayat.forEach((_, j) => { n += ayahWords(pack, i + 1, j + 1).length; }));
  return n;
}

async function main() {
  const args = process.argv.slice(2);
  const live = args.includes("--run");
  const goldPath = args.includes("--gold") ? args[args.indexOf("--gold") + 1] : null;
  const pack = loadPack();
  const items = PILOT_REFS.map((ref) => {
    const [s, a] = ref.split(":").map(Number);
    const words = ayahWords(pack, s, a);
    return { ref, words, prompt: buildPrompt(words) };
  });
  const totalWords = totalQuranWords(pack);

  console.log(`Pilot: ${items.length} ayat, ${items.reduce((n, i) => n + i.words.length, 0)} words, ${TEMPERATURES.length} passes. Quran total words: ${totalWords}. GROUNDING: none (ungrounded run).`);
  if (!live) {
    const estIn = items.reduce((n, i) => n + estimateTokens(i.prompt), 0) * TEMPERATURES.length;
    console.log(`DRY RUN (no network). Rough UNMEASURED input estimate: ~${estIn} tokens for the whole pilot. Use --run to call the model.`);
    return;
  }

  const env = process.env;
  const missing = ["PILOT_API_KEY", "PILOT_MODEL", "PILOT_CAP_USD", "PILOT_PRICE_IN_PER_M", "PILOT_PRICE_OUT_PER_M"].filter((k) => !env[k]);
  if (missing.length) throw new Error(`missing env: ${missing.join(", ")}`);
  const guard = new CostGuard({ capUsd: Number(env.PILOT_CAP_USD), priceInPerM: Number(env.PILOT_PRICE_IN_PER_M), priceOutPerM: Number(env.PILOT_PRICE_OUT_PER_M) });
  const gold = goldPath ? JSON.parse(fs.readFileSync(goldPath, "utf8")) : null;

  const calls = [];
  const drafts = [];
  const failures = [];
  const passResults = {};
  try {
    for (const item of items) {
      for (const [pass, temperature] of TEMPERATURES.entries()) {
        const before = guard.spentUsd;
        try {
          const r = await callModel({ apiKey: env.PILOT_API_KEY, model: env.PILOT_MODEL, prompt: item.prompt, temperature, guard, validate: (j) => validateDraft(j, item.words) });
          calls.push({ ref: item.ref, pass, words: item.words.length, inTok: r.inTok, outTok: r.outTok, costUsd: guard.spentUsd - before, latencyMs: r.latencyMs, attempts: r.attempts });
          (passResults[item.ref] = passResults[item.ref] || []).push(r.json);
          drafts.push({ ref: item.ref, pass, provenance: "ai_draft", review_status: "unreviewed", grounded: false, model: env.PILOT_MODEL, draft: r.json });
        } catch (err) {
          if (err.code === "BUDGET_EXCEEDED") throw err;
          failures.push({ ref: item.ref, pass, error: err.message, attempts: err.attempts, invalid: err.invalid });
        }
      }
    }
  } finally {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dis = Object.entries(passResults).filter(([, v]) => v.length === 2).map(([ref, [a, b]]) => ({ ref, ...disagreement(a, b) }));
    const goldErr = gold ? Object.entries(passResults).filter(([ref]) => gold[ref]).map(([ref, v]) => ({ ref, ...errorsAgainstGold(v[0], gold[ref]) })) : null;
    const summary = calls.length ? summarize(calls, { totalWords, passes: TEMPERATURES.length }) : null;
    const report = { spentUsd: guard.spentUsd, capUsd: guard.capUsd, calls: calls.length, failures, summary, disagreement: dis, goldScored: Boolean(gold), goldErrors: goldErr, note: "Pilot only: not a validated error rate." };
    fs.writeFileSync(path.join(OUT_DIR, `drafts-${stamp}.json`), JSON.stringify(drafts, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, `report-${stamp}.json`), JSON.stringify(report, null, 2));
    console.log(`Spent $${guard.spentUsd.toFixed(4)} of $${guard.capUsd} cap; ${calls.length} calls ok, ${failures.length} failed. Wrote pilot-output/*-${stamp}.json`);
  }
}

main().catch((err) => {
  console.error(err.code === "BUDGET_EXCEEDED" ? `STOPPED: ${err.message}` : `ERROR: ${err.message}`);
  process.exit(1);
});
