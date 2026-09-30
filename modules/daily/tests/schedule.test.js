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
