/**
 * Minimal single-provider client for the pilot (Gemini REST). One provider only: no fallback,
 * so pilot text never goes to a second vendor. Records real token usage, enforces the CostGuard,
 * and never logs the key.
 */
const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Rough heuristic, UNMEASURED: only used to reserve budget before a call; real usage is recorded after.
const estimateTokens = (text) => Math.ceil(text.length / 2);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Reads a provider error body. Google says which limit was hit: a DAILY quota (stop using this
 * model until tomorrow) versus a per-minute one (wait the stated seconds and retry).
 */
function classifyHttpError(status, bodyText = "") {
  if (status !== 429) return { quota: null, retryAfterMs: 0 };
  const daily = /PerDay|requests per day/i.test(bodyText);
  const minute = !daily && /PerMinute|per minute/i.test(bodyText);
  const seconds = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(bodyText) || /retry in (\d+(?:\.\d+)?)s/i.exec(bodyText);
  return { quota: daily ? "daily" : minute ? "minute" : "unknown", retryAfterMs: seconds ? Math.ceil(Number(seconds[1]) * 1000) : 0 };
}

/**
 * `retryDelayMs`: pause before a retry (free-tier limits are per minute, so retrying instantly
 * just fails again). Tests pass 0.
 */
async function callModel({ apiKey, model, prompt, temperature, guard, maxOutputTokens = 4096, timeoutMs = 60000, fetchImpl = fetch, base = DEFAULT_BASE, maxAttempts = 2, validate, retryDelayMs = 0, sleep = wait }) {
  let attempts = 0;
  let lastError;
  let pendingDelay = 0; // set from the provider's own retry hint
  const started = Date.now();
  while (attempts < maxAttempts) {
    if (attempts > 0 && (pendingDelay || retryDelayMs) > 0) await sleep(pendingDelay || retryDelayMs);
    pendingDelay = 0;
    attempts += 1;
    guard.reserve(estimateTokens(prompt), maxOutputTokens);
    try {
      const res = await fetchImpl(`${base}/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens, responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        // A failed request may still be billed for input; charge the input estimate to stay conservative.
        guard.record(estimateTokens(prompt), 0);
        const info = classifyHttpError(res.status, typeof res.text === "function" ? await res.text().catch(() => "") : "");
        lastError = Object.assign(new Error(`HTTP ${res.status}`), { retryable: res.status === 429 || res.status >= 500, quota: info.quota });
        if (!lastError.retryable || info.quota === "daily") break; // a daily quota does not recover by waiting
        if (info.quota === "minute" && info.retryAfterMs) pendingDelay = Math.min(info.retryAfterMs + 1000, 65000);
        continue;
      }
      const body = await res.json();
      const usage = body.usageMetadata || {};
      // Thinking tokens are billed as output. If usage is missing, charge the worst case.
      const inTok = usage.promptTokenCount ?? estimateTokens(prompt);
      const outTok = usage.candidatesTokenCount !== undefined ? usage.candidatesTokenCount + (usage.thoughtsTokenCount || 0) : maxOutputTokens;
      guard.record(inTok, outTok);
      const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        lastError = Object.assign(new Error("unparseable JSON"), { retryable: true });
        continue;
      }
      const problem = validate ? validate(json) : null;
      if (problem) {
        lastError = Object.assign(new Error(problem), { retryable: true, invalid: true });
        continue;
      }
      return { json, inTok, outTok, attempts, latencyMs: Date.now() - started };
    } catch (err) {
      if (err.code === "BUDGET_EXCEEDED") throw err;
      lastError = Object.assign(new Error(err.name === "TimeoutError" ? "timeout" : err.message), { retryable: true });
    }
  }
  const failure = new Error(`model call failed after ${attempts} attempt(s): ${lastError && lastError.message}`);
  failure.attempts = attempts;
  failure.invalid = Boolean(lastError && lastError.invalid);
  failure.quota = (lastError && lastError.quota) || null;
  throw failure;
}

module.exports = { callModel, estimateTokens, classifyHttpError };
