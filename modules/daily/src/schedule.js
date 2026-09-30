const DAY_MS = 86_400_000;
/** Fixed UTC+3 (Riyadh/Baghdad, no daylight saving) so the day boundary never moves. */
const OFFSET_MS = 3 * 3_600_000;

function localDay(nowMs) {
  return Math.floor((nowMs + OFFSET_MS) / DAY_MS);
}

/** The puzzle for the local day containing `nowMs`; the same for every caller. */
function todaysPuzzle(pool, nowMs) {
  const day = localDay(nowMs);
  const epochDay = Math.floor(Date.parse(`${pool.epoch}T00:00:00Z`) / DAY_MS);
  const dayNumber = Math.max(1, day - epochDay + 1);
  return {
    dayNumber,
    date: new Date(day * DAY_MS).toISOString().slice(0, 10),
    expiresAt: new Date((day + 1) * DAY_MS - OFFSET_MS).toISOString(),
    puzzle: pool.puzzles[(dayNumber - 1) % pool.puzzles.length],
  };
}

module.exports = { todaysPuzzle, DAY_MS, OFFSET_MS };
