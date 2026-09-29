/**
 * Response cache wiring: deterministic AI routes are cached, generation routes are not.
 * aiService is mocked; nothing leaves the machine.
 */
jest.mock('../../src/services/aiService', () => ({
  generateContent: jest.fn(),
  generateStructuredContent: jest.fn(),
  generateArabicExplanation: jest.fn(),
}));

const request = require('supertest');
const aiService = require('../../src/services/aiService');

let app;
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  process.env.AI_CACHE_MAX_ENTRIES = '100';
  app = require('../../server');
});
afterAll(() => {
  process.env.AI_CACHE_MAX_ENTRIES = '0';
});

test("i'rab: repeat request is a cache HIT, AI called once", async () => {
  aiService.generateContent.mockResolvedValue('الجملة الأصلية: ذهب الولد\nالإعراب:\nذهب: فعل ماض');
  const body = { arabicText: 'ذهب الولد' };
  const a = await request(app).post('/api/analysis/analyze/text').send(body);
  const b = await request(app).post('/api/analysis/analyze/text').send(body);
  expect(a.headers['x-cache']).toBe('MISS');
  expect(b.headers['x-cache']).toBe('HIT');
  expect(b.body).toEqual(a.body);
  expect(aiService.generateContent).toHaveBeenCalledTimes(1);
});

test('quiz generation is never cached (users expect new questions)', async () => {
  aiService.generateStructuredContent.mockResolvedValue({
    quiz: [{ questionText: 'س', options: ['أ', 'ب', 'ج', 'د'], correctAnswerIndex: 0, explanation: 'ش' }],
  });
  const body = { topic: 'الفاعل', difficulty: 'beginner', questionCount: 1 };
  const a = await request(app).post('/api/quiz/generate').send(body);
  const b = await request(app).post('/api/quiz/generate').send(body);
  expect(a.status).toBe(200);
  expect(b.headers['x-cache']).toBeUndefined();
  expect(aiService.generateStructuredContent).toHaveBeenCalledTimes(2);
});

test('GET /health -> 200 ok, no AI', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ status: 'ok' });
});
