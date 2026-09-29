/**
 * In-memory response cache for AI routes whose answer is deterministic for the same input
 * (i'rab, structured analysis, grammar explanations). Cuts AI cost and latency for repeated
 * requests; quiz/exercise generation is NOT cached because users expect new questions.
 *
 * Per server instance (Vercel reuses instances, so hits are common but not guaranteed).
 * The key is the exact request body: harakat are part of the key, never normalized away.
 * Only 200 responses are stored.
 *
 * Env: AI_CACHE_MAX_ENTRIES (default 500, 0 disables), AI_CACHE_TTL_MS (default 24h).
 */

function intFromEnv(name, fallback) {
  const n = Number.parseInt(process.env[name], 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** JSON with sorted object keys, so {a,b} and {b,a} share a cache entry. */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function createResponseCache({
  maxEntries = intFromEnv('AI_CACHE_MAX_ENTRIES', 500),
  ttlMs = intFromEnv('AI_CACHE_TTL_MS', 24 * 60 * 60 * 1000),
  now = Date.now,
} = {}) {
  const entries = new Map(); // key -> { body, expiresAt }; Map order = LRU order

  function middleware(req, res, next) {
    if (maxEntries === 0) return next();

    const key = `${req.method} ${req.baseUrl}${req.path} ${stableStringify(req.body ?? null)}`;
    const hit = entries.get(key);
    if (hit && hit.expiresAt > now()) {
      entries.delete(key); // refresh LRU position
      entries.set(key, hit);
      res.set('X-Cache', 'HIT');
      return res.json(hit.body);
    }
    if (hit) entries.delete(key);

    res.set('X-Cache', 'MISS');
    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) {
        entries.set(key, { body, expiresAt: now() + ttlMs });
        while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
      }
      return json(body);
    };
    return next();
  }

  middleware.size = () => entries.size;
  middleware.clear = () => entries.clear();
  return middleware;
}

module.exports = { createResponseCache, stableStringify };
