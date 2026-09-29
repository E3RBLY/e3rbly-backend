/**
 * Characterization tests: pin the CURRENT behavior of every route (Final-Dev @ 13f984c),
 * including known bugs, so refactoring can't change behavior silently.
 *
 * Tests marked "BUG (Hn)" pin broken behavior from docs/AUDIT.md on purpose.
 * When a fix lands, its PR flips that test to the correct behavior.
 *
 * Gemini is never called: src/services/aiService is fully mocked.
 */
jest.mock('../../src/services/aiService', () => ({
  generateContent: jest.fn(),
  generateStructuredContent: jest.fn(),
  generateArabicExplanation: jest.fn(),
  getGenerativeModel: jest.fn(),
  withRetry: jest.fn(),
}));

const request = require('supertest');
const aiService = require('../../src/services/aiService');
const corpus = require('../fixtures/arabic_corpus.json').sentences;

let app;
beforeAll(() => {
  // Silence the very chatty startup/request logging during tests.
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  app = require('../../server');
});

beforeEach(() => jest.clearAllMocks());

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------- public / meta
describe('meta routes', () => {
  test('GET / returns service info', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('E3rbly Backend is running!');
    expect(res.body.authMode).toBe('optional');
    expect(Array.isArray(res.body.apis)).toBe(true);
  });

  test('POST /test-route was removed (debug route) -> 404', async () => {
    const res = await request(app).post('/test-route').send({ a: 1 });
    expect(res.status).toBe(404);
  });

  test('GET /api/config reports config (no AI key in tests)', async () => {
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    // firebaseConfigured now reports the real state (was hard-coded true)
    expect(res.body).toEqual({ authMode: 'optional', apiAvailable: false, firebaseConfigured: false });
  });

  test('malformed JSON body -> 400 INVALID_JSON (was 500 with parser message)', async () => {
    const res = await request(app)
      .post('/api/quiz/evaluate')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_JSON');
    expect(res.body.stack).toBeUndefined();
  });

  test('unknown route -> 404 JSON', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not Found');
  });
});

// ---------------------------------------------------------------- /auth removed (unused by the app; audit C4/H5)
describe('/auth routes are gone', () => {
  test.each([
    ['post', '/auth/register'],
    ['post', '/auth/login'],
    ['get', '/auth/validate-token'],
    ['post', '/auth/request-verification-email'],
    ['post', '/auth/request-password-reset'],
  ])('%s %s -> 404', async (method, path) => {
    const res = await request(app)[method](path).send({ email: 'a@b.co', password: '123456' });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------- auth mode (optional)
describe('AUTH_MODE=optional', () => {
  test('/api routes accept requests with no token', async () => {
    const res = await request(app).get('/api/grammar/concept-types');
    expect(res.status).toBe(200);
  });

  test('/api routes accept requests with an invalid token', async () => {
    const res = await request(app).get('/api/grammar/concept-types').set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------- analysis
const validAnalysis = {
  tokens: [
    { surface: 'ذهب', diacritized: 'ذَهَبَ', root: 'ذهب', pattern: 'فَعَلَ', pos: 'verb', features: { tense: 'past' } },
    { surface: 'الولد', diacritized: 'الْوَلَدُ', root: 'ولد', pattern: 'فَعَل', pos: 'noun', features: { case: 'nominative' } },
  ],
  syntaxTree: { type: 'sentence', role: 'verbal', tokenIndices: [0, 1], children: [] },
};

describe('POST /api/analysis/analyze', () => {
  test('missing text -> 400', async () => {
    const res = await request(app).post('/api/analysis/analyze').send({});
    expect(res.status).toBe(400);
    expect(aiService.generateStructuredContent).not.toHaveBeenCalled();
  });

  test('non-Arabic text -> 400', async () => {
    const res = await request(app).post('/api/analysis/analyze').send({ arabicText: 'hello world' });
    expect(res.status).toBe(400);
  });

  test('legacy field name "text" is rejected (old test used it) -> 400', async () => {
    const res = await request(app).post('/api/analysis/analyze').send({ text: 'ذهب الولد' });
    expect(res.status).toBe(400);
  });

  test('FIXED (H4): one Arabic letter among Latin text is rejected -> 400', async () => {
    const res = await request(app).post('/api/analysis/analyze').send({ arabicText: 'aaaaaaaaaaب' });
    expect(res.status).toBe(400);
    expect(aiService.generateStructuredContent).not.toHaveBeenCalled();
  });

  test('valid AI output -> 200 with validated body', async () => {
    aiService.generateStructuredContent.mockResolvedValue(validAnalysis);
    const res = await request(app).post('/api/analysis/analyze').send({ arabicText: 'ذهب الولد' });
    expect(res.status).toBe(200);
    expect(res.body.tokens).toHaveLength(2);
    expect(res.body.tokens[0].diacritized).toBe('ذَهَبَ');
  });

  test('AI output with wrong shape -> 500, code AI_BAD_RESPONSE, no validation internals', async () => {
    aiService.generateStructuredContent.mockResolvedValue({ nope: true });
    const res = await request(app).post('/api/analysis/analyze').send({ arabicText: 'ذهب الولد' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('AI service returned data in an unexpected format.');
    expect(res.body.code).toBe('AI_BAD_RESPONSE');
    expect(res.body.details).toBeUndefined();
  });

  test('FIXED (H3): provider error message is not sent to the client', async () => {
    aiService.generateStructuredContent.mockRejectedValue(new Error('upstream secret detail'));
    const res = await request(app).post('/api/analysis/analyze').send({ arabicText: 'ذهب الولد' });
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('upstream secret detail');
  });

  test('AiServiceError code is passed through (e.g. AI_TIMEOUT)', async () => {
    aiService.generateStructuredContent.mockRejectedValue(
      Object.assign(new Error('AI provider did not respond within 20000ms'), { code: 'AI_TIMEOUT' }),
    );
    const res = await request(app).post('/api/analysis/analyze').send({ arabicText: 'ذهب الولد' });
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('AI_TIMEOUT');
    expect(res.body.details).toBeUndefined();
  });
});

const goodExplanation = 'الجملة الأصلية: ذهب الولد\nالإعراب:\nذهب: فعل ماض مبني على الفتح';

describe('POST /api/analysis/analyze/text (main app flow)', () => {
  test('valid -> 200 { explanation }', async () => {
    aiService.generateContent.mockResolvedValue(goodExplanation);
    const res = await request(app).post('/api/analysis/analyze/text').send({ arabicText: 'ذهب الولد' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ explanation: goodExplanation });
  });

  test('invalid text -> 400 with Arabic message', async () => {
    const res = await request(app).post('/api/analysis/analyze/text').send({ arabicText: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('نص عربي غير صالح');
  });

  test('AI reply missing required markers -> 500', async () => {
    aiService.generateContent.mockResolvedValue('some unrelated text');
    const res = await request(app).post('/api/analysis/analyze/text').send({ arabicText: 'ذهب الولد' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('فشل في التحليل النحوي');
  });

  describe.each(corpus.map((s) => [s.id, s.kind, s.text]))('corpus %s (%s)', (id, kind, text) => {
    test('accepted, and sent to the model byte-for-byte (harakat preserved)', async () => {
      aiService.generateContent.mockResolvedValue(goodExplanation);
      const res = await request(app).post('/api/analysis/analyze/text').send({ arabicText: text });
      expect(res.status).toBe(200);
      const prompt = aiService.generateContent.mock.calls[0][0];
      expect(prompt.endsWith(`الجملة المراد إعرابها: ${text}\n`)).toBe(true);
    });
  });
});

describe('POST /api/analysis/explain', () => {
  test('missing analysisResult -> 400', async () => {
    const res = await request(app).post('/api/analysis/explain').send({ arabicText: 'ذهب الولد' });
    expect(res.status).toBe(400);
  });

  test('valid -> 200 { explanation }', async () => {
    aiService.generateContent.mockResolvedValue('شرح');
    const res = await request(app)
      .post('/api/analysis/explain')
      .send({ analysisResult: validAnalysis, arabicText: 'ذهب الولد' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ explanation: 'شرح' });
  });
});

// ---------------------------------------------------------------- exercises
const aiExercise = {
  id: 'exercise-1',
  text: 'ذهب الولد',
  question: 'أعرب كلمة الولد',
  type: 'multiple-choice',
  options: ['فاعل', 'مفعول به'],
  hint: 'من قام بالفعل؟',
  correctAnswer: 'فاعل',
  explanation: 'الولد فاعل مرفوع',
};

describe('POST /api/exercises/generate', () => {
  test.each([
    [{}, 'missing fields'],
    [{ difficulty: 'beginner', exerciseType: 'parsing', count: 11 }, 'count > 10'],
    [{ difficulty: 'beginner', exerciseType: 'vocabulary', count: 3 }, 'invalid type'],
  ])('%j -> 400 (%s)', async (body) => {
    const res = await request(app).post('/api/exercises/generate').send(body);
    expect(res.status).toBe(400);
  });

  test('valid -> 200, ids replaced with UUIDs, type forced to request', async () => {
    aiService.generateStructuredContent.mockResolvedValue({ exercises: [aiExercise] });
    const res = await request(app)
      .post('/api/exercises/generate')
      .send({ difficulty: 'beginner', exerciseType: 'parsing', count: 1 });
    expect(res.status).toBe(200);
    expect(res.body.exercises).toHaveLength(1);
    expect(res.body.exercises[0].id).toMatch(UUID);
    expect(res.body.exercises[0].type).toBe('parsing');
  });

  test('AI returns no "exercises" key -> 200 with empty list', async () => {
    aiService.generateStructuredContent.mockResolvedValue({});
    const res = await request(app)
      .post('/api/exercises/generate')
      .send({ difficulty: 'beginner', exerciseType: 'parsing', count: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exercises: [] });
  });
});

describe('POST /api/exercises/check', () => {
  const body = {
    exerciseId: 'x',
    exerciseText: 'ذهب الولد',
    userAnswer: 'فاعل',
    correctAnswer: 'فاعل',
    exerciseType: 'parsing',
  };

  test('missing fields -> 400', async () => {
    const res = await request(app).post('/api/exercises/check').send({});
    expect(res.status).toBe(400);
  });

  test('non-Arabic answer -> 400', async () => {
    const res = await request(app).post('/api/exercises/check').send({ ...body, userAnswer: 'subject' });
    expect(res.status).toBe(400);
  });

  test('valid -> 200 feedback', async () => {
    const feedback = { isCorrect: true, score: 100, feedback: 'صحيح', correctAnswer: 'فاعل', explanation: 'شرح' };
    aiService.generateStructuredContent.mockResolvedValue(feedback);
    const res = await request(app).post('/api/exercises/check').send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(feedback);
  });
});

// ---------------------------------------------------------------- quiz
const aiQuestion = {
  id: 'question-1',
  questionText: 'ما إعراب الولد في: ذهب الولد؟',
  options: ['فاعل', 'مفعول به', 'مبتدأ', 'خبر'],
  correctAnswerIndex: 0,
  explanation: 'فاعل مرفوع',
};

describe('POST /api/quiz/generate', () => {
  test.each([
    [{}, 'missing fields'],
    [{ topic: 'الفاعل', difficulty: 'beginner', questionCount: 16 }, 'count > 15'],
  ])('%j -> 400 (%s)', async (body) => {
    const res = await request(app).post('/api/quiz/generate').send(body);
    expect(res.status).toBe(400);
  });

  test('valid -> 200 with UUIDs and metadata', async () => {
    aiService.generateStructuredContent.mockResolvedValue({ quiz: [aiQuestion] });
    const res = await request(app)
      .post('/api/quiz/generate')
      .send({ topic: 'الفاعل', difficulty: 'beginner', questionCount: 1 });
    expect(res.status).toBe(200);
    expect(res.body.quiz[0].id).toMatch(UUID);
    expect(res.body.quiz[0].topic).toBe('الفاعل');
    expect(res.body.metadata).toMatchObject({ requestedCount: 1, actualCount: 1 });
  });

  test('FIXED (H2): AI failure returns a clean 500, no missing-fallback TypeError', async () => {
    aiService.generateStructuredContent.mockRejectedValue(
      Object.assign(new Error('model down'), { code: 'AI_UNAVAILABLE' }),
    );
    const res = await request(app)
      .post('/api/quiz/generate')
      .send({ topic: 'الفاعل', difficulty: 'beginner', questionCount: 1 });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to generate quiz.', code: 'AI_UNAVAILABLE' });
  });
});

describe('AI provider quota exhausted', () => {
  const rateLimited = () => Object.assign(new Error('quota'), { code: 'AI_RATE_LIMITED' });
  const cases = [
    ['/api/analysis/analyze', { arabicText: 'ذهب الولد إلى المدرسة' }, 'generateStructuredContent'],
    ['/api/analysis/analyze/text', { arabicText: 'ذهب الولد إلى المدرسة' }, 'generateContent'],
    ['/api/quiz/generate', { topic: 'الفاعل', difficulty: 'beginner', questionCount: 1 }, 'generateStructuredContent'],
  ];
  test.each(cases)('FIXED: %s -> 429 AI_RATE_LIMITED (was 500), so the app shows "try again shortly"', async (path, body, fn) => {
    aiService[fn].mockRejectedValue(rateLimited());
    const res = await request(app).post(path).send(body);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('AI_RATE_LIMITED');
    expect(typeof res.body.error).toBe('string');
  });
});

describe('POST /api/quiz/evaluate (no AI)', () => {
  test('correct answer -> score 100', async () => {
    const res = await request(app)
      .post('/api/quiz/evaluate')
      .send({ questionId: 'q', userAnswerIndex: 1, correctAnswerIndex: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isCorrect: true, score: 100, feedback: 'إجابة صحيحة!' });
  });

  test('wrong answer -> score 0', async () => {
    const res = await request(app)
      .post('/api/quiz/evaluate')
      .send({ questionId: 'q', userAnswerIndex: 0, correctAnswerIndex: 1 });
    expect(res.body).toMatchObject({ isCorrect: false, score: 0 });
  });

  test('index out of range -> 400', async () => {
    const res = await request(app)
      .post('/api/quiz/evaluate')
      .send({ questionId: 'q', userAnswerIndex: 4, correctAnswerIndex: 1 });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------- grammar
describe('grammar routes', () => {
  test('GET /api/grammar/concept-types -> 12 types', async () => {
    const res = await request(app).get('/api/grammar/concept-types');
    expect(res.status).toBe(200);
    expect(res.body.conceptTypes).toHaveLength(12);
    expect(res.body.conceptTypes).toContain('case');
  });

  test('GET /api/grammar/concept-values/case -> case values', async () => {
    const res = await request(app).get('/api/grammar/concept-values/case');
    expect(res.status).toBe(200);
    expect(res.body.values).toEqual(['nominative', 'accusative', 'genitive', 'jussive']);
  });

  test('GET /api/grammar/concept-values/bogus -> 400', async () => {
    const res = await request(app).get('/api/grammar/concept-values/bogus');
    expect(res.status).toBe(400);
  });

  test('POST /api/grammar/explanation invalid type -> 400', async () => {
    const res = await request(app).post('/api/grammar/explanation').send({ conceptType: 'x', conceptName: 'y' });
    expect(res.status).toBe(400);
  });

  test('POST /api/grammar/explanation maps invalid related types (حالة إعرابية -> case)', async () => {
    aiService.generateStructuredContent.mockResolvedValue({
      type: 'case',
      name: 'nominative',
      nameArabic: 'الرفع',
      description: 'وصف',
      examples: [{ arabicText: 'جاءَ الولدُ', translation: 'شرح', explanation: 'شرح' }],
      tips: ['نصيحة'],
      relatedConcepts: [{ type: 'حالة إعرابية', name: 'accusative' }],
    });
    const res = await request(app)
      .post('/api/grammar/explanation')
      .send({ conceptType: 'case', conceptName: 'nominative' });
    expect(res.status).toBe(200);
    expect(res.body.relatedConcepts[0].type).toBe('case');
  });

  test('POST /api/grammar/related -> 200', async () => {
    aiService.generateStructuredContent.mockResolvedValue({
      relatedConcepts: [{ type: 'case', name: 'accusative', nameArabic: 'النصب', briefDescription: 'وصف' }],
    });
    const res = await request(app)
      .post('/api/grammar/related')
      .send({ conceptType: 'case', conceptName: 'nominative', count: 1 });
    expect(res.status).toBe(200);
    expect(res.body.relatedConcepts).toHaveLength(1);
  });
});
