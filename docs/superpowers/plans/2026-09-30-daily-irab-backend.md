# Daily I'rab Backend Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve one curated i'rab puzzle per day, identical for every user, from a new isolated backend module `modules/daily`, at `GET /v1/daily/today`.

**Architecture:** A JSON pool of sentences (labels + puzzles) is validated at load; the puzzle of the day is a deterministic pick from the pool by day number (day boundary fixed at UTC+3). No database, no AI, no auth. The module mirrors `modules/quran` (own `src/`, `data/`, `tests/`, mounted from `server.js` with its own rate limiter and error envelope).

**Tech Stack:** Node, Express, jest + supertest (same as the rest of the backend).

**Spec:** `docs/superpowers/specs/2026-09-30-kids-letters-and-daily-irab-design.md` (Part B). This is plan 1 of 3. Plan 2 (Daily I'rab mobile: `StreakEngine`, tree, share card, reminder, UI) and plan 3 (Kids' Letter Magic) are written after this one ships, because plan 2 depends on the response contract fixed here.

## Global Constraints

- Module is isolated: it may import `src/middleware/rateLimit` only (as `modules/quran` does); it must not change any `/api` route or legacy code.
- Public, read-only, no AI, no user data, no auth (`/v1/daily`).
- Day boundary is a **fixed UTC+3** (no DST), documented in the response as `expiresAt`.
- Errors use the module envelope `{ "error": { "code", "message" } }`.
- Every puzzle has exactly **3 targets**, each with **1 correct + 3 distractors** (4 options), a non-empty explanation.
- The pool is shipped `review_status: "unreviewed"` and the response says so; content is never described as scholar-checked.
- Nothing is pushed to `main` (auto-deploys production) without the owner's go.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A request one second before vs. exactly at local midnight (UTC+3) must return day N vs. N+1 (Task 2).
- A pool shorter than the number of elapsed days must cycle, not crash or return `undefined` (Task 2).
- A target word that does not appear in the sentence, appears twice, or differs by a diacritic/tatweel must be rejected at load, so a broken pool stops the server from starting instead of serving a puzzle that can't be answered (Task 1).
- `Cache-Control` must never let a client or CDN keep yesterday's puzzle past midnight (max-age capped at seconds left) (Task 3).
- Flooding the endpoint returns the module's 429 envelope, and unknown `/v1/daily/*` paths return the module's 404 envelope, not the legacy shape (Task 3).

---

## File structure

| File | Responsibility |
|---|---|
| `modules/daily/data/puzzles.json` | `{ epoch, review_status, labels, puzzles[] }` content |
| `modules/daily/src/puzzles.js` | `loadPool(file?)`, `validatePool(raw)`: validate + build options with deterministic answer position |
| `modules/daily/src/schedule.js` | `todaysPuzzle(pool, nowMs)`: day number, local date, expiry, pick |
| `modules/daily/src/router.js` | `createDailyRouter(pool, { now })` |
| `modules/daily/src/mount.js` | `mountDaily(app, opts)`: rate limiter + router + 404 envelope |
| `modules/daily/scripts/validate-puzzles.js` | CLI: validate, print count, `--min N` launch gate |
| `modules/daily/tests/{puzzles,schedule,router}.test.js`, `tests/fixtures.js` | tests |
| `tests/integration/dailyMount.test.js` | mounted in real `server.js` |
| `docs/ENDPOINTS.md` (modify), `package.json` (modify), `server.js` (modify) | docs, script, mount |

---

### Task 1: Pool format, loader and validator

**Files:**
- Create: `modules/daily/data/puzzles.json`, `modules/daily/src/puzzles.js`, `modules/daily/tests/fixtures.js`, `modules/daily/tests/puzzles.test.js`

**Interfaces:**
- Produces: `loadPool(file = DEFAULT_FILE) -> Pool`, `validatePool(raw) -> Pool`, where
  `Pool = { epoch: "YYYY-MM-DD", reviewStatus: "unreviewed"|"reviewed", puzzles: Puzzle[] }`,
  `Puzzle = { id: string, sentence: string, targets: Target[3] }`,
  `Target = { word: string, options: string[4], correctIndex: 0..3, explanation: string }`.
  Also `fnv1a(str) -> uint32` (exported for tests). Any invalid input throws `Error` whose message starts with `daily puzzles:`.
- Raw format: `puzzles[i].targets[j] = { word, correct: labelId, distractors: [labelId x3], explanation }`; `labels` maps `labelId -> Arabic text`.

- [ ] **Step 1: Write the test fixture builder**

`modules/daily/tests/fixtures.js`:

```js
/** A small valid raw pool; tests copy it and break one thing at a time. */
function rawPool(overrides = {}) {
  const labels = { a: "فاعل مرفوع وعلامة رفعه الضمة", b: "مفعول به منصوب وعلامة نصبه الفتحة", c: "مبتدأ مرفوع وعلامة رفعه الضمة", d: "مضاف إليه مجرور وعلامة جره الكسرة", e: "فعل ماض مبني على الفتح", f: "نعت مرفوع وعلامة رفعه الضمة" };
  const puzzle = (id) => ({
    id,
    sentence: "قرأ الطالب الدرس",
    targets: [
      { word: "قرأ", correct: "e", distractors: ["a", "b", "d"], explanation: "قرأ فعل ماض مبني على الفتح." },
      { word: "الطالب", correct: "a", distractors: ["b", "d", "e"], explanation: "الطالب هو من قام بالقراءة فهو فاعل." },
      { word: "الدرس", correct: "b", distractors: ["a", "c", "d"], explanation: "الدرس وقع عليه فعل القراءة فهو مفعول به." },
    ],
  });
  return { epoch: "2026-10-01", review_status: "unreviewed", labels, puzzles: [puzzle("t-001"), puzzle("t-002"), puzzle("t-003")], ...overrides };
}

module.exports = { rawPool };
```

- [ ] **Step 2: Write the failing tests**

`modules/daily/tests/puzzles.test.js`:

```js
const { validatePool, loadPool, fnv1a } = require("../src/puzzles");
const { rawPool } = require("./fixtures");

const clone = (o) => JSON.parse(JSON.stringify(o));
const broken = (mutate) => {
  const raw = rawPool();
  mutate(raw);
  return raw;
};

describe("validatePool: a valid pool", () => {
  test("builds 4 options per target with the correct one at correctIndex", () => {
    const pool = validatePool(rawPool());
    expect(pool.puzzles).toHaveLength(3);
    for (const puzzle of pool.puzzles) {
      expect(puzzle.targets).toHaveLength(3);
      for (const t of puzzle.targets) {
        expect(t.options).toHaveLength(4);
        expect(new Set(t.options).size).toBe(4);
        expect(t.correctIndex).toBeGreaterThanOrEqual(0);
        expect(t.correctIndex).toBeLessThan(4);
      }
    }
    const raw = rawPool();
    const first = pool.puzzles[0].targets[1];
    expect(first.options[first.correctIndex]).toBe(raw.labels.a);
  });

  test("answer position is deterministic (same input, same output) and not always the same slot", () => {
    expect(validatePool(rawPool())).toEqual(validatePool(rawPool()));
    const positions = new Set(validatePool(rawPool()).puzzles.flatMap((p) => p.targets.map((t) => t.correctIndex)));
    expect(positions.size).toBeGreaterThan(1);
    expect(fnv1a("t-001:0")).toBe(fnv1a("t-001:0"));
  });

  test("exposes epoch and review status", () => {
    const pool = validatePool(rawPool());
    expect(pool.epoch).toBe("2026-10-01");
    expect(pool.reviewStatus).toBe("unreviewed");
  });
});

describe("validatePool: rejects a pool that could not be answered", () => {
  test.each([
    ["bad epoch", (r) => { r.epoch = "2026-13-40"; }, /epoch/],
    ["bad review_status", (r) => { r.review_status = "maybe"; }, /review_status/],
    ["no puzzles", (r) => { r.puzzles = []; }, /at least one puzzle/],
    ["duplicate puzzle id", (r) => { r.puzzles[1].id = r.puzzles[0].id; }, /duplicate puzzle id/],
    ["empty sentence", (r) => { r.puzzles[0].sentence = " "; }, /sentence/],
    ["two targets only", (r) => { r.puzzles[0].targets.pop(); }, /exactly 3 targets/],
    ["target word not in sentence", (r) => { r.puzzles[0].targets[0].word = "كتب"; }, /not in the sentence/],
    ["target word differs by a diacritic", (r) => { r.puzzles[0].targets[1].word = "الطَّالب"; }, /not in the sentence/],
    ["target word with tatweel", (r) => { r.puzzles[0].targets[1].word = "الطـالب"; }, /not in the sentence/],
    ["target word appears twice in the sentence", (r) => { r.puzzles[0].sentence = "قرأ الطالب الطالب الدرس"; }, /more than once/],
    ["unknown correct label", (r) => { r.puzzles[0].targets[0].correct = "zzz"; }, /unknown label/],
    ["unknown distractor label", (r) => { r.puzzles[0].targets[0].distractors[0] = "zzz"; }, /unknown label/],
    ["only two distractors", (r) => { r.puzzles[0].targets[0].distractors.pop(); }, /exactly 3 distractors/],
    ["duplicate distractor", (r) => { r.puzzles[0].targets[0].distractors[1] = r.puzzles[0].targets[0].distractors[0]; }, /distinct/],
    ["distractor equals the correct answer", (r) => { r.puzzles[0].targets[0].distractors[0] = "e"; }, /distinct/],
    ["two labels with identical text (ambiguous options)", (r) => { r.labels.f = r.labels.a; }, /same text/],
    ["empty explanation", (r) => { r.puzzles[0].targets[0].explanation = ""; }, /explanation/],
  ])("%s", (_name, mutate, message) => {
    expect(() => validatePool(broken(mutate))).toThrow(message);
    expect(() => validatePool(broken(mutate))).toThrow(/^daily puzzles:/);
  });

  test("non-object input", () => {
    expect(() => validatePool(null)).toThrow(/^daily puzzles:/);
    expect(() => validatePool("x")).toThrow(/^daily puzzles:/);
  });
});

describe("loadPool: the shipped file", () => {
  test("loads and validates, and every sentence is Arabic", () => {
    const pool = loadPool();
    expect(pool.puzzles.length).toBeGreaterThanOrEqual(6);
    for (const p of pool.puzzles) expect(p.sentence).toMatch(/[؀-ۿ]/);
  });

  test("a missing or malformed file throws (so the server refuses to start)", () => {
    expect(() => loadPool("/no/such/file.json")).toThrow(/^daily puzzles:/);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest modules/daily/tests/puzzles.test.js`
Expected: FAIL, `Cannot find module '../src/puzzles'`.

- [ ] **Step 4: Write the implementation**

`modules/daily/src/puzzles.js`:

```js
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
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
```

- [ ] **Step 5: Write the starter content**

`modules/daily/data/puzzles.json` (labels are a shared vocabulary; distractors are chosen so exactly one option is grammatically right for that word):

```json
{
  "epoch": "2026-10-01",
  "review_status": "unreviewed",
  "labels": {
    "past_verb": "فعل ماض مبني على الفتح",
    "present_verb": "فعل مضارع مرفوع وعلامة رفعه الضمة",
    "subject": "فاعل مرفوع وعلامة رفعه الضمة",
    "subject_plural": "فاعل مرفوع وعلامة رفعه الواو لأنه جمع مذكر سالم",
    "object": "مفعول به منصوب وعلامة نصبه الفتحة",
    "mubtada": "مبتدأ مرفوع وعلامة رفعه الضمة",
    "khabar": "خبر مرفوع وعلامة رفعه الضمة",
    "khabar_mudaf": "خبر مرفوع وعلامة رفعه الضمة وهو مضاف",
    "majrur": "اسم مجرور وعلامة جره الكسرة",
    "mudaf_ilayh": "مضاف إليه مجرور وعلامة جره الكسرة",
    "adverb_time": "ظرف زمان منصوب وعلامة نصبه الفتحة",
    "hal": "حال منصوب وعلامة نصبه الفتحة",
    "naat": "نعت مرفوع وعلامة رفعه الضمة",
    "inna": "حرف توكيد ونصب مبني على الفتح",
    "inna_noun": "اسم إن منصوب وعلامة نصبه الفتحة",
    "inna_khabar": "خبر إن مرفوع وعلامة رفعه الضمة",
    "demonstrative": "اسم إشارة مبني في محل رفع مبتدأ",
    "preposition": "حرف جر مبني على السكون"
  },
  "puzzles": [
    {
      "id": "d-001",
      "sentence": "ذهب الولد إلى المدرسة",
      "targets": [
        { "word": "ذهب", "correct": "past_verb", "distractors": ["present_verb", "naat", "subject"], "explanation": "ذهب فعل يدل على حدث انتهى في الماضي، فهو فعل ماض مبني على الفتح." },
        { "word": "الولد", "correct": "subject", "distractors": ["object", "mudaf_ilayh", "hal"], "explanation": "الولد هو من قام بالذهاب، فهو الفاعل ويأتي مرفوعا." },
        { "word": "المدرسة", "correct": "majrur", "distractors": ["subject", "object", "mubtada"], "explanation": "المدرسة جاءت بعد حرف الجر إلى، وما بعد حرف الجر يكون مجرورا." }
      ]
    },
    {
      "id": "d-002",
      "sentence": "قرأ الطالب الدرس",
      "targets": [
        { "word": "قرأ", "correct": "past_verb", "distractors": ["present_verb", "khabar", "naat"], "explanation": "قرأ فعل ماض مبني على الفتح." },
        { "word": "الطالب", "correct": "subject", "distractors": ["object", "mubtada", "mudaf_ilayh"], "explanation": "الطالب هو من قام بالقراءة، فهو الفاعل المرفوع." },
        { "word": "الدرس", "correct": "object", "distractors": ["subject", "mubtada", "mudaf_ilayh"], "explanation": "الدرس وقع عليه فعل القراءة، فهو مفعول به منصوب." }
      ]
    },
    {
      "id": "d-003",
      "sentence": "الطقس جميل اليوم",
      "targets": [
        { "word": "الطقس", "correct": "mubtada", "distractors": ["subject", "object", "mudaf_ilayh"], "explanation": "الطقس اسم في أول الجملة الاسمية يُخبر عنه، فهو مبتدأ مرفوع." },
        { "word": "جميل", "correct": "khabar", "distractors": ["object", "hal", "mudaf_ilayh"], "explanation": "جميل هو ما أكمل معنى المبتدأ، فهو خبر مرفوع." },
        { "word": "اليوم", "correct": "adverb_time", "distractors": ["subject", "khabar", "mudaf_ilayh"], "explanation": "اليوم يدل على زمن وقوع الوصف، فهو ظرف زمان منصوب." }
      ]
    },
    {
      "id": "d-004",
      "sentence": "إن العلم نور",
      "targets": [
        { "word": "إن", "correct": "inna", "distractors": ["preposition", "past_verb", "demonstrative"], "explanation": "إن حرف يفيد التوكيد وينصب المبتدأ اسما له ويرفع الخبر." },
        { "word": "العلم", "correct": "inna_noun", "distractors": ["subject", "mubtada", "mudaf_ilayh"], "explanation": "العلم جاء بعد إن مباشرة، فهو اسمها وهو منصوب." },
        { "word": "نور", "correct": "inna_khabar", "distractors": ["object", "mubtada", "hal"], "explanation": "نور أكمل معنى الجملة بعد اسم إن، فهو خبرها المرفوع." }
      ]
    },
    {
      "id": "d-005",
      "sentence": "كتب المعلمون الدرس",
      "targets": [
        { "word": "كتب", "correct": "past_verb", "distractors": ["present_verb", "khabar", "naat"], "explanation": "كتب فعل ماض مبني على الفتح." },
        { "word": "المعلمون", "correct": "subject_plural", "distractors": ["subject", "object", "mubtada"], "explanation": "المعلمون هم من قاموا بالكتابة، فهم فاعل مرفوع، وعلامة رفعه الواو لأنه جمع مذكر سالم." },
        { "word": "الدرس", "correct": "object", "distractors": ["subject", "khabar", "mudaf_ilayh"], "explanation": "الدرس وقعت عليه الكتابة، فهو مفعول به منصوب." }
      ]
    },
    {
      "id": "d-006",
      "sentence": "هذا كتاب المعلم",
      "targets": [
        { "word": "هذا", "correct": "demonstrative", "distractors": ["inna", "past_verb", "preposition"], "explanation": "هذا اسم إشارة مبني، ومحله الرفع لأنه مبتدأ." },
        { "word": "كتاب", "correct": "khabar_mudaf", "distractors": ["subject", "object", "mudaf_ilayh"], "explanation": "كتاب أكمل معنى اسم الإشارة فهو خبر مرفوع، وجاء بعده اسم يضاف إليه فهو مضاف." },
        { "word": "المعلم", "correct": "mudaf_ilayh", "distractors": ["khabar", "object", "hal"], "explanation": "المعلم جاء بعد اسم يضاف إليه (كتاب)، فهو مضاف إليه مجرور." }
      ]
    }
  ]
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest modules/daily/tests/puzzles.test.js`
Expected: all PASS. If the shipped-file test reports an unknown label or word mismatch, fix the JSON, never the validator.

- [ ] **Step 7: Commit**

```bash
git add modules/daily
git commit -m "feat(daily): puzzle pool format, validator and six starter puzzles

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Day schedule

**Files:**
- Create: `modules/daily/src/schedule.js`, `modules/daily/tests/schedule.test.js`

**Interfaces:**
- Consumes: `Pool` from Task 1 (`epoch`, `puzzles`).
- Produces: `todaysPuzzle(pool, nowMs) -> { dayNumber: number, date: "YYYY-MM-DD", expiresAt: ISO string, puzzle: Puzzle }`. `dayNumber >= 1`. Constants `OFFSET_MS` (3 h) and `DAY_MS` exported.

- [ ] **Step 1: Write the failing tests**

`modules/daily/tests/schedule.test.js`:

```js
const { todaysPuzzle, DAY_MS } = require("../src/schedule");
const { validatePool } = require("../src/puzzles");
const { rawPool } = require("./fixtures");

const pool = validatePool(rawPool()); // epoch 2026-10-01, 3 puzzles
const at = (iso) => Date.parse(iso);

describe("todaysPuzzle: the day changes at midnight UTC+3", () => {
  test("first local second of the epoch day is day 1", () => {
    const t = todaysPuzzle(pool, at("2026-09-30T21:00:00Z")); // 00:00 UTC+3 on 2026-10-01
    expect(t.dayNumber).toBe(1);
    expect(t.date).toBe("2026-10-01");
    expect(t.puzzle.id).toBe("t-001");
  });

  test("one second before local midnight is still the same day; the next second is the next day", () => {
    const before = todaysPuzzle(pool, at("2026-10-01T20:59:59Z"));
    const after = todaysPuzzle(pool, at("2026-10-01T21:00:00Z"));
    expect(before.dayNumber).toBe(1);
    expect(before.date).toBe("2026-10-01");
    expect(after.dayNumber).toBe(2);
    expect(after.date).toBe("2026-10-02");
    expect(after.puzzle.id).toBe("t-002");
  });

  test("expiresAt is the next local midnight, and it is the moment the day changes", () => {
    const t = todaysPuzzle(pool, at("2026-10-01T12:00:00Z"));
    expect(t.expiresAt).toBe("2026-10-01T21:00:00.000Z");
    expect(todaysPuzzle(pool, Date.parse(t.expiresAt) - 1).dayNumber).toBe(t.dayNumber);
    expect(todaysPuzzle(pool, Date.parse(t.expiresAt)).dayNumber).toBe(t.dayNumber + 1);
  });

  test("everyone asking during the same local day gets the same puzzle", () => {
    const a = todaysPuzzle(pool, at("2026-10-05T00:00:00Z"));
    const b = todaysPuzzle(pool, at("2026-10-05T20:59:59Z"));
    expect(a).toEqual(b);
  });
});

describe("todaysPuzzle: pool cycling and edge cases", () => {
  test("cycles when the pool is shorter than the elapsed days", () => {
    expect(todaysPuzzle(pool, at("2026-10-03T12:00:00Z")).puzzle.id).toBe("t-003"); // day 3
    expect(todaysPuzzle(pool, at("2026-10-04T12:00:00Z")).puzzle.id).toBe("t-001"); // day 4 wraps
    expect(todaysPuzzle(pool, at("2027-10-01T12:00:00Z")).puzzle).toBeDefined();
  });

  test("a one-puzzle pool always returns that puzzle", () => {
    const one = validatePool({ ...rawPool(), puzzles: [rawPool().puzzles[0]] });
    expect(todaysPuzzle(one, at("2030-01-01T00:00:00Z")).puzzle.id).toBe("t-001");
  });

  test("before the epoch it serves day 1 (never day 0 or negative) but reports the real date", () => {
    const t = todaysPuzzle(pool, at("2026-09-01T12:00:00Z"));
    expect(t.dayNumber).toBe(1);
    expect(t.date).toBe("2026-09-01");
    expect(t.puzzle.id).toBe("t-001");
  });

  test("DAY_MS is one day", () => {
    expect(DAY_MS).toBe(86400000);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest modules/daily/tests/schedule.test.js`
Expected: FAIL, `Cannot find module '../src/schedule'`.

- [ ] **Step 3: Implement**

`modules/daily/src/schedule.js`:

```js
const DAY_MS = 86_400_000;
/** Fixed UTC+3 (Riyadh/Baghdad, no daylight saving) so the day boundary never moves. */
const OFFSET_MS = 3 * 3_600_000;

function localDay(nowMs) {
  return Math.floor((nowMs + OFFSET_MS) / DAY_MS);
}

/** The puzzle for the local day containing `nowMs`; the same for every caller. */
function todaysPuzzle(pool, nowMs) {
  const day = localDay(nowMs);
  const epochDay = Math.floor(Date.parse(`${pool.epoch}T00:00:00Z`) / DAY_MS);
  const dayNumber = Math.max(1, day - epochDay + 1);
  return {
    dayNumber,
    date: new Date(day * DAY_MS).toISOString().slice(0, 10),
    expiresAt: new Date((day + 1) * DAY_MS - OFFSET_MS).toISOString(),
    puzzle: pool.puzzles[(dayNumber - 1) % pool.puzzles.length],
  };
}

module.exports = { todaysPuzzle, DAY_MS, OFFSET_MS };
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest modules/daily/tests/schedule.test.js`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add modules/daily/src/schedule.js modules/daily/tests/schedule.test.js
git commit -m "feat(daily): deterministic day schedule with fixed UTC+3 boundary

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Endpoint, mounting, docs

**Files:**
- Create: `modules/daily/src/router.js`, `modules/daily/src/mount.js`, `modules/daily/tests/router.test.js`, `tests/integration/dailyMount.test.js`
- Modify: `server.js` (add require near line 13 and `mountDaily(app);` after `mountQuran(app);` at line 79), `docs/ENDPOINTS.md` (append a "Daily I'rab" section)

**Interfaces:**
- Consumes: `validatePool`/`loadPool` (Task 1), `todaysPuzzle` (Task 2), `createRateLimiter` from `src/middleware/rateLimit` (same options as `modules/quran/src/mount.js`: `{ name, windowMs, max }`).
- Produces: `createDailyRouter(pool, { now = Date.now }) -> express.Router`; `mountDaily(app, { pool = loadPool(), now, maxPerMinute = env RATE_LIMIT_DAILY_PER_MIN || 120 }) -> app`.
- Response contract of `GET /v1/daily/today` (plan 2 depends on it):

```json
{
  "dayNumber": 1,
  "date": "2026-10-01",
  "expiresAt": "2026-10-01T21:00:00.000Z",
  "reviewStatus": "unreviewed",
  "notice": "أسئلة اليوم قيد المراجعة اللغوية وقد تحتوي على أخطاء.",
  "puzzle": {
    "id": "d-001",
    "sentence": "ذهب الولد إلى المدرسة",
    "targets": [{ "word": "ذهب", "options": ["...", "...", "...", "..."], "correctIndex": 2, "explanation": "..." }]
  }
}
```
`notice` is present only when `reviewStatus` is `unreviewed`.

- [ ] **Step 1: Write the failing router tests**

`modules/daily/tests/router.test.js`:

```js
const express = require("express");
const request = require("supertest");
const { mountDaily } = require("../src/mount");
const { validatePool } = require("../src/puzzles");
const { rawPool } = require("./fixtures");

const pool = validatePool(rawPool());
const build = (now, extra = {}) => mountDaily(express(), { pool, now: () => now, ...extra });

describe("GET /v1/daily/today", () => {
  test("returns the day's puzzle in the documented shape", async () => {
    const res = await request(build(Date.parse("2026-10-01T12:00:00Z"))).get("/v1/daily/today");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ dayNumber: 1, date: "2026-10-01", expiresAt: "2026-10-01T21:00:00.000Z", reviewStatus: "unreviewed" });
    expect(res.body.notice).toMatch(/مراجعة/);
    expect(res.body.puzzle.id).toBe("t-001");
    expect(res.body.puzzle.targets).toHaveLength(3);
    const t = res.body.puzzle.targets[0];
    expect(Object.keys(t).sort()).toEqual(["correctIndex", "explanation", "options", "word"]);
    expect(t.options).toHaveLength(4);
  });

  test("is public: no auth header needed, and no notice once reviewed", async () => {
    const reviewed = validatePool({ ...rawPool(), review_status: "reviewed" });
    const app = mountDaily(express(), { pool: reviewed, now: () => Date.parse("2026-10-01T12:00:00Z") });
    const res = await request(app).get("/v1/daily/today");
    expect(res.status).toBe(200);
    expect(res.body.reviewStatus).toBe("reviewed");
    expect(res.body.notice).toBeUndefined();
  });

  test("Cache-Control never outlives the day", async () => {
    const early = await request(build(Date.parse("2026-10-01T10:00:00Z"))).get("/v1/daily/today");
    expect(early.headers["cache-control"]).toBe("public, max-age=300");
    const late = await request(build(Date.parse("2026-10-01T20:59:30Z"))).get("/v1/daily/today"); // 30 s left
    expect(late.headers["cache-control"]).toBe("public, max-age=30");
  });

  test("the next second serves the next day's puzzle", async () => {
    const res = await request(build(Date.parse("2026-10-01T21:00:00Z"))).get("/v1/daily/today");
    expect(res.body.dayNumber).toBe(2);
    expect(res.body.puzzle.id).toBe("t-002");
  });
});

describe("module envelope", () => {
  test("unknown paths and non-GET methods answer with the module envelope", async () => {
    const app = build(Date.parse("2026-10-01T12:00:00Z"));
    const missing = await request(app).get("/v1/daily/yesterday");
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: { code: "NOT_FOUND", message: "Route not found." } });
    const post = await request(app).post("/v1/daily/today");
    expect(post.status).toBe(404);
    expect(post.body.error.code).toBe("NOT_FOUND");
  });

  test("flooding returns 429 in the module envelope", async () => {
    const app = build(Date.parse("2026-10-01T12:00:00Z"), { maxPerMinute: 2 });
    await request(app).get("/v1/daily/today");
    await request(app).get("/v1/daily/today");
    const res = await request(app).get("/v1/daily/today");
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  });
});
```

`tests/integration/dailyMount.test.js`:

```js
const request = require("supertest");
const app = require("../../server");

describe("/v1/daily is mounted in the main app without touching /api or /v1/quran", () => {
  test("serves today's puzzle publicly", async () => {
    const res = await request(app).get("/v1/daily/today");
    expect(res.status).toBe(200);
    expect(res.body.puzzle.targets).toHaveLength(3);
    expect(res.body.dayNumber).toBeGreaterThanOrEqual(1);
  });

  test("existing routes are unaffected", async () => {
    expect((await request(app).get("/v1/quran/ayat/112/2")).status).toBe(200);
    expect((await request(app).get("/health")).body).toEqual({ status: "ok" });
    expect((await request(app).get("/api/grammar/concept-types")).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest modules/daily/tests/router.test.js tests/integration/dailyMount.test.js`
Expected: FAIL, `Cannot find module '../src/mount'`.

- [ ] **Step 3: Implement router and mount**

`modules/daily/src/router.js`:

```js
const express = require("express");
const { todaysPuzzle } = require("./schedule");

const UNREVIEWED_NOTICE = "أسئلة اليوم قيد المراجعة اللغوية وقد تحتوي على أخطاء.";
const MAX_CACHE_SECONDS = 300;

function createDailyRouter(pool, { now = () => Date.now() } = {}) {
  const router = express.Router();

  router.get("/today", (req, res) => {
    const nowMs = now();
    const today = todaysPuzzle(pool, nowMs);
    const secondsLeft = Math.max(0, Math.floor((Date.parse(today.expiresAt) - nowMs) / 1000));
    res.set("Cache-Control", `public, max-age=${Math.min(MAX_CACHE_SECONDS, secondsLeft)}`);
    res.json({
      dayNumber: today.dayNumber,
      date: today.date,
      expiresAt: today.expiresAt,
      reviewStatus: pool.reviewStatus,
      ...(pool.reviewStatus === "unreviewed" ? { notice: UNREVIEWED_NOTICE } : {}),
      puzzle: today.puzzle,
    });
  });

  router.use((req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } }));
  return router;
}

module.exports = { createDailyRouter };
```

`modules/daily/src/mount.js`:

```js
const { createRateLimiter } = require("../../../src/middleware/rateLimit");
const { loadPool } = require("./puzzles");
const { createDailyRouter } = require("./router");

/** Reuse the shared per-IP limiter, but answer in this module's error envelope. */
function envelopeLimiter(options) {
  const limiter = createRateLimiter(options);
  return (req, res, next) => {
    const json = res.json.bind(res);
    res.json = (body) => json(body && body.code === "RATE_LIMITED" ? { error: { code: body.code, message: body.error } } : body);
    limiter(req, res, () => {
      res.json = json;
      next();
    });
  };
}

/** Mount /v1/daily. Loading validates the whole pool, so a broken file stops the server from starting. */
function mountDaily(app, { pool = loadPool(), now, maxPerMinute = Number.parseInt(process.env.RATE_LIMIT_DAILY_PER_MIN, 10) || 120 } = {}) {
  app.use("/v1/daily", envelopeLimiter({ name: "daily", windowMs: 60_000, max: maxPerMinute }), createDailyRouter(pool, { ...(now ? { now } : {}) }));
  return app;
}

module.exports = { mountDaily };
```

- [ ] **Step 4: Wire into `server.js`**

Add after the existing `const { mountQuran } = ...` line:

```js
const { mountDaily } = require("./modules/daily/src/mount");
```

and after `mountQuran(app);`:

```js
// --- Daily i'rab puzzle (read-only, public, no AI): modules/daily ---
mountDaily(app);
```

- [ ] **Step 5: Run to verify pass**

Run: `npx jest modules/daily tests/integration/dailyMount.test.js`
Expected: all PASS. If the 429 test fails because `createRateLimiter` keys by IP with a shared store across tests, give each test app a unique `name` (mirror how `modules/quran/tests/quranApi.test.js` isolates its limiter) and re-run.

- [ ] **Step 6: Document the endpoint**

Append to `docs/ENDPOINTS.md` a "Daily I'rab" section containing: the route, "public, no auth, no AI", the response contract from this task's Interfaces block, the UTC+3 day-boundary rule, the cache rule (`max-age` = min(300, seconds until `expiresAt`)), error envelope, `RATE_LIMIT_DAILY_PER_MIN` (default 120), and the `unreviewed` notice meaning.

- [ ] **Step 7: Commit**

```bash
git add modules/daily tests/integration/dailyMount.test.js server.js docs/ENDPOINTS.md
git commit -m "feat(daily): GET /v1/daily/today with rate limit, cache cap and module envelope

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Validation script, launch gate and content growth

**Files:**
- Create: `modules/daily/scripts/validate-puzzles.js`, `docs/DAILY_CONTENT_GUIDE.md`
- Modify: `package.json` (add `"validate:daily": "node modules/daily/scripts/validate-puzzles.js"`), `modules/daily/data/puzzles.json` (grow to 60), `docs/PROGRESS.md`

**Interfaces:**
- Consumes: `loadPool` (Task 1).
- Produces: CLI `npm run -s validate:daily [-- --min N]`: prints `daily puzzles OK: <n> puzzle(s), review_status <status>`; exit 1 with the validator's message on an invalid pool, or `only <n> puzzle(s), launch needs <N>` when `--min` is not met.

- [ ] **Step 1: Write the script**

`modules/daily/scripts/validate-puzzles.js`:

```js
#!/usr/bin/env node
const { loadPool } = require("../src/puzzles");

const minIndex = process.argv.indexOf("--min");
const min = minIndex > -1 ? Number.parseInt(process.argv[minIndex + 1], 10) : 0;

try {
  const pool = loadPool();
  if (pool.puzzles.length < min) {
    console.error(`daily puzzles: only ${pool.puzzles.length} puzzle(s), launch needs ${min}`);
    process.exit(1);
  }
  console.log(`daily puzzles OK: ${pool.puzzles.length} puzzle(s), review_status ${pool.reviewStatus}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
```

- [ ] **Step 2: Verify the script**

Run: `npm pkg set scripts.validate:daily="node modules/daily/scripts/validate-puzzles.js"` then `npm run -s validate:daily`
Expected: `daily puzzles OK: 6 puzzle(s), review_status unreviewed`.
Run: `npm run -s validate:daily -- --min 60`
Expected: exit code 1, `only 6 puzzle(s), launch needs 60`.

- [ ] **Step 3: Write the content guide**

`docs/DAILY_CONTENT_GUIDE.md` must state, in this order: (1) sentence rules: 3-6 words, unvocalised, no ambiguous i'rab (if two analyses are accepted by grammarians, do not use the sentence); (2) every wrong option must be plainly wrong for that word (never a second valid analysis); (3) reuse labels from the shared vocabulary; add a label only when needed and keep its wording identical in style; (4) explanations name the reason in one sentence and never claim scholar approval; (5) ids continue `d-007`, `d-008`, ...; (6) the file stays `unreviewed` until a named grammarian signs off, recorded in `docs/PROGRESS.md`; (7) the launch gate is `npm run -s validate:daily -- --min 60`.

- [ ] **Step 4: Grow the pool to 60 in batches of 10**

Repeat until `d-060`, for each batch: add 10 puzzles following the guide, run `npm run -s validate:daily` and `npx jest modules/daily`, then commit `content(daily): puzzles d-0NN..d-0MM`. The validator is the acceptance test for structure; the grammatical correctness of each sentence is checked by the reviewer step below, not by code. Cover a spread of constructions across the batches: verbal sentences (فاعل, مفعول به), nominal sentences (مبتدأ, خبر), إنّ and كان and their sisters, prepositions and إضافة, نعت, حال, ظرف, dual and sound plurals.

- [ ] **Step 5: Reviewer hand-off and progress note**

Add to `docs/PROGRESS.md`: pool size, `review_status: unreviewed`, "needs grammarian review before the notice is removed", and how to flip it (change `review_status` to `reviewed` in `puzzles.json` and record the reviewer's name and date here). Do not flip it without the owner naming the reviewer.

- [ ] **Step 6: Final verification and commit**

Run: `npx jest` (whole backend suite) and `npm run -s validate:daily -- --min 60`.
Expected: all suites pass; `daily puzzles OK: 60 puzzle(s)`.

```bash
git add modules/daily docs package.json
git commit -m "feat(daily): validation script, content guide and 60-puzzle launch pool

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Release (owner decision)

The branch is merged to `main` (auto-deploys production) only when the owner says so. After the deploy: `GET https://e3rbly-api-new.vercel.app/v1/daily/today` returns 200 with the contract above; two calls in the same local day return identical bodies.

## Self-review notes

- **Spec coverage (Part B backend):** curated pool with fixed answers (T1, T4), deterministic pick by date and UTC+3 boundary (T2), `GET /v1/daily/today` with `dayNumber`/`expires` (T3), load-time validation of one correct option per word and sentence containing the word (T1), `unreviewed` flag and notice (T1, T3), 60-sentence starter pool (T4), isolated module (T3), offline client caching is a client concern (plan 2). Streak, tree, share card and reminder are mobile (plan 2).
- **Type consistency:** `Pool`, `Puzzle`, `Target`, `todaysPuzzle` and `createDailyRouter` names are used identically in T1-T3 and the tests.
- **Known limit:** the answer key (`correctIndex`) is sent to the client so a fetched day works offline; a determined user can read it. Acceptable for a local-only game; revisit if leaderboards are added.
