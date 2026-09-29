const request = require("supertest");
const app = require("../../server");
const { loadPack } = require("../../modules/quran/src/pack");

describe("/v1/quran is mounted in the main app without touching /api", () => {
  test("serves an ayah publicly (no Firebase token, AUTH_MODE does not apply)", async () => {
    const res = await request(app).get("/v1/quran/ayat/112/2");
    expect(res.status).toBe(200);
    expect(res.body.ayah.text).toBe(loadPack().surahs[111][1]);
    expect(res.body.source.name_en).toBe("Tanzil Project");
  });

  test("errors use the module envelope; legacy routes keep their shape", async () => {
    expect((await request(app).get("/v1/quran/ayat/1/9")).body.error.code).toBe("NOT_FOUND");
    expect((await request(app).get("/health")).body).toEqual({ status: "ok" });
    expect((await request(app).get("/api/grammar/concept-types")).status).toBe(200);
  });
});
