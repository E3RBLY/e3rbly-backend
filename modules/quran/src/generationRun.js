/**
 * Drives a generation run across many ayat and several models.
 *
 * - Models are used in priority order (best first); a weaker one takes over only when the better one is out of quota.
 * - A model that reports a DAILY quota is retired for the rest of the run and the same ayah is
 *   retried on the next model; when none is left the run stops ("come back tomorrow").
 * - Repeated other failures stop the run instead of burning requests.
 * - Everything already stored is skipped, so a stopped run resumes exactly where it ended.
 * The network call and the file writing are injected, so this logic is unit tested without either.
 */

class ModelPool {
  /** strategy: "priority" (default) uses the first live model, so the best model is used until its daily quota is gone; "roundrobin" spreads evenly. */
  constructor(models, { strategy = "priority" } = {}) {
    const unique = [...new Set(models.map((m) => m.trim()).filter(Boolean))];
    if (unique.length === 0) throw new Error("at least one model is required");
    this.models = unique;
    this.strategy = strategy;
    this.exhausted = new Set();
    this.cursor = 0;
    this.cooling = new Map(); // model -> time until which it is left alone (overloaded, timeouts)
    this.used = Object.fromEntries(unique.map((m) => [m, 0]));
  }

  remaining() {
    return this.models.filter((m) => !this.exhausted.has(m));
  }

  /** Next usable model that is not excluded or cooling down, or null. `remaining()` tells whether quota is what ran out. */
  next({ exclude = new Set(), now = Date.now() } = {}) {
    const live = this.remaining().filter((m) => !exclude.has(m) && (this.cooling.get(m) || 0) <= now);
    if (live.length === 0) return null;
    if (this.strategy === "priority") return live[0];
    const model = live[this.cursor % live.length];
    this.cursor += 1;
    return model;
  }

  /** Leave a misbehaving (overloaded) model alone for a while; it is not out of quota. */
  cooldown(model, ms, now = Date.now()) {
    this.cooling.set(model, now + ms);
  }

  exhaust(model) {
    this.exhausted.add(model);
  }

  recordUse(model) {
    this.used[model] += 1;
  }
}

/**
 * @param targets  [{ surah, ayah, text }] in the order to process
 * @param needs    (surah, ayah) => boolean: is anything still missing for this ayah?
 * @param generate async ({ model, surah, ayah, text }) => json   (throws errors with .quota / .invalid)
 * @param store    (surah, ayah, json, model) => void
 *
 * Failure handling, per ayah:
 *  - daily quota  -> the model is retired for the run, the same ayah goes to the next model;
 *  - anything else (503 overloaded, timeout, bad output) -> the model is left alone for cooldownMs and the
 *    same ayah goes to the next model. Only when every live model has failed for this ayah is it skipped.
 *  - if every live model failed or is resting, wait for the soonest to recover and try them all again (a few rounds).
 */
async function runGeneration({ targets, needs, generate, store, pool, sleep = () => Promise.resolve(), now = () => Date.now(), intervalMs = 0, cooldownMs = 300000, maxWaitMs = 300000, maxWaitsPerAyah = 3, maxConsecutiveFailures = 6, maxStored = Infinity, onEvent = () => {} }) {
  const summary = { stored: 0, skippedExisting: 0, failed: 0, stopReason: "COMPLETED", byModel: pool.used, retired: [] };
  let streak = 0;
  let firstCall = true;

  for (const target of targets) {
    if (!needs(target.surah, target.ayah)) {
      summary.skippedExisting += 1;
      continue;
    }
    if (summary.stored >= maxStored) {
      summary.stopReason = "LIMIT_REACHED";
      break;
    }

    const tried = new Set();
    let waits = 0;
    let done = false;
    while (!done) {
      const model = pool.next({ exclude: tried, now: now() });
      if (!model) {
        if (pool.remaining().length === 0) {
          summary.stopReason = "ALL_MODELS_EXHAUSTED";
          return summary;
        }
        // Every live model either failed this ayah or is resting. Wait for the soonest to recover, then let
        // all of them try again (a few rounds at most); otherwise give up on this ayah.
        const delay = Math.min(...pool.remaining().map((m) => (pool.cooling.get(m) || 0) - now()));
        if (delay > 0 && waits < maxWaitsPerAyah) {
          waits += 1;
          onEvent({ type: "waiting", ms: Math.min(delay, maxWaitMs) });
          await sleep(Math.min(delay, maxWaitMs));
          tried.clear();
          continue;
        }
        // Every live model failed for this ayah (or stays unavailable): skip it and move on.
        summary.failed += 1;
        streak += 1;
        done = true;
        onEvent({ type: "failed", ...target, model: [...tried].join(","), reason: "every available model failed" });
        if (streak >= maxConsecutiveFailures) {
          summary.stopReason = "TOO_MANY_FAILURES";
          return summary;
        }
        continue;
      }
      if (!firstCall && intervalMs > 0) await sleep(intervalMs);
      firstCall = false;
      try {
        const json = await generate({ model, ...target });
        store(target.surah, target.ayah, json, model);
        pool.recordUse(model);
        summary.stored += 1;
        streak = 0;
        done = true;
        onEvent({ type: "stored", ...target, model });
      } catch (err) {
        tried.add(model);
        if (err.quota === "daily") {
          pool.exhaust(model);
          summary.retired.push(model);
          onEvent({ type: "retired", model });
        } else {
          pool.cooldown(model, cooldownMs, now());
          onEvent({ type: "cooling", model, reason: err.message });
        }
      }
    }
  }
  return summary;
}

/** "78-114,1-77" -> [78..114, 1..77]; "all" -> the Quran with the most-read part first. */
function parseSurahList(spec) {
  if (spec === "all") return [...range(114, 78), ...range(1, 77)].reduce((acc, n) => (acc.includes(n) ? acc : [...acc, n]), []);
  const out = [];
  for (const part of String(spec).split(",")) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) throw new Error(`bad surah list: "${spec}" (use e.g. 112, 78-114 or all)`);
    const [a, b] = [Number(m[1]), Number(m[2] ?? m[1])];
    if (a < 1 || b > 114) throw new Error(`surah out of range in "${spec}"`);
    out.push(...range(a, b));
  }
  return out;
}

function range(from, to) {
  const out = [];
  if (from <= to) for (let n = from; n <= to; n += 1) out.push(n);
  else for (let n = from; n >= to; n -= 1) out.push(n);
  return out;
}

module.exports = { ModelPool, runGeneration, parseSurahList };
