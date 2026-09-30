/**
 * Builds and stores AI-draft annotations (simple explanation, meaning summary, i'rab).
 *
 * Policy (docs/licenses/ai-generated-drafts.md): drafts come from the model's own knowledge, no
 * third-party tafsir/i'rab text is sent, nothing is attributed to a scholar or book, and every
 * stored item is `ai_draft` + `unreviewed`. Existing items are never overwritten.
 */
const fs = require("fs");
const path = require("path");
const { DEFAULT_DIR } = require("./annotations");

/** The three in-house sources. Their license_file must exist in docs/licenses. */
const DRAFT_SOURCES = [
  { field: "simple", id: "ai-simple", kind: "simple", name_ar: "شرح مبسّط (مسودة بالذكاء الاصطناعي)", attribution_text: "مولَّد بالذكاء الاصطناعي ولم يُراجع بعد؛ ليس منقولًا من كتاب تفسير." },
  { field: "tafsir", id: "ai-tafsir", kind: "tafsir", name_ar: "معنى الآية مختصرًا (مسودة بالذكاء الاصطناعي)", attribution_text: "مولَّد بالذكاء الاصطناعي ولم يُراجع بعد؛ ملخّص لمعنى الآية وليس نقلًا عن مفسّر بعينه." },
  { field: "i3rab", id: "ai-irab", kind: "i3rab", name_ar: "إعراب (مسودة بالذكاء الاصطناعي)", attribution_text: "مولَّد بالذكاء الاصطناعي ولم يُراجع بعد؛ قد تختلف كتب الإعراب في بعض الأوجه." },
];

const MAX_TEXT = 2500;
const arabicRatio = (s) => {
  const letters = s.replace(/[\s\d.,:;!?()«»"'\-–—،؛؟*_]/g, "");
  if (!letters) return 0;
  return (letters.match(/[؀-ۿ]/g) || []).length / letters.length;
};

/** Prompt for one ayah. The ayah text is given only so the model knows which ayah it is. */
function buildAyahPrompt(surah, ayah, textAyah) {
  return [
    "You are helping an Arabic learning app explain one Quranic ayah. Your text is a DRAFT that will be shown with a warning and later checked by a specialist. Be accurate and careful; when unsure, be brief rather than inventive.",
    "",
    `Ayah (surah ${surah}, ayah ${ayah}): ${textAyah}`,
    "",
    "Write in Arabic and return JSON only, exactly this shape:",
    '{"simple":"","tafsir":"","i3rab":[{"label":"","body":""}]}',
    "",
    "Rules:",
    '- "simple": 1 to 3 short sentences in very easy Arabic that anyone can understand: what the ayah means and what it teaches.',
    '- "tafsir": a short summary of the meaning of the key words and the ayah, in plain Arabic. Do NOT quote or cite any book, scholar, hadith text or narrator, and do not write phrases like "قال ابن كثير". You may say "ويرى بعض المفسرين" only for a widely known difference of view.',
    '- "i3rab": the grammatical analysis (إعراب) of the ayah\'s words. Give ONE item unless grammarians widely accept more than one wajh; then give one item per wajh, each with a short "label" (for example "الوجه الأول: …"). With a single item, leave "label" as "".',
    "- Never change, correct or re-quote the ayah text. Do not add content that is not in the ayah.",
    "- No markdown, no headings, no Latin letters. Write without tashkeel (harakat); quoting a word from the ayah inside « » is fine.",
  ].join("\n");
}

/** Returns a problem string, or null when the model output is usable. */
function validateGenerated(json) {
  if (!json || typeof json !== "object") return "not an object";
  const okText = (t) => typeof t === "string" && t.trim().length >= 10 && t.length <= MAX_TEXT && arabicRatio(t) >= 0.7;
  if (!okText(json.simple)) return "simple is missing, too short/long, or not Arabic";
  if (!okText(json.tafsir)) return "tafsir is missing, too short/long, or not Arabic";
  if (!Array.isArray(json.i3rab) || json.i3rab.length === 0 || json.i3rab.length > 6) return "i3rab must have 1 to 6 items";
  for (const [i, item] of json.i3rab.entries()) {
    if (!item || !okText(item.body)) return `i3rab[${i}].body is missing, too short/long, or not Arabic`;
    if (json.i3rab.length > 1 && !(typeof item.label === "string" && item.label.trim())) return `i3rab[${i}] needs a label when there are several wujuh`;
  }
  return null;
}

/**
 * Explanations are plain prose: the model's own tashkeel is where its slips show (for example a wrong
 * vowel), so generated text is stored without harakat. The Quran text itself is never touched.
 */
const stripHarakat = (s) => s.replace(/[ً-ْٰـ]/g, "").replace(/\s{2,}/g, " ").trim();

function readJsonIfExists(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

/** Creates the three source folders (source.json) if missing. Existing files are left untouched. */
function ensureSources({ dir = DEFAULT_DIR, licenseFile = "ai-generated-drafts.md" } = {}) {
  for (const s of DRAFT_SOURCES) {
    const folder = path.join(dir, s.id);
    fs.mkdirSync(folder, { recursive: true });
    const file = path.join(folder, "source.json");
    if (fs.existsSync(file)) continue;
    const { field, ...meta } = s;
    void field;
    fs.writeFileSync(file, `${JSON.stringify({ ...meta, license: "In-house AI draft; no third-party text used (docs/licenses/ai-generated-drafts.md)", license_file: licenseFile, provenance: "ai_draft" }, null, 2)}\n`);
  }
}

/** Which of the three kinds already exist for this ayah. */
function existingKinds(surah, ayah, dir = DEFAULT_DIR) {
  const ref = `${surah}:${ayah}`;
  return DRAFT_SOURCES.filter((s) => (readJsonIfExists(path.join(dir, s.id, `surah-${surah}.json`))[ref] || []).length > 0).map((s) => s.field);
}

/**
 * Stores one generated ayah. Never overwrites: a kind that already has text (drafted, imported or
 * reviewed) for this ayah is skipped. Returns the kinds it wrote.
 */
function storeGenerated(surah, ayah, json, { dir = DEFAULT_DIR } = {}) {
  const problem = validateGenerated(json);
  if (problem) throw new Error(`generated text rejected: ${problem}`);
  const ref = `${surah}:${ayah}`;
  const written = [];
  for (const s of DRAFT_SOURCES) {
    const file = path.join(dir, s.id, `surah-${surah}.json`);
    const items = readJsonIfExists(file);
    if ((items[ref] || []).length > 0) continue;
    items[ref] =
      s.field === "i3rab"
        ? json.i3rab.map((w) => ({ ...(w.label && w.label.trim() ? { label: stripHarakat(w.label) } : {}), body_ar: stripHarakat(w.body), review_status: "unreviewed" }))
        : [{ body_ar: stripHarakat(json[s.field]), review_status: "unreviewed" }];
    const sorted = Object.fromEntries(Object.entries(items).sort(([a], [b]) => Number(a.split(":")[1]) - Number(b.split(":")[1])));
    fs.writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
    written.push(s.field);
  }
  return written;
}

module.exports = { stripHarakat, DRAFT_SOURCES, buildAyahPrompt, validateGenerated, ensureSources, existingKinds, storeGenerated };
