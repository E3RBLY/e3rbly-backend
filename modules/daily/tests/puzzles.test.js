const { validatePool, loadPool, fnv1a } = require("../src/puzzles");
const { rawPool } = require("./fixtures");

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
    ["target word appears twice in the sentence", (r) => { r.puzzles[0].sentence = "قرأ الطالب الطالب الدرس"; r.puzzles[0].targets[2].word = "الدرس"; }, /more than once/],
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
