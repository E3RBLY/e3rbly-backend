/**
 * Abuse/cost limits wired into the real app (audit C3/H4).
 */
jest.mock('../../src/services/aiService', () => ({ generateContent: jest.fn(), generateStructuredContent: jest.fn() }));
const request = require('supertest');

function loadApp(env) {
  let app;
  jest.isolateModules(() => {
    Object.assign(process.env, env);
    app = require('../../server');
  });
  return app;
}

beforeAll(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
afterAll(() => {
  process.env.RATE_LIMIT_API_PER_MIN = '100000';
  process.env.RATE_LIMIT_AI_PER_MIN = '100000';
  delete process.env.MAX_TEXT_CHARS;
});

test('AI routes: 3rd request in a minute from one IP -> 429', async () => {
  const app = loadApp({ RATE_LIMIT_AI_PER_MIN: '2', RATE_LIMIT_API_PER_MIN: '100' });
  const send = () => request(app).post('/api/analysis/analyze/text').set('X-Forwarded-For', '5.5.5.5').send({ arabicText: '' });
  expect((await send()).status).toBe(400); // counted even when invalid
  expect((await send()).status).toBe(400);
  const res = await send();
  expect(res.status).toBe(429);
  expect(res.body.code).toBe('RATE_LIMITED');
});

test('non-AI routes are not counted against the AI limit', async () => {
  const app = loadApp({ RATE_LIMIT_AI_PER_MIN: '1', RATE_LIMIT_API_PER_MIN: '100' });
  for (let i = 0; i < 3; i++) {
    const res = await request(app).post('/api/quiz/evaluate').set('X-Forwarded-For', '6.6.6.6')
      .send({ questionId: 'q', userAnswerIndex: 0, correctAnswerIndex: 0 });
    expect(res.status).toBe(200);
  }
});

test('general API limit applies to GET routes too', async () => {
  const app = loadApp({ RATE_LIMIT_AI_PER_MIN: '100', RATE_LIMIT_API_PER_MIN: '1' });
  expect((await request(app).get('/api/grammar/concept-types').set('X-Forwarded-For', '7.7.7.7')).status).toBe(200);
  expect((await request(app).get('/api/grammar/concept-types').set('X-Forwarded-For', '7.7.7.7')).status).toBe(429);
});

test('arabicText over MAX_TEXT_CHARS -> 400 TEXT_TOO_LONG before any AI call', async () => {
  const ai = require('../../src/services/aiService');
  const app = loadApp({ RATE_LIMIT_AI_PER_MIN: '100', RATE_LIMIT_API_PER_MIN: '100', MAX_TEXT_CHARS: '20' });
  const res = await request(app).post('/api/analysis/analyze/text').send({ arabicText: 'ذهب الولد إلى المدرسة صباحا' });
  expect(res.status).toBe(400);
  expect(res.body).toMatchObject({ code: 'TEXT_TOO_LONG', field: 'arabicText', max: 20 });
  expect(ai.generateContent).not.toHaveBeenCalled();
});

test('harakat count toward the limit (code points, not base letters)', async () => {
  const app = loadApp({ RATE_LIMIT_AI_PER_MIN: '100', RATE_LIMIT_API_PER_MIN: '100', MAX_TEXT_CHARS: '5' });
  const res = await request(app).post('/api/analysis/analyze/text').send({ arabicText: 'ذَهَبَ' }); // 6 code points
  expect(res.status).toBe(400);
  expect(res.body.code).toBe('TEXT_TOO_LONG');
});

test('JSON body over 16kb -> 413', async () => {
  const app = loadApp({ RATE_LIMIT_AI_PER_MIN: '100', RATE_LIMIT_API_PER_MIN: '100' });
  const res = await request(app).post('/api/analysis/explain').send({ arabicText: 'ذهب', analysisResult: { pad: 'x'.repeat(20000) } });
  expect(res.status).toBe(413);
  expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
});
