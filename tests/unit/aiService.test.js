/**
 * Unit tests for the Gemini REST client. global.fetch is mocked; nothing leaves the machine.
 */
const KEY = 'test-key-SHOULD-NEVER-LEAK';

function okResponse(text, extra = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }], ...extra }),
  };
}
const statusResponse = (status) => ({ ok: false, status, json: async () => ({ error: { code: status } }) });

let ai;
beforeEach(() => {
  jest.resetModules();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  process.env.GOOGLE_GENAI_API_KEY = KEY;
  delete process.env.GEMINI_MODEL;
  process.env.AI_MAX_RETRIES = '1';
  global.fetch = jest.fn();
  ai = require('../../src/services/aiService');
});
afterEach(() => {
  delete process.env.GOOGLE_GENAI_API_KEY;
  delete process.env.AI_MAX_RETRIES;
  delete process.env.AI_TIMEOUT_MS;
  jest.restoreAllMocks();
});

test('default model is the documented replacement for gemini-2.0-flash', () => {
  expect(ai.DEFAULT_MODEL).toBe('gemini-3.6-flash');
});

test('generateContent calls the REST API with header auth and returns text', async () => {
  fetch.mockResolvedValue(okResponse('الجملة الأصلية: ذهب الولد'));
  await expect(ai.generateContent('أعرب: ذهب الولد')).resolves.toBe('الجملة الأصلية: ذهب الولد');

  const [url, init] = fetch.mock.calls[0];
  expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent');
  expect(url).not.toContain(KEY); // key goes in a header, never the URL
  expect(init.headers['x-goog-api-key']).toBe(KEY);
  const body = JSON.parse(init.body);
  expect(body.contents[0].parts[0].text).toBe('أعرب: ذهب الولد'); // Arabic sent unchanged
  expect(body.generationConfig.responseMimeType).toBeUndefined();
});

test('GEMINI_MODEL overrides the model', async () => {
  process.env.GEMINI_MODEL = 'gemini-3.8-flash';
  fetch.mockResolvedValue(okResponse('x'));
  await ai.generateContent('p');
  expect(fetch.mock.calls[0][0]).toContain('/models/gemini-3.8-flash:generateContent');
});

test('generateStructuredContent requests JSON mode and parses it', async () => {
  fetch.mockResolvedValue(okResponse('{"quiz":[]}'));
  await expect(ai.generateStructuredContent('p')).resolves.toEqual({ quiz: [] });
  expect(JSON.parse(fetch.mock.calls[0][1].body).generationConfig.responseMimeType).toBe('application/json');
});

test('structured output wrapped in ```json fences is still parsed', async () => {
  fetch.mockResolvedValue(okResponse('```json\n{"a":1}\n```'));
  await expect(ai.generateStructuredContent('p')).resolves.toEqual({ a: 1 });
});

test('unparseable JSON -> AI_BAD_RESPONSE, no retry', async () => {
  fetch.mockResolvedValue(okResponse('not json'));
  await expect(ai.generateStructuredContent('p')).rejects.toMatchObject({ code: 'AI_BAD_RESPONSE' });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('missing API key -> AI_NOT_CONFIGURED without any network call', async () => {
  delete process.env.GOOGLE_GENAI_API_KEY;
  await expect(ai.generateContent('p')).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' });
  expect(fetch).not.toHaveBeenCalled();
});

test('429 is retried once, then succeeds', async () => {
  fetch.mockResolvedValueOnce(statusResponse(429)).mockResolvedValueOnce(okResponse('ok'));
  await expect(ai.generateContent('p')).resolves.toBe('ok');
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('503 twice -> gives up after AI_MAX_RETRIES with AI_UNAVAILABLE', async () => {
  fetch.mockResolvedValue(statusResponse(503));
  await expect(ai.generateContent('p')).rejects.toMatchObject({ code: 'AI_UNAVAILABLE', status: 503 });
  expect(fetch).toHaveBeenCalledTimes(2);
});

test.each([
  [400, 'AI_BAD_REQUEST'],
  [401, 'AI_AUTH'],
  [403, 'AI_AUTH'],
  [404, 'AI_MODEL_NOT_FOUND'],
])('HTTP %i -> %s, not retried', async (status, code) => {
  fetch.mockResolvedValue(statusResponse(status));
  await expect(ai.generateContent('p')).rejects.toMatchObject({ code });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('timeout -> AI_TIMEOUT (retryable)', async () => {
  const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
  fetch.mockRejectedValue(timeout);
  await expect(ai.generateContent('p')).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('blocked prompt -> AI_BLOCKED', async () => {
  fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }) });
  await expect(ai.generateContent('p')).rejects.toMatchObject({ code: 'AI_BLOCKED' });
});

test('candidate with no text -> AI_EMPTY', async () => {
  fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] }),
  });
  await expect(ai.generateContent('p')).rejects.toMatchObject({ code: 'AI_EMPTY' });
});

test('error messages never contain the API key', async () => {
  for (const r of [statusResponse(401), statusResponse(500)]) {
    fetch.mockReset().mockResolvedValue(r);
    const err = await ai.generateContent('p').catch((e) => e);
    expect(String(err.message)).not.toContain(KEY);
  }
});
