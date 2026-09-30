const { createRateLimiter } = require("../../../src/middleware/rateLimit");
const { loadPool } = require("./puzzles");
const { createDailyRouter } = require("./router");

/** Reuse the shared per-IP limiter, but answer in this module's error envelope. */
function envelopeLimiter(options) {
  const limiter = createRateLimiter(options);
  return (req, res, next) => {
    const json = res.json.bind(res);
    res.json = (body) => json(body && body.code === "RATE_LIMITED" ? { error: { code: body.code, message: body.error } } : body);
    limiter(req, res, () => {
      res.json = json;
      next();
    });
  };
}

/** Mount /v1/daily. Loading validates the whole pool, so a broken file stops the server from starting. */
function mountDaily(app, { pool = loadPool(), now, maxPerMinute = Number.parseInt(process.env.RATE_LIMIT_DAILY_PER_MIN, 10) || 120 } = {}) {
  app.use("/v1/daily", envelopeLimiter({ name: "daily", windowMs: 60_000, max: maxPerMinute }), createDailyRouter(pool, { ...(now ? { now } : {}) }));
  return app;
}

module.exports = { mountDaily };
