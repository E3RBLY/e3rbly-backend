const fs = require("fs");
const os = require("os");
const path = require("path");
const { ModelPool, runGeneration, parseSurahList } = require("../src/generationRun");
const { classifyHttpError, callModel } = require("../pilot/client");
const { CostGuard } = require("../pilot/costGuard");
const { buildAyahPrompt, validateGenerated, ensureSources, needsGeneration, storeGenerated } = require("../src/annotationGenerator");
const { loadAnnotations } = require("../src/annotations");

const targets = (n) => Array.from({ length: n }, (_, i) => ({ surah: 112, ayah: i + 1, text: "نص", wordCount: 2 }));
const quotaError = (quota) => Object.assign(new Error("HTTP 429"), { quota });

describe("ModelPool", () => {
  test("priority strategy: the best model is used until it is out of quota, then the next one", () => {
    const pool = new ModelPool(["best", "good", "lite"]);
    expect([pool.next(), pool.next()]).toEqual(["best", "best"]);
    pool.exhaust("best");
    expect(pool.next()).toBe("good");
    pool.exhaust("good");
    pool.exhaust("lite");
    expect(pool.next()).toBeNull();
  });

  test("round-robin strategy spreads evenly", () => {
    const pool = new ModelPool(["a", "b"], { strategy: "roundrobin" });
    expect([pool.next(), pool.next(), pool.next(), pool.next()]).toEqual(["a", "b", "a", "b"]);
  });

  test("rejects an empty list and removes duplicates", () => {
    expect(() => new ModelPool([" ", ""])).toThrow(/at least one model/);
    expect(new ModelPool(["a", "a", " b "]).models).toEqual(["a", "b"]);
  });
});

describe("runGeneration", () => {
  const base = () => ({ needs: () => true, store: jest.fn(), pool: new ModelPool(["m1", "m2"]) });

  test("processes every target in order and stores each result with the model that made it", async () => {
    const ctx = base();
    const generate = jest.fn(async ({ ayah }) => ({ ayah }));
    const s = await runGeneration({ ...ctx, targets: targets(3), generate });
    expect(s).toMatchObject({ stored: 3, failed: 0, stopReason: "COMPLETED" });
    expect(ctx.store.mock.calls.map((c) => [c[1], c[3]])).toEqual([[1, "m1"], [2, "m1"], [3, "m1"]]);
  });

  test("resumable: ayat that are already done are skipped without any model call", async () => {
    const generate = jest.fn(async () => ({}));
    const s = await runGeneration({ ...base(), needs: (_s, a) => a > 2, targets: targets(4), generate });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(s).toMatchObject({ stored: 2, skippedExisting: 2 });
  });

  test("a daily quota retires the model and the SAME ayah is retried on the next model", async () => {
    const ctx = base();
    const generate = jest.fn(async ({ model, ayah }) => {
      if (model === "m1" && ayah === 2) throw quotaError("daily");
      return {};
    });
    const s = await runGeneration({ ...ctx, targets: targets(3), generate });
    expect(s).toMatchObject({ stored: 3, stopReason: "COMPLETED", retired: ["m1"] });
    expect(ctx.store.mock.calls.map((c) => c[3])).toEqual(["m1", "m2", "m2"]);
  });

  test("when every model is out of daily quota the run stops cleanly and says so", async () => {
    const generate = jest.fn(async () => {
      throw quotaError("daily");
    });
    const s = await runGeneration({ ...base(), targets: targets(5), generate });
    expect(s.stopReason).toBe("ALL_MODELS_EXHAUSTED");
    expect(s.stored).toBe(0);
    expect(generate).toHaveBeenCalledTimes(2); // one attempt per model, not five
  });

  test("other failures skip that ayah; too many in a row stop the run", async () => {
    const generate = jest.fn(async () => {
      throw new Error("HTTP 503");
    });
    const s = await runGeneration({ ...base(), targets: targets(20), generate, maxConsecutiveFailures: 4 });
    expect(s.stopReason).toBe("TOO_MANY_FAILURES");
    expect(s.failed).toBe(4);
    expect(generate).toHaveBeenCalledTimes(4);
  });

  test("a success resets the failure streak", async () => {
    let n = 0;
    const generate = jest.fn(async () => {
      n += 1;
      if (n % 3 !== 0) throw new Error("boom");
      return {};
    });
    const s = await runGeneration({ ...base(), targets: targets(9), generate, maxConsecutiveFailures: 3 });
    expect(s.stopReason).toBe("COMPLETED");
    expect(s.stored).toBe(3);
  });

  test("honours a per-run limit and paces calls", async () => {
    const sleep = jest.fn(async () => {});
    const generate = jest.fn(async () => ({}));
    const s = await runGeneration({ ...base(), targets: targets(10), generate, maxStored: 3, intervalMs: 500, sleep });
    expect(s).toMatchObject({ stored: 3, stopReason: "LIMIT_REACHED" });
    expect(sleep).toHaveBeenCalledTimes(2); // between the 3 calls, none before the first
    expect(sleep).toHaveBeenCalledWith(500);
  });
});

describe("parseSurahList", () => {
  test("ranges, lists, descending ranges and 'all' (Juz' Amma first, no duplicates)", () => {
    expect(parseSurahList("112")).toEqual([112]);
    expect(parseSurahList("109-111,1")).toEqual([109, 110, 111, 1]);
    expect(parseSurahList("111-109")).toEqual([111, 110, 109]);
    const all = parseSurahList("all");
    expect(all).toHaveLength(114);
    expect(new Set(all).size).toBe(114);
    expect(all.slice(0, 3)).toEqual([114, 113, 112]);
  });
  test.each(["0", "115", "abc", "5-x", "1-200"])("rejects %s", (bad) => expect(() => parseSurahList(bad)).toThrow());
});

describe("classifyHttpError (reads Google's own explanation)", () => {
  const daily = JSON.stringify({ error: { details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }, { retryDelay: "11s" }] } });
  const minute = JSON.stringify({ error: { details: [{ violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }] }, { "@type": "RetryInfo", retryDelay: "23.5s" }] } });

  test("daily quota", () => expect(classifyHttpError(429, daily).quota).toBe("daily"));
  test("per-minute quota with the wait Google asks for", () => expect(classifyHttpError(429, minute)).toEqual({ quota: "minute", retryAfterMs: 23500 }));
  test("a 429 we cannot classify is 'unknown'; other statuses are not quota errors", () => {
    expect(classifyHttpError(429, "nope").quota).toBe("unknown");
    expect(classifyHttpError(503, daily).quota).toBeNull();
  });

  test("callModel does NOT retry a daily-quota 429 (waiting cannot fix it) and reports quota=daily", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 429, text: async () => daily });
    const err = await callModel({ apiKey: "k", model: "m", prompt: "x", temperature: 0, guard: CostGuard.free({ maxCalls: 10 }), fetchImpl, maxAttempts: 3 }).catch((e) => e);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(err.quota).toBe("daily");
  });

  test("callModel waits the stated time on a per-minute 429, then succeeds", async () => {
    const sleep = jest.fn(async () => {});
    const ok = { ok: true, json: async () => ({ usageMetadata: {}, candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] }) };
    const fetchImpl = jest.fn().mockResolvedValueOnce({ ok: false, status: 429, text: async () => minute }).mockResolvedValueOnce(ok);
    const r = await callModel({ apiKey: "k", model: "m", prompt: "x", temperature: 0, guard: CostGuard.free({ maxCalls: 10 }), fetchImpl, sleep, retryDelayMs: 1 });
    expect(r.json).toEqual({ a: 1 });
    expect(sleep).toHaveBeenCalledWith(24500); // 23.5 s hint + 1 s safety
  });
});

describe("i'rab-only generation", () => {
  const irab = (body) => ({ i3rab: [{ label: "", body }] });
  const tmp = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "irab-only-"));
    ensureSources({ dir });
    return dir;
  };
  const long = "ا".repeat(60);

  test("prompt asks for every word, in order, with the case sign, and forbids citations", () => {
    const p = buildAyahPrompt(112, 1, "قل هو الله أحد", { only: "i3rab" });
    expect(p).toMatch(/Analyse EVERY word/);
    expect(p).toMatch(/Do not cite books or scholars/);
    expect(p).not.toMatch(/"simple"/);
  });

  test("validation: no simple/tafsir needed, but a too-short analysis of a long ayah is rejected", () => {
    expect(validateGenerated(irab(long), { only: "i3rab", wordCount: 4 })).toBeNull();
    expect(validateGenerated(irab("مبتدأ مرفوع"), { only: "i3rab", wordCount: 10 })).toMatch(/too short for 10 words/);
    expect(validateGenerated(irab(long), {})).toMatch(/simple/); // without `only` all three are required
  });

  test("stores ONLY the i'rab, never touches the other two, and logs which model wrote it", () => {
    const dir = tmp();
    expect(storeGenerated(112, 1, irab(long), { dir, only: "i3rab", model: "gemini-x", wordCount: 4, now: () => new Date("2026-10-01T00:00:00Z") })).toEqual(["i3rab"]);
    expect(fs.existsSync(path.join(dir, "ai-simple", "surah-112.json"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "ai-tafsir", "surah-112.json"))).toBe(false);
    const log = JSON.parse(fs.readFileSync(path.join(dir, "generation-log.json"), "utf8"));
    expect(log["112:1"].i3rab).toEqual({ model: "gemini-x", at: "2026-10-01T00:00:00.000Z" });
  });

  test("needsGeneration with `only` looks at that kind alone", () => {
    const dir = tmp();
    expect(needsGeneration(112, 1, { only: "i3rab", dir })).toBe(true);
    storeGenerated(112, 1, irab(long), { dir, only: "i3rab" });
    expect(needsGeneration(112, 1, { only: "i3rab", dir })).toBe(false);
    expect(needsGeneration(112, 1, { dir })).toBe(true); // simple + tafsir are still missing
  });

  test("the generation log sits beside the packs without breaking their validation", () => {
    const dir = tmp();
    storeGenerated(112, 1, irab(long), { dir, only: "i3rab", model: "m" });
    const licenses = fs.mkdtempSync(path.join(os.tmpdir(), "lic-"));
    fs.writeFileSync(path.join(licenses, "ai-generated-drafts.md"), "x");
    const store = loadAnnotations({ dir, licensesDir: licenses, includeUnreviewed: true });
    expect(store.forAyah(112, 1)).toHaveLength(1);
  });
});
