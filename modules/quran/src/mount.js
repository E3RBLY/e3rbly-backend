const { createRateLimiter } = require("../../../src/middleware/rateLimit");
const { loadPack } = require("./pack");
const { createQuranRouter } = require("./router");
const { loadAnnotations } = require("./annotations");
const { defaultRemoteTafsir } = require("./remoteSources");

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

/**
 * Mount /v1/quran on an Express app. Loading the pack verifies every checksum,
 * so a modified text file stops the server from starting.
 */
function mountQuran(app, { pack = loadPack(), annotations = loadAnnotations(), remote = defaultRemoteTafsir(), maxPerMinute = Number.parseInt(process.env.RATE_LIMIT_QURAN_PER_MIN, 10) || 120 } = {}) {
  app.use("/v1/quran", envelopeLimiter({ name: "quran", windowMs: 60_000, max: maxPerMinute }), createQuranRouter(pack, annotations, remote));
  return app;
}

module.exports = { mountQuran };
