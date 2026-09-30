const { CostGuard } = require("../pilot/costGuard");
const { callModel } = require("../pilot/client");
const { ayahWords, buildPrompt } = require("../pilot/prompt");
const { validateDraft, disagreement, errorsAgainstGold, summarize, norm } = require("../pilot/analysis");
const { PILOT_REFS } = require("../pilot/refs");
const { loadPack } = require("../src/pack");

const pack = loadPack();
const guardOf = (capUsd) => new CostGuard({ capUsd, priceInPerM: 1, priceOutPerM: 2 });
const okResponse = (words, usage = { promptTokenCount: 100, candidatesTokenCount: 50 }) => ({
  ok: true,
  json: async () => ({ usageMetadata: usage, candidates: [{ content: { parts: [{ text: JSON.stringify({ words: words.map((text, index) => ({ index, text, pos: "اسم" })) }) }] } }] }),
});

describe("pilot inputs", () => {
  test("20 refs, all real ayat, texts come from the verified pack", () => {
    expect(PILOT_REFS).toHaveLength(20);
    for (const ref of PILOT_REFS) {
      const [s, a] = ref.split(":").map(Number);
      expect(ayahWords(pack, s, a).length).toBeGreaterThan(0);
    }
  });

  test("ayah 1 is analysed without Tanzil's basmala prefix", () => {
    expect(ayahWords(pack, 2, 1)).toEqual(["الٓمٓ"]);
    expect(ayahWords(pack, 1, 2).join(" ")).toBe(pack.surahs[0][1]);
  });

  test("prompt is ungrounded: forbids citations, and carries no source text", () => {
    const p = buildPrompt(["قُلْ"]);
    expect(p).toMatch(/Do not quote or cite any book/);
    expect(p).toContain('["قُلْ"]');
  });
});

describe("CostGuard", () => {
  test("refuses configs without explicit positive prices and cap", () => {
    expect(() => new CostGuard({ capUsd: 1, priceInPerM: 0, priceOutPerM: 1 })).toThrow();
    expect(() => new CostGuard({ capUsd: NaN, priceInPerM: 1, priceOutPerM: 1 })).toThrow();
  });

  test("blocks a call whose worst case would pass the cap, before any request is made", async () => {
    const guard = guardOf(0.001); // worst case of one call: 4096 out tokens * $2/M = ~$0.008
    const fetchImpl = jest.fn();
    await expect(callModel({ apiKey: "k", model: "m", prompt: "x", temperature: 0, guard, fetchImpl })).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("records actual usage, thinking tokens included", async () => {
    const guard = guardOf(10);
    const fetchImpl = jest.fn().mockResolvedValue(okResponse(["أ"], { promptTokenCount: 1000, candidatesTokenCount: 500, thoughtsTokenCount: 500 }));
    await callModel({ apiKey: "k", model: "m", prompt: "x", temperature: 0, guard, fetchImpl });
    expect(guard.spentUsd).toBeCloseTo((1000 * 1 + 1000 * 2) / 1e6, 10);
  });

  test("missing usage is charged at the worst case", async () => {
    const guard = guardOf(10);
    const noUsage = { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"words":[]}' }] } }] }) };
    await callModel({ apiKey: "k", model: "m", prompt: "abcd", temperature: 0, guard, maxOutputTokens: 100, fetchImpl: jest.fn().mockResolvedValue(noUsage) });
    expect(guard.spentUsd).toBeCloseTo((2 * 1 + 100 * 2) / 1e6, 10);
  });
});

describe("free-tier mode (no money)", () => {
  test("requires a positive whole call limit", () => {
    expect(() => CostGuard.free({ maxCalls: 0 })).toThrow();
    expect(() => CostGuard.free({ maxCalls: 1.5 })).toThrow();
  });

  test("never spends: every request costs $0 but counts toward the call cap", async () => {
    const guard = CostGuard.free({ maxCalls: 2 });
    const fetchImpl = jest.fn().mockResolvedValue(okResponse(["أ"], { promptTokenCount: 1000, candidatesTokenCount: 500 }));
    await callModel({ apiKey: "k", model: "m", prompt: "x", temperature: 0, guard, fetchImpl });
    expect(guard.spentUsd).toBe(0);
    expect(guard.attempts).toBe(1);
  });

  test("stops before the request that would pass the call cap, retries included", async () => {
    const guard = CostGuard.free({ maxCalls: 2 });
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 429 });
    await expect(callModel({ apiKey: "k", model: "m", prompt: "x", temperature: 0, guard, fetchImpl, maxAttempts: 5 })).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("waits between retries so a per-minute limit can clear", async () => {
    const sleep = jest.fn().mockResolvedValue();
    const fetchImpl = jest.fn().mockResolvedValueOnce({ ok: false, status: 429 }).mockResolvedValueOnce(okResponse(["أ"]));
    await callModel({ apiKey: "k", model: "m", prompt: "x", temperature: 0, guard: CostGuard.free({ maxCalls: 5 }), fetchImpl, retryDelayMs: 30000, sleep });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(30000);
  });

  test("summaries extrapolate in tokens when money is always 0", () => {
    const calls = [{ words: 5, inTok: 500, outTok: 500, costUsd: 0, latencyMs: 10, attempts: 1 }];
    const s = summarize(calls, { totalWords: 1000, passes: 1, retryOverhead: 0 });
    expect(s.extrapolationTokens.mean).toBe(200000);
    expect(s.extrapolationUsd.mean).toBe(0);
  });
});

describe("callModel behaviour", () => {
  test("sends the key only in a header, never in the URL or body", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(okResponse(["أ"]));
    await callModel({ apiKey: "SECRET-KEY", model: "m", prompt: "x", temperature: 0, guard: guardOf(10), fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).not.toContain("SECRET-KEY");
    expect(init.body).not.toContain("SECRET-KEY");
    expect(init.headers["x-goog-api-key"]).toBe("SECRET-KEY");
  });

  test("retries once on 429, then succeeds; attempts are reported", async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce({ ok: false, status: 429 }).mockResolvedValueOnce(okResponse(["أ"]));
    const r = await callModel({ apiKey: "k", model: "m", prompt: "x", temperature: 0, guard: guardOf(10), fetchImpl });
    expect(r.attempts).toBe(2);
  });

  test("does not retry a 400/401", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 401 });
    await expect(callModel({ apiKey: "k", model: "m", prompt: "x", temperature: 0, guard: guardOf(10), fetchImpl })).rejects.toThrow(/HTTP 401/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("an altered word is rejected (retry, then fail as invalid), never accepted", async () => {
    const words = ["قُلْ", "هُوَ"];
    const altered = okResponse(["قَلْ", "هُوَ"]);
    const fetchImpl = jest.fn().mockResolvedValue(altered);
    await expect(callModel({ apiKey: "k", model: "m", prompt: "x", temperature: 0, guard: guardOf(10), fetchImpl, validate: (j) => validateDraft(j, words) })).rejects.toMatchObject({ invalid: true, attempts: 2 });
  });

  test("unparseable model output is retried then reported", async () => {
    const bad = { ok: true, json: async () => ({ usageMetadata: {}, candidates: [{ content: { parts: [{ text: "not json" }] } }] }) };
    await expect(callModel({ apiKey: "k", model: "m", prompt: "x", temperature: 0, guard: guardOf(10), fetchImpl: jest.fn().mockResolvedValue(bad) })).rejects.toThrow(/unparseable/);
  });
});

describe("analysis", () => {
  test("validateDraft demands exact words in order", () => {
    expect(validateDraft({ words: [{ text: "أ" }] }, ["أ"])).toBeNull();
    expect(validateDraft({ words: [{ text: "أ" }] }, ["ب"])).toMatch(/altered/);
    expect(validateDraft({ words: [] }, ["ب"])).toMatch(/expected 1/);
    expect(validateDraft({}, ["ب"])).toMatch(/missing/);
  });

  test("norm ignores harakat and alef variants in labels", () => {
    expect(norm("مَرْفُوع")).toBe(norm("مرفوع"));
    expect(norm("إعراب")).toBe(norm("اعراب"));
  });

  test("disagreement counts words and fields", () => {
    const a = { words: [{ pos: "اسم", role: "مبتدأ", case: "مرفوع", root: "" }, { pos: "فعل", role: "x", case: "y", root: "" }] };
    const b = { words: [{ pos: "اسم", role: "خبر", case: "مرفوع", root: "" }, { pos: "فعل", role: "x", case: "y", root: "" }] };
    expect(disagreement(a, b)).toEqual({ words: 2, anyDiff: 1, per: { pos: 0, root: 0, role: 1, case: 0 } });
  });

  test("errorsAgainstGold only compares fields the gold provides", () => {
    const draft = { words: [{ pos: "اسم", role: "فاعل", case: "مرفوع", root: "" }] };
    const per = errorsAgainstGold(draft, [{ pos: "اسم", role: "مفعول به", case: "منصوب" }]);
    expect(per.role).toEqual({ compared: 1, wrong: 1 });
    expect(per.pos).toEqual({ compared: 1, wrong: 0 });
    expect(per.root).toEqual({ compared: 0, wrong: 0 });
  });

  test("summarize extrapolates as a range and states its assumptions", () => {
    const calls = [
      { words: 2, inTok: 100, outTok: 100, costUsd: 0.002, latencyMs: 100, attempts: 1 },
      { words: 10, inTok: 200, outTok: 500, costUsd: 0.005, latencyMs: 300, attempts: 2 },
    ];
    const s = summarize(calls, { totalWords: 1000, passes: 2, retryOverhead: 0 });
    expect(s.extrapolationUsd.low).toBeCloseTo(0.0005 * 1000 * 2, 10);
    expect(s.extrapolationUsd.high).toBeCloseTo(0.001 * 1000 * 2, 10);
    expect(s.extrapolationUsd.low).toBeLessThanOrEqual(s.extrapolationUsd.mean);
    expect(s.extrapolationUsd.mean).toBeLessThanOrEqual(s.extrapolationUsd.high);
    expect(s.retryRate).toBe(0.5);
    expect(s.assumptions).toEqual({ totalWords: 1000, passes: 2, retryOverhead: 0 });
  });
});
