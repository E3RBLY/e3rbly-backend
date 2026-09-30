const fs = require("fs");
const os = require("os");
const path = require("path");
const request = require("supertest");
const { createApp } = require("../src/app");
const { loadPack } = require("../src/pack");
const { loadAnnotations } = require("../src/annotations");

const FIXTURES = path.join(__dirname, "fixtures");
const dir = path.join(FIXTURES, "annotations");
const licensesDir = path.join(FIXTURES, "licenses");
const pack = loadPack();
const reviewedOnly = loadAnnotations({ dir, licensesDir, includeUnreviewed: false });
const appFor = (annotations) => createApp({ pack, annotations, maxPerMinute: 100000 });

/** Writes a throwaway pack folder and returns its path. */
function tempPack(source, surah112) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "quran-annotations-"));
  const dirName = source.id || "bad";
  fs.mkdirSync(path.join(root, dirName));
  fs.writeFileSync(path.join(root, dirName, "source.json"), JSON.stringify(source));
  if (surah112) fs.writeFileSync(path.join(root, dirName, "surah-112.json"), JSON.stringify(surah112));
  return root;
}
const goodSource = { id: "s1", kind: "tafsir", name_ar: "م", attribution_text: "ن", license: "l", license_file: "test-permission.md", provenance: "curated" };
const goodItems = { "112:1": [{ body_ar: "نص", review_status: "reviewed" }] };
const load = (root) => () => loadAnnotations({ dir: root, licensesDir, includeUnreviewed: true });

describe("annotation store: content policy", () => {
  test("no annotation folder = empty store, nothing invented", () => {
    const empty = loadAnnotations({ dir: path.join(os.tmpdir(), "does-not-exist-quran"), licensesDir });
    expect(empty.sources()).toEqual([]);
    expect(empty.forAyah(1, 1)).toEqual([]);
  });

  test("the repository's real annotation folder loads (empty until licensed content exists)", () => {
    expect(() => loadAnnotations()).not.toThrow();
  });

  test("only reviewed items are served by default", () => {
    expect(reviewedOnly.forAyah(112, 2)).toEqual([]);
    expect(reviewedOnly.forAyah(112, 1, "tafsir")).toHaveLength(1);
  });

  test("the operator can opt in to unreviewed items (staging)", () => {
    const staging = loadAnnotations({ dir, licensesDir, includeUnreviewed: true });
    expect(staging.forAyah(112, 2, "tafsir")).toHaveLength(1);
    expect(staging.includeUnreviewed).toBe(true);
  });

  test("differing i'rab wujuh stay separate, each labelled and attributed", () => {
    const wujuh = reviewedOnly.forAyah(112, 1, "i3rab");
    expect(wujuh.map((w) => w.label)).toEqual(["الوجه الأول", "الوجه الثاني"]);
    expect(new Set(wujuh.map((w) => w.id)).size).toBe(2);
    expect(wujuh.every((w) => w.source.attribution_text && w.source.license && w.source.provenance)).toBe(true);
  });

  test("sources report coverage of served content only", () => {
    const byId = Object.fromEntries(reviewedOnly.sources().map((s) => [s.id, s]));
    expect(byId["test-tafsir"].coverage.ayat).toBe(1);
    expect(byId["test-simple"].provenance).toBe("ai_draft");
  });

  test("the content fingerprint changes when served content changes", () => {
    const staging = loadAnnotations({ dir, licensesDir, includeUnreviewed: true });
    expect(staging.version).not.toBe(reviewedOnly.version);
  });
});

describe("annotation store: invalid packs stop the load with a clear list", () => {
  test.each([
    ["missing license_file", { ...goodSource, license_file: undefined }, /license_file is required/],
    ["license file that does not exist", { ...goodSource, license_file: "nope.md" }, /license file not found/],
    ["path traversal in license_file", { ...goodSource, license_file: "../secret.md" }, /bare file name/],
    ["unknown provenance", { ...goodSource, provenance: "guess" }, /provenance must be one of/],
    ["unknown kind", { ...goodSource, kind: "hadith" }, /kind must be one of/],
    ["imported without edition", { ...goodSource, provenance: "imported" }, /must name the edition/],
    ["no attribution text", { ...goodSource, attribution_text: " " }, /attribution_text is required/],
  ])("%s", (_name, source, expected) => {
    expect(load(tempPack(source, goodItems))).toThrow(expected);
  });

  test.each([
    ["ayah outside the surah", { "112:9": [{ body_ar: "x", review_status: "reviewed" }] }, /not a valid ayah/],
    ["ayah of another surah", { "111:1": [{ body_ar: "x", review_status: "reviewed" }] }, /not a valid ayah/],
    ["empty body", { "112:1": [{ body_ar: "  ", review_status: "reviewed" }] }, /body_ar is empty/],
    ["missing review status", { "112:1": [{ body_ar: "x" }] }, /review_status must be one of/],
    ["several items for a tafsir ayah", { "112:1": [{ body_ar: "x", review_status: "reviewed" }, { body_ar: "y", review_status: "reviewed" }] }, /only i3rab may hold several/],
  ])("%s", (_name, items, expected) => {
    expect(load(tempPack(goodSource, items))).toThrow(expected);
  });

  test("several wujuh without labels are rejected", () => {
    const source = { ...goodSource, kind: "i3rab" };
    const items = { "112:1": [{ body_ar: "x", review_status: "reviewed" }, { body_ar: "y", review_status: "reviewed" }] };
    expect(load(tempPack(source, items))).toThrow(/several wujuh need a label/);
  });

  test("folder name must equal the source id", () => {
    const root = tempPack(goodSource, goodItems);
    fs.renameSync(path.join(root, "s1"), path.join(root, "other"));
    expect(load(root)).toThrow(/id must equal the folder name/);
  });
});

describe("GET /v1/quran/ayat/:s/:a/annotations", () => {
  const app = appFor(reviewedOnly);

  test("returns every available kind with source attribution and review status", async () => {
    const res = await request(app).get("/v1/quran/ayat/112/1/annotations");
    expect(res.status).toBe(200);
    expect(res.body.available_kinds.sort()).toEqual(["i3rab", "simple", "tafsir"]);
    expect(res.body.ayah.text).toBe(pack.surahs[111][0]);
    for (const a of res.body.annotations) {
      expect(a.review_status).toBe("reviewed");
      expect(a.source.name_ar).toBeTruthy();
      expect(a.source.attribution_text).toBeTruthy();
    }
    expect(res.body.annotations).toHaveLength(4);
  });

  test("filters by kind", async () => {
    const res = await request(app).get("/v1/quran/ayat/112/1/annotations?kind=i3rab");
    expect(res.body.annotations.map((a) => a.kind)).toEqual(["i3rab", "i3rab"]);
  });

  test("an ayah without content answers 200 with empty lists (never invented text)", async () => {
    const res = await request(app).get("/v1/quran/ayat/1/1/annotations");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ available_kinds: [], annotations: [] });
  });

  test("unreviewed content is not served", async () => {
    const res = await request(app).get("/v1/quran/ayat/112/2/annotations");
    expect(res.body.annotations).toEqual([]);
  });

  test.each([
    ["/v1/quran/ayat/112/1/annotations?kind=hadith", 400],
    ["/v1/quran/ayat/112/1/annotations?foo=1", 400],
    ["/v1/quran/ayat/0/1/annotations", 400],
    ["/v1/quran/ayat/112/5/annotations", 404],
  ])("%s -> %i in the error envelope", async (url, status) => {
    const res = await request(app).get(url);
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR");
  });

  test("ETag differs when annotation content differs, so caches never serve stale content", async () => {
    const staging = appFor(loadAnnotations({ dir, licensesDir, includeUnreviewed: true }));
    // The tag now describes the real response body: ayah 112:2 has an unreviewed item only staging serves.
    const a = await request(app).get("/v1/quran/ayat/112/2/annotations");
    const b = await request(staging).get("/v1/quran/ayat/112/2/annotations");
    expect(a.body.annotations).toHaveLength(0);
    expect(b.body.annotations).toHaveLength(1);
    expect(a.headers.etag).not.toBe(b.headers.etag);
    const again = await request(app).get("/v1/quran/ayat/112/2/annotations").set("If-None-Match", a.headers.etag);
    expect(again.status).toBe(304);
    expect(a.headers["cache-control"]).toMatch(/s-maxage=86400/);
  });
});

describe("GET /v1/quran/annotation-sources", () => {
  test("lists sources with coverage and the reviewed-only flag", async () => {
    const res = await request(appFor(reviewedOnly)).get("/v1/quran/annotation-sources");
    expect(res.status).toBe(200);
    expect(res.body.reviewed_only).toBe(true);
    expect(res.body.sources.map((s) => s.id).sort()).toEqual(["test-irab", "test-simple", "test-tafsir"]);
  });

  test("production default: the shipped AI drafts are served (labelled unreviewed), and can be switched off", async () => {
    const env = process.env.QURAN_INCLUDE_UNREVIEWED;
    try {
      delete process.env.QURAN_INCLUDE_UNREVIEWED;
      const on = await request(createApp({ pack, annotations: loadAnnotations(), maxPerMinute: 100000 })).get("/v1/quran/annotation-sources");
      expect(on.body.reviewed_only).toBe(false);
      expect(on.body.sources.map((s) => s.id).sort()).toEqual(["ai-irab", "ai-simple", "ai-tafsir"]);

      const item = (await request(createApp({ pack, annotations: loadAnnotations(), maxPerMinute: 100000 })).get("/v1/quran/ayat/112/1/annotations")).body.annotations[0];
      expect(item.review_status).toBe("unreviewed");
      expect(item.source.provenance).toBe("ai_draft");

      process.env.QURAN_INCLUDE_UNREVIEWED = "false";
      const off = await request(createApp({ pack, annotations: loadAnnotations(), maxPerMinute: 100000 })).get("/v1/quran/annotation-sources");
      expect(off.body).toEqual({ sources: [], reviewed_only: true, remote_enabled: false });
    } finally {
      if (env === undefined) delete process.env.QURAN_INCLUDE_UNREVIEWED;
      else process.env.QURAN_INCLUDE_UNREVIEWED = env;
    }
  });
});
