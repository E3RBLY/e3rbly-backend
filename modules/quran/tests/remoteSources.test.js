const fs = require("fs");
const os = require("os");
const path = require("path");
const request = require("supertest");
const { createApp } = require("../src/app");
const { loadPack } = require("../src/pack");
const { loadAnnotations } = require("../src/annotations");
const { loadRemoteSources, createRemoteTafsir, noRemoteTafsir } = require("../src/remoteSources");

const pack = loadPack();
const licensesDir = path.join(__dirname, "..", "..", "..", "docs", "licenses");
const ALL = ["ar.muyassar", "ar.jalalayn", "ar.waseet", "ar.baghawi", "ar.qurtubi", "ar.miqbas"];

/** A fake AlQuran Cloud: answers /ayah/S:A/editions/e1,e2 in the real response shape. */
function fakeUpstream({ status = 200, override } = {}) {
  const calls = [];
  const fetchImpl = jest.fn(async (url) => {
    calls.push(url);
    if (status !== 200) return { ok: false, status, json: async () => ({}) };
    const m = /\/ayah\/(\d+):(\d+)\/editions\/(.+)$/.exec(url);
    const [surah, ayah, editions] = [Number(m[1]), Number(m[2]), m[3].split(",")];
    let data = editions.map((id) => ({ text: `نص ${id} للآية ${surah}:${ayah}`, numberInSurah: ayah, surah: { number: surah }, edition: { identifier: id } }));
    if (override) data = override(data);
    return { ok: true, status: 200, json: async () => ({ code: 200, data }) };
  });
  return { fetchImpl, calls };
}

const build = (extra = {}) => {
  const upstream = fakeUpstream(extra.upstream);
  const config = loadRemoteSources({ env: extra.env || {} });
  return { upstream, remote: createRemoteTafsir({ config, fetchImpl: upstream.fetchImpl, ...extra.options }), config };
};

describe("remote source configuration", () => {
  test("the shipped configuration is valid: six books, each with a saved license file", () => {
    const { enabled } = loadRemoteSources({ env: {} });
    expect(enabled.map((s) => s.edition_id).sort()).toEqual([...ALL].sort());
    expect(enabled.every((s) => fs.existsSync(path.join(licensesDir, s.license_file)))).toBe(true);
    expect(enabled.every((s) => s.provenance === "imported" && s.attribution_text.includes("alquran.cloud"))).toBe(true);
  });

  test("kill switches: all off, or individual books off", () => {
    expect(loadRemoteSources({ env: { QURAN_REMOTE_TAFSIR: "false" } }).enabled).toEqual([]);
    const some = loadRemoteSources({ env: { QURAN_DISABLED_SOURCES: "aqc-qurtubi, aqc-miqbas" } }).enabled.map((s) => s.id);
    expect(some).not.toContain("aqc-qurtubi");
    expect(some).not.toContain("aqc-miqbas");
    expect(some).toHaveLength(4);
  });

  test("an invalid configuration stops loading with the reasons (missing license file, duplicate id)", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "remote-")), "remote.json");
    const base = { id: "aqc-x", edition_id: "ar.x", kind: "tafsir", priority: 1, name_ar: "ك", edition: "ن", attribution_text: "م", license: "l", license_file: "nope.md", provenance: "imported" };
    fs.writeFileSync(file, JSON.stringify({ provider: { base_url: "https://x" }, sources: [base, { ...base, license_file: "alquran-cloud-terms.md" }] }));
    expect(() => loadRemoteSources({ file, licensesDir })).toThrow(/license file not found[\s\S]*duplicate id/);
  });

  test("disabled provider is a harmless no-op", async () => {
    const remote = createRemoteTafsir({ config: { provider: {}, enabled: [] } });
    expect(remote.enabled).toBe(false);
    expect(await remote.forAyah(1, 1)).toEqual({ items: [], warnings: [], kinds: [] });
    expect(await noRemoteTafsir().forAyah(1, 1)).toEqual({ items: [], warnings: [], kinds: [] });
  });
});

describe("fetching and caching", () => {
  test("ONE upstream request covers all six books; text passes through unchanged", async () => {
    const { remote, upstream } = build();
    const { items, warnings } = await remote.forAyah(2, 255);
    expect(upstream.calls).toHaveLength(1);
    expect(upstream.calls[0]).toMatch(/^https:\/\/api\.alquran\.cloud\/v1\/ayah\/2:255\/editions\/ar\.muyassar,/);
    expect(items).toHaveLength(6);
    expect(warnings).toEqual([]);
    expect(items[0].body_ar).toBe("نص ar.muyassar للآية 2:255");
  });

  test("items come back ordered by priority, with full attribution", async () => {
    const { remote } = build();
    const { items } = await remote.forAyah(1, 2);
    expect(items.map((i) => i.source.id)).toEqual(["aqc-muyassar", "aqc-jalalayn", "aqc-waseet", "aqc-baghawi", "aqc-qurtubi", "aqc-miqbas"]);
    expect(items.map((i) => i.kind)).toEqual(["simple", "tafsir", "tafsir", "tafsir", "tafsir", "tafsir"]);
    for (const i of items) {
      expect(i.source.attribution_text).toBeTruthy();
      expect(i.review_status).toBe("unreviewed");
      expect(i.source.provenance).toBe("imported");
    }
    expect(items.find((i) => i.source.id === "aqc-miqbas").source.attribution_text).toMatch(/محل خلاف/);
  });

  test("a kind filter asks upstream for only that kind's books", async () => {
    const { remote, upstream } = build();
    const { items } = await remote.forAyah(1, 1, "simple");
    expect(items.map((i) => i.source.id)).toEqual(["aqc-muyassar"]);
    expect(upstream.calls[0]).toMatch(/editions\/ar\.muyassar$/);
  });

  test("cached: the second request for the same ayah makes no upstream call", async () => {
    const { remote, upstream } = build();
    await remote.forAyah(3, 3);
    await remote.forAyah(3, 3);
    expect(upstream.calls).toHaveLength(1);
  });

  test("only the missing books are fetched when part of the answer is cached", async () => {
    const { remote, upstream } = build();
    await remote.forAyah(3, 4, "simple");
    await remote.forAyah(3, 4);
    expect(upstream.calls).toHaveLength(2);
    expect(upstream.calls[1]).not.toMatch(/ar\.muyassar/);
  });

  test("concurrent identical requests share one upstream call", async () => {
    const { remote, upstream } = build();
    await Promise.all([remote.forAyah(4, 4), remote.forAyah(4, 4), remote.forAyah(4, 4)]);
    expect(upstream.calls).toHaveLength(1);
  });

  test("the cache is bounded (oldest entries are dropped)", async () => {
    const { remote, upstream } = build({ options: { cacheSize: 6 } });
    await remote.forAyah(5, 1);
    await remote.forAyah(5, 2);
    await remote.forAyah(5, 1);
    expect(upstream.calls).toHaveLength(3);
  });
});

describe("failure handling: the response never fails because a book is unavailable", () => {
  test("HTTP error -> no items, a warning naming the books, no exception", async () => {
    const { remote } = build({ upstream: { status: 503 } });
    const res = await remote.forAyah(1, 1);
    expect(res.items).toEqual([]);
    expect(res.warnings).toEqual([{ code: "REMOTE_UNAVAILABLE", sources: expect.arrayContaining(["aqc-muyassar", "aqc-qurtubi"]) }]);
  });

  test("network error or timeout -> warning, not an exception", async () => {
    const config = loadRemoteSources({ env: {} });
    const remote = createRemoteTafsir({ config, fetchImpl: jest.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "TimeoutError" })) });
    const res = await remote.forAyah(1, 1);
    expect(res.warnings[0].code).toBe("REMOTE_UNAVAILABLE");
  });

  test("circuit breaker: after 3 failures upstream is left alone for a while, then retried", async () => {
    let t = 1000;
    const { remote, upstream } = build({ upstream: { status: 500 }, options: { now: () => t, breakerPauseMs: 60000 } });
    for (let i = 1; i <= 3; i++) await remote.forAyah(6, i);
    expect(upstream.calls).toHaveLength(3);
    const paused = await remote.forAyah(6, 4);
    expect(upstream.calls).toHaveLength(3);
    expect(paused.warnings[0].code).toBe("REMOTE_UNAVAILABLE");
    t += 61000;
    await remote.forAyah(6, 5);
    expect(upstream.calls).toHaveLength(4);
  });

  test("a failure is not cached: the next request tries again", async () => {
    const calls = [];
    let ok = false;
    const config = loadRemoteSources({ env: {} });
    const fetchImpl = jest.fn(async (url) => {
      calls.push(url);
      if (!ok) return { ok: false, status: 500, json: async () => ({}) };
      const [, s, a, e] = /ayah\/(\d+):(\d+)\/editions\/(.+)$/.exec(url);
      return { ok: true, json: async () => ({ data: e.split(",").map((id) => ({ text: "نص", numberInSurah: Number(a), surah: { number: Number(s) }, edition: { identifier: id } })) }) };
    });
    const remote = createRemoteTafsir({ config, fetchImpl, breakerFailures: 99 });
    expect((await remote.forAyah(7, 1)).items).toHaveLength(0);
    ok = true;
    expect((await remote.forAyah(7, 1)).items).toHaveLength(6);
  });

  test.each([
    ["wrong ayah number", (d) => d.map((e) => ({ ...e, numberInSurah: 99 }))],
    ["wrong surah", (d) => d.map((e) => ({ ...e, surah: { number: 99 } }))],
    ["empty text", (d) => d.map((e) => ({ ...e, text: "   " }))],
    ["non-string text", (d) => d.map((e) => ({ ...e, text: { html: "x" } }))],
    ["absurdly long text", (d) => d.map((e) => ({ ...e, text: "ا".repeat(400000) }))],
    ["unknown edition", (d) => d.map((e) => ({ ...e, edition: { identifier: "ar.evil" } }))],
  ])("upstream data is validated: %s is rejected, not shown", async (_n, override) => {
    const { remote } = build({ upstream: { override } });
    const res = await remote.forAyah(8, 1);
    expect(res.items).toEqual([]);
    expect(res.warnings[0].code).toBe("REMOTE_BAD_RESPONSE");
  });

  test("a partial answer keeps the good books and reports the missing ones", async () => {
    const { remote } = build({ upstream: { override: (d) => d.filter((e) => e.edition.identifier !== "ar.qurtubi") } });
    const res = await remote.forAyah(9, 1);
    expect(res.items).toHaveLength(5);
    expect(res.warnings).toEqual([{ code: "REMOTE_BAD_RESPONSE", sources: ["aqc-qurtubi"] }]);
  });
});

describe("GET /v1/quran/ayat/:s/:a/annotations with on-demand books", () => {
  const reviewedOnly = loadAnnotations({ dir: path.join(__dirname, "fixtures", "annotations"), licensesDir: path.join(__dirname, "fixtures", "licenses"), includeUnreviewed: true });
  const appWith = (remote, annotations = reviewedOnly) => createApp({ pack, annotations, remote, maxPerMinute: 100000 });

  test("books and local packs are merged, ordered by priority, kinds are the union", async () => {
    const { remote } = build();
    const res = await request(appWith(remote)).get("/v1/quran/ayat/112/1/annotations");
    expect(res.status).toBe(200);
    const ids = res.body.annotations.map((a) => a.source.id);
    expect(ids.slice(0, 6)).toEqual(["aqc-muyassar", "aqc-jalalayn", "aqc-waseet", "aqc-baghawi", "aqc-qurtubi", "aqc-miqbas"]);
    expect(ids.slice(6).sort()).toEqual(expect.arrayContaining(["test-irab", "test-simple", "test-tafsir"]));
    expect(res.body.available_kinds.sort()).toEqual(["i3rab", "simple", "tafsir"]);
    expect(res.body.warnings).toBeUndefined();
  });

  test("a complete answer is CDN-cacheable and gets a body-based ETag (304 on repeat)", async () => {
    const { remote } = build();
    const app = appWith(remote);
    const first = await request(app).get("/v1/quran/ayat/112/1/annotations");
    expect(first.headers["cache-control"]).toMatch(/s-maxage=86400/);
    const second = await request(app).get("/v1/quran/ayat/112/1/annotations").set("If-None-Match", first.headers.etag);
    expect(second.status).toBe(304);
  });

  test("when upstream is down: 200 with the local content, a warning, and NO caching", async () => {
    const { remote } = build({ upstream: { status: 500 } });
    const res = await request(appWith(remote)).get("/v1/quran/ayat/112/1/annotations");
    expect(res.status).toBe(200);
    expect(res.body.annotations.every((a) => a.source.id.startsWith("test-"))).toBe(true);
    expect(res.body.warnings[0]).toMatchObject({ code: "REMOTE_UNAVAILABLE" });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  test("the kind filter narrows both local and remote items", async () => {
    const { remote, upstream } = build();
    const res = await request(appWith(remote)).get("/v1/quran/ayat/112/1/annotations?kind=simple");
    expect(res.body.annotations.map((a) => a.kind)).toEqual(["simple", "simple"]);
    expect(upstream.calls[0]).toMatch(/editions\/ar\.muyassar$/);
  });

  test("an unknown ayah is a 404 and never reaches upstream", async () => {
    const { remote, upstream } = build();
    const res = await request(appWith(remote)).get("/v1/quran/ayat/112/9/annotations");
    expect(res.status).toBe(404);
    expect(upstream.calls).toHaveLength(0);
  });

  test("annotation-sources lists the books as remote sources in priority order", async () => {
    const { remote } = build();
    const res = await request(appWith(remote)).get("/v1/quran/annotation-sources");
    expect(res.body.remote_enabled).toBe(true);
    const books = res.body.sources.filter((s) => s.remote);
    expect(books).toHaveLength(6);
    expect(books[0]).toMatchObject({ id: "aqc-muyassar", kind: "simple", coverage: { ayat: 6236 } });
    expect(res.body.sources[0].id).toBe("aqc-muyassar");
  });
});
