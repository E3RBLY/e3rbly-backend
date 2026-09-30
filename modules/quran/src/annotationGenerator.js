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

/** i'rab only: the books already cover the meaning, so the model spends its effort on grammar. */
function buildIrabPrompt(surah, ayah, textAyah) {
  return [
    "You are an expert in classical Arabic grammar (nahw) preparing the i'rab of one Quranic ayah for an Arabic learning app. Your text is a DRAFT that will be shown with a warning and later checked by a specialist. Accuracy matters more than length; never invent.",
    "",
    `Ayah (surah ${surah}, ayah ${ayah}): ${textAyah}`,
    "",
    'Return JSON only, exactly this shape: {"i3rab":[{"label":"","body":""}]}',
    "",
    "Rules:",
    "- Analyse EVERY word of the ayah, in order. For each word give its part of speech and role, its case or mood (مرفوع/منصوب/مجرور/مجزوم/مبني) and the sign of that case (for example: وعلامة رفعه الضمة الظاهرة), and any pronoun attached to it. Then give the status of each sentence (لا محل لها / في محل ...) where relevant.",
    '- Give ONE item unless grammarians widely accept more than one wajh for a word or phrase; then give one item per wajh, each with a short "label" (for example "الوجه الأول: نعت"). With a single item leave "label" as "".',
    '- IMPORTANT: the items in "i3rab" are ALTERNATIVE complete analyses of the whole ayah, never parts of one analysis. Never make one item per word. The normal answer is exactly one item whose "body" analyses all the words one after another (separate words with a full stop).',
    "- Write in Arabic, standard grammar terminology. No markdown, no headings, no Latin letters. Omit only the vowel marks (harakat/tashkeel); KEEP every hamza and madda exactly (أ إ ؤ ئ ء آ), for example: إعراب، مضاف إليه، على آخره، رأيت، الأفعال الخمسة. Quote words of the ayah inside « » with their normal spelling.",
    "- Never change or re-quote the ayah text. Do not cite books or scholars.",
  ].join("\n");
}

/** Prompt for one ayah. The ayah text is given only so the model knows which ayah it is. */
function buildAyahPrompt(surah, ayah, textAyah, { only } = {}) {
  if (only === "i3rab") return buildIrabPrompt(surah, ayah, textAyah);
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
function validateGenerated(json, { only, wordCount } = {}) {
  if (!json || typeof json !== "object") return "not an object";
  const okText = (t) => typeof t === "string" && t.trim().length >= 10 && t.length <= MAX_TEXT && arabicRatio(t) >= 0.7;
  if (only !== "i3rab") {
    if (!okText(json.simple)) return "simple is missing, too short/long, or not Arabic";
    if (!okText(json.tafsir)) return "tafsir is missing, too short/long, or not Arabic";
  }
  if (!Array.isArray(json.i3rab) || json.i3rab.length === 0 || json.i3rab.length > 6) return "i3rab must have 1 to 6 items";
  // A lazy answer that skips words is worse than none: roughly 14+ characters per word are needed to say anything.
  const total = json.i3rab.reduce((n, w) => n + (w && typeof w.body === "string" ? w.body.length : 0), 0);
  if (wordCount && total < 14 * wordCount) return `i3rab too short for ${wordCount} words`;
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

/**
 * Models often drop hamza/madda when told to "write without tashkeel" (رايت, الاعراب, اخره). Two safe repairs:
 *  1. words quoted from the ayah inside « » are replaced by the ayah's own spelling (marks removed);
 *  2. a short table of very common grammar words gets its hamza back.
 * Anything not matched is left exactly as the model wrote it.
 */
const QURAN_MARKS = /[ۖ-ۭ࣓-ࣿ]/g;
const plainAyahWord = (w) => stripHarakat(w).replace(QURAN_MARKS, "").replace(/ٱ/g, "ا");
const looseKey = (w) =>
  plainAyahWord(w)
    .replace(/[أإآ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");

// Whole words only (never inside a longer word). Deliberately small: only forms that are always wrong without hamza.
const wholeWord = (w) => new RegExp(`(?<![\\u0621-\\u064A])${w}(?![\\u0621-\\u064A])`, "g");
const HAMZA_FIXES = [
  ["مضاف اليه", "مضاف إليه"], ["مضافا اليه", "مضافا إليه"], ["الاعراب", "الإعراب"], ["اخره", "آخره"], ["اخرها", "آخرها"],
  ["الافعال الخمسة", "الأفعال الخمسة"], ["لانه", "لأنه"], ["لانها", "لأنها"], ["الاسماء الخمسة", "الأسماء الخمسة"],
  ["اسم الاشارة", "اسم الإشارة"], ["اداة", "أداة"], ["اليه", "إليه"], ["تقديره انت", "تقديره أنت"], ["تقديره انا", "تقديره أنا"],
].map(([from, to]) => [wholeWord(from), to]);

function restoreHamza(text, ayahText = "") {
  const known = new Map();
  for (const w of ayahText.split(/\s+/).filter(Boolean)) {
    const plain = plainAyahWord(w);
    known.set(looseKey(w), plain);
    // A quote often drops the attached conjunction: «رايت» for وَرَأَيْتَ.
    if (/^[وف]/.test(plain) && plain.length > 3) known.set(looseKey(plain.slice(1)), plain.slice(1));
  }
  let out = text.replace(/«([^»]+)»/g, (whole, inner) => `«${inner.split(" ").map((w) => known.get(looseKey(w)) || w).join(" ")}»`);
  for (const [pattern, fixed] of HAMZA_FIXES) out = out.replace(pattern, fixed);
  return out;
}

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
function storeGenerated(surah, ayah, json, { dir = DEFAULT_DIR, only, model, wordCount, ayahText = "", now = () => new Date() } = {}) {
  const problem = validateGenerated(json, { only, wordCount });
  if (problem) throw new Error(`generated text rejected: ${problem}`);
  const ref = `${surah}:${ayah}`;
  const written = [];
  for (const s of DRAFT_SOURCES.filter((d) => !only || d.field === only)) {
    const file = path.join(dir, s.id, `surah-${surah}.json`);
    const items = readJsonIfExists(file);
    if ((items[ref] || []).length > 0) continue;
    items[ref] =
      s.field === "i3rab"
        ? json.i3rab.map((w) => ({ ...(w.label && w.label.trim() ? { label: restoreHamza(stripHarakat(w.label), ayahText) } : {}), body_ar: restoreHamza(stripHarakat(w.body), ayahText), review_status: "unreviewed", ...(model ? { model_tier: tierOf(model) } : {}) }))
        : [{ body_ar: restoreHamza(stripHarakat(json[s.field]), ayahText), review_status: "unreviewed", ...(model ? { model_tier: tierOf(model) } : {}) }];
    const sorted = Object.fromEntries(Object.entries(items).sort(([a], [b]) => Number(a.split(":")[1]) - Number(b.split(":")[1])));
    fs.writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
    written.push(s.field);
  }
  // Which model wrote what, so quality can be audited per model later. Not served to users.
  if (written.length && model) {
    const logFile = path.join(dir, "generation-log.json");
    const log = readJsonIfExists(logFile);
    log[ref] = { ...(log[ref] || {}), ...Object.fromEntries(written.map((k) => [k, { model, at: now().toISOString() }])) };
    const sortedLog = Object.fromEntries(Object.entries(log).sort(([a], [b]) => Number(a.split(":")[0]) - Number(b.split(":")[0]) || Number(a.split(":")[1]) - Number(b.split(":")[1])));
    fs.writeFileSync(logFile, `${JSON.stringify(sortedLog, null, 1)}\n`);
  }
  return written;
}

/** Lite models write faster and more, but with more slips; the app says so. */
const tierOf = (model) => (/lite/i.test(model || "") ? "lite" : "standard");

/** Is anything still missing for this ayah? With `only`, just that kind counts. */
function needsGeneration(surah, ayah, { only, dir = DEFAULT_DIR } = {}) {
  const have = existingKinds(surah, ayah, dir);
  return only ? !have.includes(only) : have.length < DRAFT_SOURCES.length;
}

module.exports = { tierOf, restoreHamza, stripHarakat, DRAFT_SOURCES, buildAyahPrompt, validateGenerated, ensureSources, existingKinds, needsGeneration, storeGenerated };
