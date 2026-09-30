const fs = require("fs");
const path = require("path");

const DEFAULT_FILE = path.join(__dirname, "..", "data", "puzzles.json");
const TARGETS_PER_PUZZLE = 3;
const DISTRACTORS_PER_TARGET = 3;
const REVIEW_STATUSES = ["unreviewed", "reviewed"];

function fail(message) {
  throw new Error(`daily puzzles: ${message}`);
}

/** Small stable hash; decides where the correct option sits so every user sees the same order. */
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (const ch of text) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function isRealDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function buildTarget(puzzleId, index, raw, sentence, labels) {
  const where = `puzzle ${puzzleId}, target ${index + 1}`;
  if (!raw || typeof raw !== "object") fail(`${where}: must be an object`);
  if (!nonEmpty(raw.word)) fail(`${where}: word is required`);
  const occurrences = sentence.split(/\s+/).filter((w) => w === raw.word).length;
  if (occurrences === 0) fail(`${where}: word "${raw.word}" is not in the sentence (exact match, no added marks)`);
  if (occurrences > 1) fail(`${where}: word "${raw.word}" appears more than once in the sentence`);
  if (!nonEmpty(raw.explanation)) fail(`${where}: explanation is required`);
  if (!Array.isArray(raw.distractors) || raw.distractors.length !== DISTRACTORS_PER_TARGET) fail(`${where}: needs exactly ${DISTRACTORS_PER_TARGET} distractors`);
  const ids = [raw.correct, ...raw.distractors];
  for (const id of ids) if (!Object.prototype.hasOwnProperty.call(labels, id)) fail(`${where}: unknown label "${id}"`);
  if (new Set(ids).size !== ids.length) fail(`${where}: correct answer and distractors must be distinct`);

  const correctIndex = fnv1a(`${puzzleId}:${index}`) % (DISTRACTORS_PER_TARGET + 1);
  const options = raw.distractors.map((id) => labels[id]);
  options.splice(correctIndex, 0, labels[raw.correct]);
  return { word: raw.word, options, correctIndex, explanation: raw.explanation };
}

function validatePool(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("the file must contain an object");
  if (!isRealDate(raw.epoch)) fail(`epoch must be a real date like 2026-10-01, got "${raw.epoch}"`);
  if (!REVIEW_STATUSES.includes(raw.review_status)) fail(`review_status must be one of ${REVIEW_STATUSES.join(", ")}`);
  if (!raw.labels || typeof raw.labels !== "object") fail("labels are required");
  const texts = Object.values(raw.labels);
  if (texts.some((t) => !nonEmpty(t))) fail("every label needs text");
  if (new Set(texts).size !== texts.length) fail("two labels have the same text, so options could be ambiguous");
  if (!Array.isArray(raw.puzzles) || raw.puzzles.length === 0) fail("at least one puzzle is required");

  const seen = new Set();
  const puzzles = raw.puzzles.map((p) => {
    if (!p || !nonEmpty(p.id)) fail("every puzzle needs an id");
    if (seen.has(p.id)) fail(`duplicate puzzle id "${p.id}"`);
    seen.add(p.id);
    if (!nonEmpty(p.sentence)) fail(`puzzle ${p.id}: sentence is required`);
    if (!Array.isArray(p.targets) || p.targets.length !== TARGETS_PER_PUZZLE) fail(`puzzle ${p.id}: needs exactly ${TARGETS_PER_PUZZLE} targets`);
    return { id: p.id, sentence: p.sentence, targets: p.targets.map((t, i) => buildTarget(p.id, i, t, p.sentence, raw.labels)) };
  });
  return { epoch: raw.epoch, reviewStatus: raw.review_status, puzzles };
}

function loadPool(file = DEFAULT_FILE) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    fail(`cannot read ${file}: ${err.message}`);
  }
  return validatePool(raw);
}

module.exports = { loadPool, validatePool, fnv1a, DEFAULT_FILE };
