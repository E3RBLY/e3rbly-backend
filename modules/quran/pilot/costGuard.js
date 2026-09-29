/**
 * Hard spending cap. Every call must `reserve` its worst case first; if that would push the
 * total past the cap, nothing is sent. Actual usage is recorded afterwards.
 * Prices are supplied by the owner (USD per 1M tokens); this code never assumes a price.
 */
class CostGuard {
  constructor({ capUsd, priceInPerM, priceOutPerM }) {
    for (const [k, v] of Object.entries({ capUsd, priceInPerM, priceOutPerM })) {
      if (!Number.isFinite(v) || v <= 0) throw new Error(`${k} must be a positive number`);
    }
    Object.assign(this, { capUsd, priceInPerM, priceOutPerM });
    this.spentUsd = 0;
    this.calls = 0;
  }

  cost(inputTokens, outputTokens) {
    return (inputTokens * this.priceInPerM + outputTokens * this.priceOutPerM) / 1e6;
  }

  /** Throws BUDGET_EXCEEDED unless the worst case of this call still fits under the cap. */
  reserve(estInputTokens, maxOutputTokens) {
    const worst = this.cost(estInputTokens, maxOutputTokens);
    if (this.spentUsd + worst > this.capUsd) {
      const err = new Error(`budget cap $${this.capUsd} would be exceeded (spent $${this.spentUsd.toFixed(4)}, next call worst case $${worst.toFixed(4)})`);
      err.code = "BUDGET_EXCEEDED";
      throw err;
    }
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
