#!/usr/bin/env node
/**
 * Re-applies the text repairs (harakat removal, hamza restoration, ayah-word spelling) to AI-draft
 * packs already on disk, and tags items with the tier (lite/standard) of the model that wrote them. Idempotent: running it twice changes nothing more. Only touches the three
 * ai-* sources; imported or reviewed sources are never edited.
 *
 *   node modules/quran/scripts/normalize-annotations.js          apply
 *   node modules/quran/scripts/normalize-annotations.js --check  report only (exit 1 if anything would change)
 */
const fs = require("fs");
const path = require("path");
const { loadPack } = require("../src/pack");
const { DEFAULT_DIR } = require("../src/annotations");
const { stripHarakat, restoreHamza, tierOf, DRAFT_SOURCES } = require("../src/annotationGenerator");
const { ayahWords } = require("../pilot/prompt");

const check = process.argv.includes("--check");
const logFile = path.join(DEFAULT_DIR, "generation-log.json");
const genLog = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, "utf8")) : {};
const pack = loadPack();
let changed = 0;

for (const source of DRAFT_SOURCES) {
  const folder = path.join(DEFAULT_DIR, source.id);
  if (!fs.existsSync(folder)) continue;
  for (const file of fs.readdirSync(folder).filter((f) => /^surah-\d+\.json$/.test(f))) {
    const surah = Number(/\d+/.exec(file)[0]);
    const full = path.join(folder, file);
    const items = JSON.parse(fs.readFileSync(full, "utf8"));
    let dirty = false;
    for (const [ref, list] of Object.entries(items)) {
      const ayah = Number(ref.split(":")[1]);
      const text = ayahWords(pack, surah, ayah).join(" ");
      for (const item of list) {
        if (item.review_status === "reviewed") continue; // a specialist approved these exact words
        const body = restoreHamza(stripHarakat(item.body_ar), text);
        const label = item.label ? restoreHamza(stripHarakat(item.label), text) : item.label;
        const logged = genLog[ref] && genLog[ref][source.field];
        const wantTier = logged && !item.model_tier ? tierOf(logged.model) : null; // tag items written before tiers existed
        if (wantTier) {
          item.model_tier = wantTier;
          dirty = true;
          changed += 1;
        }
        if (body !== item.body_ar || label !== item.label) {
          item.body_ar = body;
          if (item.label) item.label = label;
          dirty = true;
          changed += 1;
        }
      }
    }
    if (dirty && !check) fs.writeFileSync(full, `${JSON.stringify(items, null, 2)}\n`);
  }
}

console.log(`${check ? "would change" : "changed"} ${changed} item(s)`);
if (check && changed > 0) process.exitCode = 1;
