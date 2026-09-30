const express = require("express");
const { todaysPuzzle } = require("./schedule");

const UNREVIEWED_NOTICE = "أسئلة اليوم قيد المراجعة اللغوية وقد تحتوي على أخطاء.";
const MAX_CACHE_SECONDS = 300;

function createDailyRouter(pool, { now = () => Date.now() } = {}) {
  const router = express.Router();

  router.get("/today", (req, res) => {
    const nowMs = now();
    const today = todaysPuzzle(pool, nowMs);
    const secondsLeft = Math.max(0, Math.floor((Date.parse(today.expiresAt) - nowMs) / 1000));
    res.set("Cache-Control", `public, max-age=${Math.min(MAX_CACHE_SECONDS, secondsLeft)}`);
    res.json({
      dayNumber: today.dayNumber,
      date: today.date,
      expiresAt: today.expiresAt,
      reviewStatus: pool.reviewStatus,
      ...(pool.reviewStatus === "unreviewed" ? { notice: UNREVIEWED_NOTICE } : {}),
      puzzle: today.puzzle,
    });
  });

  router.use((req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } }));
  return router;
}

module.exports = { createDailyRouter };
