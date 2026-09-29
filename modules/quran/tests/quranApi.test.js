const request = require("supertest");
const { createApp } = require("../src/app");
const { loadPack } = require("../src/pack");

const pack = loadPack();
const app = createApp({ pack, maxPerMinute: 100000 });

const expectEnvelope = (res, status, code) => {
  expect(res.status).toBe(status);
  expect(res.body.error.code).toBe(code);
  expect(typeof res.body.error.message).toBe("string");
  expect(JSON.stringify(res.body)).not.toMatch(/\.js:\d+|stack/i);
};

describe("GET /v1/quran/source", () => {
  test("returns attribution, license, variant and pack checksum", async () => {
    const res = await request(app).get("/v1/quran/source");
    expect(res.status).toBe(200);
    expect(res.body.source).toMatchObject({ name_en: "Tanzil Project", url: "https://tanzil.net", variant: "uthmani" });
    expect(res.body.source.license_url).toContain("tanzil.net");
    expect(res.body).toMatchObject({ surah_count: 114, ayah_count: 6236, provenance: "imported", review_status: "unreviewed" });
    expect(res.body.pack_sha256).toBe(pack.checksums.file_sha256);
    expect(res.body.notice).toMatch(/CHANGING IT IS NOT ALLOWED/);
  });
});

describe("GET /v1/quran/surahs", () => {
  test("lists 114 surahs with ayah counts and checksums", async () => {
    const res = await request(app).get("/v1/quran/surahs");
    expect(res.status).toBe(200);
    expect(res.body.surahs).toHaveLength(114);
    expect(res.body.surahs[1]).toEqual({ number: 2, ayah_count: 286, sha256: pack.checksums.surahs[1] });
    expect(res.body.source.name_en).toBe("Tanzil Project");
  });
});

describe("GET /v1/quran/surahs/:n/ayat", () => {
  test("returns a whole surah identical to the pack", async () => {
    const res = await request(app).get("/v1/quran/surahs/112/ayat");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ surah: 112, from: 1, to: 4, total: 4 });
    expect(res.body.ayat.map((a) => a.text)).toEqual(pack.surahs[111]);
  });

  test("supports from/to ranges", async () => {
    const res = await request(app).get("/v1/quran/surahs/2/ayat?from=255&to=256");
    expect(res.body.ayat.map((a) => a.ayah)).toEqual([255, 256]);
    expect(res.body.ayat[0].text).toBe(pack.surahs[1][254]);
  });

  test("every ayah of the whole Quran is served unchanged", async () => {
    let served = 0;
    for (let s = 1; s <= 114; s += 1) {
      const res = await request(app).get(`/v1/quran/surahs/${s}/ayat`);
      expect(res.body.ayat.map((a) => a.text)).toEqual(pack.surahs[s - 1]);
      served += res.body.ayat.length;
    }
    expect(served).toBe(6236);
  });

  test.each([
    ["/v1/quran/surahs/0/ayat", 400],
    ["/v1/quran/surahs/115/ayat", 400],
    ["/v1/quran/surahs/abc/ayat", 400],
    ["/v1/quran/surahs/1/ayat?from=0", 400],
    ["/v1/quran/surahs/1/ayat?from=5&to=2", 400],
    ["/v1/quran/surahs/1/ayat?foo=1", 400],
    ["/v1/quran/surahs/1/ayat?to=99", 404],
    ["/v1/quran/surahs/1/ayat?from=9", 404],
  ])("%s -> %i in the error envelope", async (url, status) => {
    expectEnvelope(await request(app).get(url), status, status === 400 ? "VALIDATION_ERROR" : "NOT_FOUND");
  });
});

describe("GET /v1/quran/ayat/:s/:a", () => {
  test("returns one ayah with source", async () => {
    const res = await request(app).get("/v1/quran/ayat/1/2");
    expect(res.status).toBe(200);
    expect(res.body.ayah).toEqual({ surah: 1, ayah: 2, text: pack.surahs[0][1], text_ayah: pack.surahs[0][1], basmala_prefixed: false });
    expect(res.body.source.license).toMatch(/CC BY 3.0/);
  });

  test("Tanzil's basmala prefix on ayah 1 is reported, never removed from `text`", async () => {
    const res = await request(app).get("/v1/quran/ayat/2/1");
    const { text, text_ayah: ayah, basmala_prefixed: prefixed } = res.body.ayah;
    expect(text).toBe(pack.surahs[1][0]);
    expect(prefixed).toBe(true);
    expect(ayah).toBe("الٓمٓ");
    expect(text).toBe(`${pack.surahs[0][0]} ${ayah}`);
  });

  test("basmala split is lossless for all 114 surahs; 1:1 is the basmala itself; 9:1 has none", async () => {
    for (let s = 1; s <= 114; s += 1) {
      const { ayah } = (await request(app).get(`/v1/quran/ayat/${s}/1`)).body;
      expect(ayah.basmala_prefixed).toBe(s !== 1 && s !== 9);
      if (ayah.basmala_prefixed) expect(ayah.text.endsWith(` ${ayah.text_ayah}`)).toBe(true);
      else expect(ayah.text_ayah).toBe(ayah.text);
      expect(ayah.text_ayah.length).toBeGreaterThan(0);
    }
  });

  test("Arabic is UTF-8 JSON with harakat byte-identical to the pack", async () => {
    const res = await request(app).get("/v1/quran/ayat/1/1");
    expect(res.headers["content-type"]).toMatch(/application\/json; charset=utf-8/);
    expect(Buffer.from(res.body.ayah.text, "utf8").equals(Buffer.from(pack.surahs[0][0], "utf8"))).toBe(true);
  });

  test.each([
    ["/v1/quran/ayat/1/8", 404, "NOT_FOUND"],
    ["/v1/quran/ayat/2/287", 404, "NOT_FOUND"],
    ["/v1/quran/ayat/1/0", 400, "VALIDATION_ERROR"],
    ["/v1/quran/ayat/x/1", 400, "VALIDATION_ERROR"],
    ["/v1/quran/nope", 404, "NOT_FOUND"],
  ])("%s -> %i", async (url, status, code) => expectEnvelope(await request(app).get(url), status, code));

  test("is read-only", async () => {
    expectEnvelope(await request(app).post("/v1/quran/ayat/1/1").send({ text: "x" }), 404, "NOT_FOUND");
    expectEnvelope(await request(app).delete("/v1/quran/surahs/1/ayat"), 404, "NOT_FOUND");
  });
});

describe("caching, limits, health", () => {
  test("sends ETag + Cache-Control and answers 304 on a repeat", async () => {
    const first = await request(app).get("/v1/quran/ayat/1/1");
    expect(first.headers["cache-control"]).toMatch(/public/);
    const second = await request(app).get("/v1/quran/ayat/1/1").set("If-None-Match", first.headers.etag);
    expect(second.status).toBe(304);
    const other = await request(app).get("/v1/quran/ayat/1/2");
    expect(other.headers.etag).not.toBe(first.headers.etag);
  });

  test("rate limit answers 429 in the error envelope", async () => {
    const limited = createApp({ pack, maxPerMinute: 2 });
    await request(limited).get("/v1/quran/source");
    await request(limited).get("/v1/quran/source");
    const res = await request(limited).get("/v1/quran/source");
    expectEnvelope(res, 429, "RATE_LIMITED");
    expect(res.headers["retry-after"]).toBeDefined();
  });

  test("health check", async () => {
    expect((await request(app).get("/health")).body).toEqual({ status: "ok" });
  });
});
