/**
 * Ayah annotations: tafsir, i'rab and simple explanations attached to ayat.
 *
 * Content rules (docs/plans/CONTENT_FEATURES_PLAN.md §2), enforced here:
 *  - every source names its license file, which must exist under docs/licenses;
 *  - every item carries provenance and a review status;
 *  - only `reviewed` items are served (unless the operator opts in for staging);
 *  - differing i'rab wujuh are stored as separate attributed items, never merged.
 * The store holds no content of its own: it loads whatever packs are present
 * under data/annotations and serves nothing when the folder is empty.
 *
 * Layout:  data/annotations/<source-id>/source.json
 *          data/annotations/<source-id>/surah-<n>.json   { "2:255": [ { body_ar, label?, review_status } ] }
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { AYAH_COUNTS } = require("./pack");

const KINDS = ["tafsir", "i3rab", "simple"];
const PROVENANCE = ["imported", "curated", "ai_draft"];
const REVIEW_STATUS = ["unreviewed", "reviewed", "disputed"];

const DEFAULT_DIR = path.join(__dirname, "..", "data", "annotations");
const DEFAULT_LICENSES_DIR = path.join(__dirname, "..", "..", "..", "docs", "licenses");

const isText = (v) => typeof v === "string" && v.trim().length > 0;

/** Returns a list of problems (empty = valid). Never throws on bad content. */
function validateSource(source, licensesDir) {
  const problems = [];
  const need = (cond, msg) => cond || problems.push(msg);
  need(source && typeof source === "object", "source.json must be an object");
  if (problems.length) return problems;
  need(isText(source.id) && /^[a-z0-9-]+$/.test(source.id), "id must be lowercase letters, digits, dashes");
  need(KINDS.includes(source.kind), `kind must be one of ${KINDS.join(", ")}`);
  need(isText(source.name_ar), "name_ar is required");
  need(isText(source.attribution_text), "attribution_text is required");
  need(isText(source.license), "license is required (write what the permission/terms say)");
  need(PROVENANCE.includes(source.provenance), `provenance must be one of ${PROVENANCE.join(", ")}`);
  need(isText(source.license_file), "license_file is required (saved terms or written permission)");
  if (isText(source.license_file)) {
    const safe = path.basename(source.license_file) === source.license_file;
    need(safe, "license_file must be a bare file name inside docs/licenses");
    need(safe && fs.existsSync(path.join(licensesDir, source.license_file)), `license file not found in docs/licenses: ${source.license_file}`);
  }
  if (source.provenance === "imported") {
    need(isText(source.edition), "imported sources must name the edition");
  }
  return problems;
}

function validateItems(sourceId, surah, items, source) {
  const problems = [];
  const where = (ref) => `${sourceId}/surah-${surah}.json ${ref}`;
  if (!items || typeof items !== "object" || Array.isArray(items)) return [`${sourceId}/surah-${surah}.json must be an object keyed by "surah:ayah"`];
  for (const [ref, list] of Object.entries(items)) {
    const m = /^(\d+):(\d+)$/.exec(ref);
    if (!m || Number(m[1]) !== surah || Number(m[2]) < 1 || Number(m[2]) > AYAH_COUNTS[surah - 1]) {
      problems.push(`${where(ref)}: not a valid ayah of surah ${surah}`);
      continue;
    }
    if (!Array.isArray(list) || list.length === 0) {
      problems.push(`${where(ref)}: needs a non-empty array of items`);
      continue;
    }
    if (source.kind !== "i3rab" && list.length > 1) problems.push(`${where(ref)}: only i3rab may hold several items (wujuh)`);
    list.forEach((item, i) => {
      if (!isText(item && item.body_ar)) problems.push(`${where(ref)}[${i}]: body_ar is empty`);
      if (!REVIEW_STATUS.includes(item && item.review_status)) problems.push(`${where(ref)}[${i}]: review_status must be one of ${REVIEW_STATUS.join(", ")}`);
      if (list.length > 1 && !isText(item && item.label)) problems.push(`${where(ref)}[${i}]: several wujuh need a label`);
    });
  }
  return problems;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Loads and validates every pack. Throws one error listing all problems, so a bad
 * pack stops the server (or CI) instead of silently serving unvetted content.
 */
function loadAnnotations({ dir = DEFAULT_DIR, licensesDir = DEFAULT_LICENSES_DIR, includeUnreviewed = process.env.QURAN_INCLUDE_UNREVIEWED !== "false" } = {}) {
  const sources = new Map();
  const byAyah = new Map();
  const problems = [];

  const sourceDirs = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()) : [];
  for (const entry of sourceDirs) {
    const sourceFile = path.join(dir, entry.name, "source.json");
    if (!fs.existsSync(sourceFile)) {
      problems.push(`${entry.name}: source.json is missing`);
      continue;
    }
    let source;
    try {
      source = readJson(sourceFile);
    } catch (e) {
      problems.push(`${entry.name}/source.json: ${e.message}`);
      continue;
    }
    const sourceProblems = validateSource(source, licensesDir).map((p) => `${entry.name}/source.json: ${p}`);
    if (source && source.id !== entry.name) sourceProblems.push(`${entry.name}/source.json: id must equal the folder name`);
    if (sourceProblems.length) {
      problems.push(...sourceProblems);
      continue;
    }
    const meta = {
      id: source.id,
      kind: source.kind,
      name_ar: source.name_ar,
      author_ar: source.author_ar || null,
      attribution_text: source.attribution_text,
      license: source.license,
      provenance: source.provenance,
    };
    let served = 0;
    for (const file of fs.readdirSync(path.join(dir, entry.name))) {
      const m = /^surah-(\d+)\.json$/.exec(file);
      if (!m) continue;
      const surah = Number(m[1]);
      if (surah < 1 || surah > 114) {
        problems.push(`${entry.name}/${file}: surah out of range`);
        continue;
      }
      let items;
      try {
        items = readJson(path.join(dir, entry.name, file));
      } catch (e) {
        problems.push(`${entry.name}/${file}: ${e.message}`);
        continue;
      }
      const itemProblems = validateItems(source.id, surah, items, source);
      if (itemProblems.length) {
        problems.push(...itemProblems);
        continue;
      }
      for (const [ref, list] of Object.entries(items)) {
        list.forEach((item, i) => {
          if (item.review_status !== "reviewed" && !includeUnreviewed) return;
          served += 1;
          const bucket = byAyah.get(ref) || [];
          bucket.push({
            id: `${source.id}:${ref}:${i}`,
            kind: source.kind,
            source: meta,
            label: item.label || null,
            body_ar: item.body_ar,
            review_status: item.review_status,
          });
          byAyah.set(ref, bucket);
        });
      }
    }
    if (served > 0) sources.set(source.id, { ...meta, ayat: new Set() });
  }
  if (problems.length) throw new Error(`Annotation packs are invalid:\n${problems.join("\n")}`);

  for (const [ref, list] of byAyah) for (const item of list) sources.get(item.source.id).ayat.add(ref);

  // Fingerprint of everything served, so caches (ETag) change when content changes.
  const version = crypto.createHash("sha256").update(JSON.stringify([...byAyah.entries()].sort())).digest("hex");

  return {
    version,
    includeUnreviewed,
    forAyah(surah, ayah, kind) {
      const list = byAyah.get(`${surah}:${ayah}`) || [];
      return kind ? list.filter((i) => i.kind === kind) : list;
    },
    availableKinds(surah, ayah) {
      return KINDS.filter((k) => (byAyah.get(`${surah}:${ayah}`) || []).some((i) => i.kind === k));
    },
    sources() {
      return [...sources.values()].map(({ ayat, ...meta }) => ({ ...meta, coverage: { ayat: ayat.size } }));
    },
  };
}

module.exports = { KINDS, PROVENANCE, REVIEW_STATUS, DEFAULT_DIR, loadAnnotations, validateSource, validateItems };
