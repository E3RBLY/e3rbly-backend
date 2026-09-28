/**
 * Minimal fixed-window rate limiter keyed by client IP.
 *
 * Limits: this state lives in one server instance's memory. On Vercel, several
 * instances may run at once, so the effective limit is "per IP per instance".
 * It stops casual abuse and runaway clients; a shared store (e.g. Redis/Upstash)
 * is the upgrade path if real abuse shows up (docs/DECISIONS.md).
 */

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.ip || (req.socket && req.socket.remoteAddress) || "unknown";
}

function createRateLimiter({ windowMs, max, name = "default", now = () => Date.now() }) {
  const hits = new Map(); // key -> { count, resetAt }
  let lastSweep = now();

  return function rateLimit(req, res, next) {
    if (!max || max <= 0) return next(); // disabled
    const t = now();

    // Sweep expired entries at most once per window to bound memory.
    if (t - lastSweep > windowMs) {
      for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
      lastSweep = t;
    }

    const key = `${name}:${clientIp(req)}`;
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - entry.count)));

    if (entry.count > max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - t) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: "طلبات كثيرة جدًا. يرجى الانتظار قليلًا ثم المحاولة مرة أخرى.",
        code: "RATE_LIMITED",
      });
    }
    return next();
  };
}

module.exports = { createRateLimiter, clientIp };
