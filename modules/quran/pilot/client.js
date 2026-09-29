/**
 * Minimal single-provider client for the pilot (Gemini REST). One provider only: no fallback,
 * so pilot text never goes to a second vendor. Records real token usage, enforces the CostGuard,
 * and never logs the key.
 */
const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Rough heuristic, UNMEASURED: only used to reserve budget before a call; real usage is recorded after.
const estimateTokens = (text) => Math.ceil(text.length / 2);

async function callModel({ apiKey, model, prompt, temperature, guard, maxOutputTokens = 4096, timeoutMs = 60000, fetchImpl = fetch, base = DEFAULT_BASE, maxAttempts = 2, validate }) {
  let attempts = 0;
  let lastError;
  const started = Date.now();
  while (attempts < maxAttempts) {
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
        lastError = Object.assign(new Error(`HTTP ${res.status}`), { retryable: res.status === 429 || res.status >= 500 });
        if (!lastError.retryable) break;
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
  throw failure;
}

module.exports = { callModel, estimateTokens };
