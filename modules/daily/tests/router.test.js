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
