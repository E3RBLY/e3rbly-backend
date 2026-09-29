/**
 * Gemini client over the REST API (Node's built-in fetch, no SDK).
 *
 * Why no SDK: @google/generative-ai reached end of support on 2025-11-30,
 * and the model it was pinned to (gemini-2.0-flash) was shut down on 2026-06-01.
 * The REST call is small, stable and has no dependency to go stale.
 *
 * Public interface is unchanged for controllers:
 *   generateContent(prompt) -> string
 *   generateStructuredContent(prompt) -> parsed JSON
 *   generateArabicExplanation(prompt) -> string
 *
 * Config (env):
 *   GOOGLE_GENAI_API_KEY  required for any AI call
 *   GEMINI_MODEL          default "gemini-3.6-flash" (Google's listed replacement for 2.0 Flash)
 *   AI_TIMEOUT_MS         per-attempt timeout, default 20000
 *   AI_MAX_RETRIES        retries on retryable errors, default 1
 *   AI_MAX_OUTPUT_TOKENS  default 8192 (thinking tokens count against it)
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-3.6-flash';
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

class AiServiceError extends Error {
  /**
   * @param {string} code  stable machine code (AI_TIMEOUT, AI_RATE_LIMITED, ...)
   * @param {string} message  safe for logs; never contains the API key or user text
   * @param {{status?: number, retryable?: boolean}} [meta]
   */
  constructor(code, message, meta = {}) {
    super(message);
    this.name = 'AiServiceError';
    this.code = code;
    this.status = meta.status;
    this.retryable = Boolean(meta.retryable);
  }
}

function intFromEnv(name, fallback) {
  const n = Number.parseInt(process.env[name], 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function getConfig() {
  return {
    apiKey: process.env.GOOGLE_GENAI_API_KEY,
    model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    timeoutMs: intFromEnv('AI_TIMEOUT_MS', 20000),
    maxRetries: intFromEnv('AI_MAX_RETRIES', 1),
    maxOutputTokens: intFromEnv('AI_MAX_OUTPUT_TOKENS', 8192),
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function backoffMs(attempt) {
  const base = Math.min(4000, 1000 * 2 ** attempt);
  return Math.round(base * (0.8 + Math.random() * 0.4)); // jitter
}

function errorFromStatus(status) {
  if (status === 429) return new AiServiceError('AI_RATE_LIMITED', 'AI provider rate limit or quota exceeded', { status, retryable: true });
  if (status === 400) return new AiServiceError('AI_BAD_REQUEST', 'AI provider rejected the request', { status });
  if (status === 401 || status === 403) return new AiServiceError('AI_AUTH', 'AI provider rejected the API key', { status });
  if (status === 404) return new AiServiceError('AI_MODEL_NOT_FOUND', 'Configured AI model was not found', { status });
  return new AiServiceError('AI_UNAVAILABLE', `AI provider error (HTTP ${status})`, {
    status,
    retryable: RETRYABLE_STATUS.has(status),
  });
}

/** One HTTP call to generateContent. Returns the concatenated text of the first candidate. */
async function callGemini(prompt, { json = false } = {}) {
  const cfg = getConfig();
  if (!cfg.apiKey) {
    throw new AiServiceError('AI_NOT_CONFIGURED', 'GOOGLE_GENAI_API_KEY is not set');
  }

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: cfg.maxOutputTokens,
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
  };

  let res;
  try {
    res = await fetch(`${API_BASE}/models/${encodeURIComponent(cfg.model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new AiServiceError('AI_TIMEOUT', `AI provider did not respond within ${cfg.timeoutMs}ms`, { retryable: true });
    }
    throw new AiServiceError('AI_UNAVAILABLE', 'Could not reach AI provider', { retryable: true });
  }

  if (!res.ok) throw errorFromStatus(res.status);

  let data;
  try {
    data = await res.json();
  } catch {
    throw new AiServiceError('AI_BAD_RESPONSE', 'AI provider returned invalid JSON', { retryable: true });
  }

  if (data?.promptFeedback?.blockReason) {
    throw new AiServiceError('AI_BLOCKED', `AI provider blocked the prompt (${data.promptFeedback.blockReason})`);
  }
  const candidate = data?.candidates?.[0];
  const text = (candidate?.content?.parts || [])
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('');
  if (candidate?.finishReason === 'MAX_TOKENS') {
    // Output was cut off (thinking tokens share this budget); partial JSON can't be parsed.
    throw new AiServiceError('AI_TRUNCATED', 'AI response was cut off at the output token limit');
  }
  if (!text) {
    const reason = candidate?.finishReason || 'NO_CANDIDATE';
    throw new AiServiceError('AI_EMPTY', `AI provider returned no text (${reason})`, { retryable: reason === 'NO_CANDIDATE' });
  }
  return text;
}

/** Run fn, retrying only retryable AiServiceErrors, at most AI_MAX_RETRIES times. */
async function withRetry(fn, maxRetries = getConfig().maxRetries) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = err instanceof AiServiceError && err.retryable;
      if (!retryable || attempt >= maxRetries) throw err;
      console.warn(`AI call failed (${err.code}); retry ${attempt + 1}/${maxRetries}`);
      await sleep(backoffMs(attempt));
    }
  }
}

function parseJson(text) {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Log size only: model output can echo user text (privacy).
    console.error(`AI JSON parse failed (length ${cleaned.length})`);
    throw new AiServiceError('AI_BAD_RESPONSE', 'AI response format invalid');
  }
}

async function generateContent(prompt) {
  return withRetry(() => callGemini(prompt));
}

async function generateArabicExplanation(prompt) {
  return generateContent(prompt);
}

async function generateStructuredContent(prompt) {
  return withRetry(async () => parseJson(await callGemini(prompt, { json: true })));
}

module.exports = {
  generateContent,
  generateStructuredContent,
  generateArabicExplanation,
  withRetry,
  AiServiceError,
  DEFAULT_MODEL,
};
