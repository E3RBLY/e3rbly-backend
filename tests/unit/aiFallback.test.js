/**
 * Gemini -> Groq fallback. global.fetch is mocked; nothing leaves the machine.
 */
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_KEY = 'groq-test-key-SHOULD-NEVER-LEAK';

const geminiOk = (text) => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }),
});
const groqOk = (content) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] }),
});
const statusResponse = (status) => ({ ok: false, status, json: async () => ({ error: { code: status } }) });
const urls = () => fetch.mock.calls.map(([url]) => url);

let ai;
beforeEach(() => {
  jest.resetModules();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  process.env.GOOGLE_GENAI_API_KEY = 'gemini-key';
  process.env.GROQ_API_KEY = GROQ_KEY;
  process.env.AI_MAX_RETRIES = '1';
  delete process.env.GROQ_MODEL;
  global.fetch = jest.fn();
  ai = require('../../src/services/aiService');
});
afterEach(() => {
  for (const k of ['GOOGLE_GENAI_API_KEY', 'GROQ_API_KEY', 'GROQ_MODEL', 'AI_MAX_RETRIES', 'AI_FALLBACK_COOLDOWN_MS', 'AI_TOTAL_BUDGET_MS', 'AI_TIMEOUT_MS']) delete process.env[k];
  jest.restoreAllMocks();
});

test('Gemini healthy: Groq is never called', async () => {
  fetch.mockResolvedValue(geminiOk('نص'));
  await expect(ai.generateContent('p')).resolves.toBe('نص');
  expect(urls()).toEqual([GEMINI_URL]);
});

test('Gemini rate-limited: switches to Groq at once (no Gemini retry) and returns its text', async () => {
  fetch.mockResolvedValueOnce(statusResponse(429)).mockResolvedValueOnce(groqOk('الجملة الأصلية: ذهب الولد'));
  await expect(ai.generateContent('أعرب: ذهب الولد')).resolves.toBe('الجملة الأصلية: ذهب الولد');
  expect(urls()).toEqual([GEMINI_URL, GROQ_URL]);

  const init = fetch.mock.calls[1][1];
  expect(init.headers.Authorization).toBe(`Bearer ${GROQ_KEY}`);
  const body = JSON.parse(init.body);
  expect(body.model).toBe('openai/gpt-oss-120b');
  expect(body.messages).toEqual([{ role: 'user', content: 'أعرب: ذهب الولد' }]); // Arabic sent unchanged
  expect(body.response_format).toBeUndefined();
});

test('default: Gemini is tried first on EVERY request, even right after a quota error', async () => {
  fetch
    .mockResolvedValueOnce(statusResponse(429))
    .mockResolvedValueOnce(groqOk('a'))
    .mockResolvedValueOnce(geminiOk('b'));
  await expect(ai.generateContent('p1')).resolves.toBe('a');
  await expect(ai.generateContent('p2')).resolves.toBe('b');
  expect(urls()).toEqual([GEMINI_URL, GROQ_URL, GEMINI_URL]);
});

test('with AI_FALLBACK_COOLDOWN_MS set, a failed Gemini is skipped during the cooldown', async () => {
  process.env.AI_FALLBACK_COOLDOWN_MS = '60000';
  fetch
    .mockResolvedValueOnce(statusResponse(429))
    .mockResolvedValueOnce(groqOk('a'))
    .mockResolvedValueOnce(groqOk('b'));
  await ai.generateContent('p1');
  await expect(ai.generateContent('p2')).resolves.toBe('b');
  expect(urls()).toEqual([GEMINI_URL, GROQ_URL, GROQ_URL]);
});

test('cooldown expires: Gemini is tried first again', async () => {
  process.env.AI_FALLBACK_COOLDOWN_MS = '0';
  fetch
    .mockResolvedValueOnce(statusResponse(429))
    .mockResolvedValueOnce(groqOk('a'))
    .mockResolvedValueOnce(geminiOk('b'));
  await ai.generateContent('p1');
  await expect(ai.generateContent('p2')).resolves.toBe('b');
  expect(urls()).toEqual([GEMINI_URL, GROQ_URL, GEMINI_URL]);
});

test('accept() rejects Gemini reply format: Groq gets a turn, accepted text is returned', async () => {
  fetch.mockResolvedValueOnce(geminiOk('bad')).mockResolvedValueOnce(groqOk('good'));
  const accept = (t) => (t === 'good' ? 'GOOD' : null);
  await expect(ai.generateContent('p', { accept })).resolves.toBe('GOOD');
  expect(urls()).toEqual([GEMINI_URL, GROQ_URL]);
});

test('accept() rejects every provider -> AI_BAD_RESPONSE', async () => {
  fetch.mockResolvedValueOnce(geminiOk('bad')).mockResolvedValueOnce(groqOk('bad'));
  await expect(ai.generateContent('p', { accept: () => null })).rejects.toMatchObject({ code: 'AI_BAD_RESPONSE' });
});

test('structured: Groq uses JSON mode and the result is parsed', async () => {
  fetch.mockResolvedValueOnce(statusResponse(503)).mockResolvedValueOnce(groqOk('{"quiz":[]}'));
  await expect(ai.generateStructuredContent('p')).resolves.toEqual({ quiz: [] });
  expect(JSON.parse(fetch.mock.calls[1][1].body).response_format).toEqual({ type: 'json_object' });
});

test('Gemini returns unparseable JSON: Groq gets a turn', async () => {
  fetch.mockResolvedValueOnce(geminiOk('not json')).mockResolvedValueOnce(groqOk('{"ok":true}'));
  await expect(ai.generateStructuredContent('p')).resolves.toEqual({ ok: true });
});

test('no Gemini key: Groq alone serves the request', async () => {
  delete process.env.GOOGLE_GENAI_API_KEY;
  fetch.mockResolvedValue(groqOk('x'));
  await expect(ai.generateContent('p')).resolves.toBe('x');
  expect(urls()).toEqual([GROQ_URL]);
});

test('GROQ_MODEL overrides the fallback model', async () => {
  process.env.GROQ_MODEL = 'llama-3.3-70b-versatile';
  fetch.mockResolvedValueOnce(statusResponse(429)).mockResolvedValueOnce(groqOk('x'));
  await ai.generateContent('p');
  expect(JSON.parse(fetch.mock.calls[1][1].body).model).toBe('llama-3.3-70b-versatile');
});

test('both providers down: typed error from the last provider, keys never leaked', async () => {
  fetch.mockResolvedValue(statusResponse(429));
  const err = await ai.generateContent('p').catch((e) => e);
  expect(err).toBeInstanceOf(ai.AiServiceError);
  expect(err.code).toBe('AI_RATE_LIMITED');
  expect(JSON.stringify({ m: err.message, s: err.stack })).not.toContain(GROQ_KEY);
});

test('Groq empty reply -> AI_EMPTY', async () => {
  delete process.env.GOOGLE_GENAI_API_KEY;
  process.env.AI_MAX_RETRIES = '0';
  fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] }) });
  await expect(ai.generateContent('p')).rejects.toMatchObject({ code: 'AI_EMPTY' });
});

test('Groq reply cut off at the token limit -> AI_TRUNCATED (partial JSON is never parsed)', async () => {
  delete process.env.GOOGLE_GENAI_API_KEY;
  fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"quiz":[' }, finish_reason: 'length' }] }) });
  await expect(ai.generateStructuredContent('p')).rejects.toMatchObject({ code: 'AI_TRUNCATED' });
});

test('Gemini output cut off: Groq gets a turn', async () => {
  fetch
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"q' }] }, finishReason: 'MAX_TOKENS' }] }) })
    .mockResolvedValueOnce(groqOk('{"ok":true}'));
  await expect(ai.generateStructuredContent('p')).resolves.toEqual({ ok: true });
});

test('no provider configured -> AI_NOT_CONFIGURED', async () => {
  delete process.env.GOOGLE_GENAI_API_KEY;
  delete process.env.GROQ_API_KEY;
  await expect(ai.generateContent('p')).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' });
  expect(fetch).not.toHaveBeenCalled();
});

describe('total time budget (the app gives up after 60s)', () => {
  const delayed = (ms, response) => () => new Promise((resolve) => setTimeout(() => resolve(response), ms));

  test('each attempt timeout is capped by the remaining budget', async () => {
    process.env.AI_TOTAL_BUDGET_MS = '5000';
    process.env.AI_TIMEOUT_MS = '20000';
    const spy = jest.spyOn(AbortSignal, 'timeout');
    fetch.mockResolvedValue(geminiOk('x'));
    await ai.generateContent('p');
    expect(spy.mock.calls[0][0]).toBeLessThanOrEqual(5000);
  });

  test('slow Gemini used up the budget: Groq is not started, request fails fast', async () => {
    process.env.AI_TOTAL_BUDGET_MS = '1200';
    fetch.mockImplementationOnce(delayed(400, statusResponse(503))).mockResolvedValue(groqOk('late'));
    const err = await ai.generateContent('p').catch((e) => e);
    expect(err).toBeInstanceOf(ai.AiServiceError);
    expect(urls()).toEqual([GEMINI_URL]);
  });

  test('no retry backoff that would run past the budget', async () => {
    delete process.env.GOOGLE_GENAI_API_KEY;
    process.env.AI_TOTAL_BUDGET_MS = '1500';
    process.env.AI_MAX_RETRIES = '3';
    fetch.mockResolvedValue(statusResponse(503));
    const t0 = Date.now();
    await expect(ai.generateContent('p')).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});
