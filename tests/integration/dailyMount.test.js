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
