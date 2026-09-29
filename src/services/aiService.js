/**
 * AI client: Gemini (primary) with Groq as fallback, over REST (Node's built-in fetch, no SDK).
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
 *   GROQ_API_KEY          optional; enables the Groq fallback
 *   GROQ_MODEL            default "openai/gpt-oss-120b"
 *   AI_FALLBACK_COOLDOWN_MS  how long a provider that hit quota/auth/outage is skipped, default 60000
 *
 * Switching: providers are tried in order (Gemini, then Groq), skipping any in cooldown.
 * When another provider is available, a failing one is not retried; we move on at once.
 * The last provider left gets the normal retries.
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-3.6-flash';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';
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
    groqApiKey: process.env.GROQ_API_KEY,
    groqModel: process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
    cooldownMs: intFromEnv('AI_FALLBACK_COOLDOWN_MS', 60000),
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

/** POST a JSON body and return the parsed JSON reply, mapping failures to AiServiceErrors. */
async function postJson(url, headers, body, timeoutMs) {
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new AiServiceError('AI_TIMEOUT', `AI provider did not respond within ${timeoutMs}ms`, { retryable: true });
    }
    throw new AiServiceError('AI_UNAVAILABLE', 'Could not reach AI provider', { retryable: true });
  }

  if (!res.ok) throw errorFromStatus(res.status);

  try {
    return await res.json();
  } catch {
    throw new AiServiceError('AI_BAD_RESPONSE', 'AI provider returned invalid JSON', { retryable: true });
  }
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

  const data = await postJson(
    `${API_BASE}/models/${encodeURIComponent(cfg.model)}:generateContent`,
    { 'x-goog-api-key': cfg.apiKey },
    body,
    cfg.timeoutMs,
  );

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

/** One Groq chat-completions call (OpenAI-compatible). Returns the reply text. */
async function callGroq(prompt, { json = false } = {}) {
  const cfg = getConfig();
  if (!cfg.groqApiKey) {
    throw new AiServiceError('AI_NOT_CONFIGURED', 'GROQ_API_KEY is not set');
  }

  const body = {
    model: cfg.groqModel,
    messages: [{ role: 'user', content: prompt }],
    // gpt-oss reasons before answering (reasoning shares this budget); low effort keeps latency down.
    max_completion_tokens: cfg.maxOutputTokens,
    ...(cfg.groqModel.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low', include_reasoning: false } : {}),
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  };

  const data = await postJson(GROQ_URL, { Authorization: `Bearer ${cfg.groqApiKey}` }, body, cfg.timeoutMs);
  const choice = data?.choices?.[0];
  const text = typeof choice?.message?.content === 'string' ? choice.message.content : '';
  if (choice?.finish_reason === 'length') {
    throw new AiServiceError('AI_TRUNCATED', 'AI response was cut off at the output token limit');
  }
  if (!text) {
    const reason = choice?.finish_reason || 'NO_CANDIDATE';
    throw new AiServiceError('AI_EMPTY', `AI provider returned no text (${reason})`, { retryable: reason === 'NO_CANDIDATE' });
  }
  return text;
}

const PROVIDERS = [
  { name: 'gemini', call: callGemini, configured: (cfg) => Boolean(cfg.apiKey) },
  { name: 'groq', call: callGroq, configured: (cfg) => Boolean(cfg.groqApiKey) },
];

/** provider name -> epoch ms until which it is skipped (per server instance). */
const cooldownUntil = new Map();

/** Errors that say "this provider is unusable right now", not "this request is bad". */
function shouldCoolDown(err) {
  return err.retryable || ['AI_AUTH', 'AI_MODEL_NOT_FOUND'].includes(err.code);
}

/**
 * Run attempt(call) against the configured providers in order, skipping those in cooldown
 * (unless all are). A provider is retried only when it is the last one left.
 */
async function withFallback(attempt) {
  const cfg = getConfig();
  const configured = PROVIDERS.filter((p) => p.configured(cfg));
  if (configured.length === 0) {
    throw new AiServiceError('AI_NOT_CONFIGURED', 'No AI provider key is set (GOOGLE_GENAI_API_KEY or GROQ_API_KEY)');
  }
  const now = Date.now();
  const ready = configured.filter((p) => (cooldownUntil.get(p.name) || 0) <= now);
  const order = ready.length > 0 ? ready : configured;

  let lastErr;
  for (let i = 0; i < order.length; i++) {
    const provider = order[i];
    const isLast = i === order.length - 1;
    try {
      const result = await withRetry(() => attempt(provider.call), isLast ? cfg.maxRetries : 0);
      cooldownUntil.delete(provider.name);
      return result;
    } catch (err) {
      if (!(err instanceof AiServiceError)) throw err;
      lastErr = err;
      if (shouldCoolDown(err)) cooldownUntil.set(provider.name, Date.now() + cfg.cooldownMs);
      if (!isLast) console.warn(`AI provider ${provider.name} failed (${err.code}); switching to ${order[i + 1].name}`);
    }
  }
  throw lastErr;
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
  return withFallback((call) => call(prompt));
}

async function generateArabicExplanation(prompt) {
  return generateContent(prompt);
}

async function generateStructuredContent(prompt) {
  return withFallback(async (call) => parseJson(await call(prompt, { json: true })));
}

module.exports = {
  generateContent,
  generateStructuredContent,
  generateArabicExplanation,
  withRetry,
  AiServiceError,
  DEFAULT_MODEL,
  DEFAULT_GROQ_MODEL,
};
