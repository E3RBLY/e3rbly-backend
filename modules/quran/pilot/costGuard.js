/**
 * Hard limit on what a pilot run may use. Two modes:
 *
 *  - paid: a USD cap. Every call must `reserve` its worst case first; if that would push the
 *    total past the cap, nothing is sent. Prices are supplied by the owner (USD per 1M tokens);
 *    this code never assumes a price.
 *  - free: no money involved. A hard cap on the NUMBER of calls instead, so a free-tier run
 *    stays small and cannot silently exhaust the daily quota.
 */
class CostGuard {
  constructor({ capUsd, priceInPerM, priceOutPerM }) {
    for (const [k, v] of Object.entries({ capUsd, priceInPerM, priceOutPerM })) {
      if (!Number.isFinite(v) || v <= 0) throw new Error(`${k} must be a positive number`);
    }
    Object.assign(this, { capUsd, priceInPerM, priceOutPerM, freeTier: false, maxCalls: Infinity });
    this.spentUsd = 0;
    this.calls = 0;
    this.attempts = 0;
  }

  /** Free-tier guard: no dollars, at most `maxCalls` requests (retries count). */
  static free({ maxCalls }) {
    if (!Number.isInteger(maxCalls) || maxCalls <= 0) throw new Error("maxCalls must be a positive integer");
    const guard = Object.create(CostGuard.prototype);
    Object.assign(guard, { capUsd: 0, priceInPerM: 0, priceOutPerM: 0, freeTier: true, maxCalls });
    guard.spentUsd = 0;
    guard.calls = 0;
    guard.attempts = 0;
    return guard;
  }

  cost(inputTokens, outputTokens) {
    return (inputTokens * this.priceInPerM + outputTokens * this.priceOutPerM) / 1e6;
  }

  /** Throws BUDGET_EXCEEDED unless this call still fits under the cap (USD, or call count when free). */
  reserve(estInputTokens, maxOutputTokens) {
    if (this.freeTier) {
      if (this.attempts >= this.maxCalls) {
        const err = new Error(`free-tier call limit reached (${this.maxCalls} requests)`);
        err.code = "BUDGET_EXCEEDED";
        throw err;
      }
      this.attempts += 1;
      return 0;
    }
    const worst = this.cost(estInputTokens, maxOutputTokens);
    if (this.spentUsd + worst > this.capUsd) {
      const err = new Error(`budget cap $${this.capUsd} would be exceeded (spent $${this.spentUsd.toFixed(4)}, next call worst case $${worst.toFixed(4)})`);
      err.code = "BUDGET_EXCEEDED";
      throw err;
    }
    this.attempts += 1;
    return worst;
  }

  record(inputTokens, outputTokens) {
    const c = this.cost(inputTokens, outputTokens);
    this.spentUsd += c;
    this.calls += 1;
    return c;
  }
}

module.exports = { CostGuard };
