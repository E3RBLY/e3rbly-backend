const express = require('express');
const request = require('supertest');
const { createResponseCache, stableStringify } = require('../../src/middleware/responseCache');

function appWith(cache, handler) {
  const app = express();
  app.use(express.json());
  app.post('/api/analysis/analyze/text', cache, handler);
  return app;
}

test('second identical request is served from cache; handler runs once', async () => {
  const handler = jest.fn((req, res) => res.json({ explanation: `إعراب ${req.body.arabicText}` }));
  const app = appWith(createResponseCache({ maxEntries: 10 }), handler);

  const a = await request(app).post('/api/analysis/analyze/text').send({ arabicText: 'ذهب الولد' });
  const b = await request(app).post('/api/analysis/analyze/text').send({ arabicText: 'ذهب الولد' });
  expect(a.headers['x-cache']).toBe('MISS');
  expect(b.headers['x-cache']).toBe('HIT');
  expect(b.body).toEqual(a.body);
  expect(handler).toHaveBeenCalledTimes(1);
});

test('harakat are part of the key (never normalized away)', async () => {
  const handler = jest.fn((req, res) => res.json({ t: req.body.arabicText }));
  const app = appWith(createResponseCache({ maxEntries: 10 }), handler);
  await request(app).post('/api/analysis/analyze/text').send({ arabicText: 'العلم نور' });
  const r = await request(app).post('/api/analysis/analyze/text').send({ arabicText: 'الْعِلْمُ نُورٌ' });
  expect(r.headers['x-cache']).toBe('MISS');
  expect(r.body.t).toBe('الْعِلْمُ نُورٌ');
  expect(handler).toHaveBeenCalledTimes(2);
});

test('errors are never cached', async () => {
  let fail = true;
  const handler = jest.fn((req, res) => (fail ? res.status(429).json({ code: 'AI_RATE_LIMITED' }) : res.json({ ok: 1 })));
  const app = appWith(createResponseCache({ maxEntries: 10 }), handler);
  await request(app).post('/api/analysis/analyze/text').send({ arabicText: 'ذهب' });
  fail = false;
  const r = await request(app).post('/api/analysis/analyze/text').send({ arabicText: 'ذهب' });
  expect(r.status).toBe(200);
  expect(handler).toHaveBeenCalledTimes(2);
});

test('entries expire after the TTL', async () => {
  let t = 1000;
  const handler = jest.fn((req, res) => res.json({ ok: 1 }));
  const app = appWith(createResponseCache({ maxEntries: 10, ttlMs: 50, now: () => t }), handler);
  await request(app).post('/api/analysis/analyze/text').send({ arabicText: 'ذهب' });
  t += 51;
  const r = await request(app).post('/api/analysis/analyze/text').send({ arabicText: 'ذهب' });
  expect(r.headers['x-cache']).toBe('MISS');
  expect(handler).toHaveBeenCalledTimes(2);
});

test('LRU: oldest entry is evicted beyond maxEntries', async () => {
  const cache = createResponseCache({ maxEntries: 2 });
  const handler = jest.fn((req, res) => res.json({ ok: 1 }));
  const app = appWith(cache, handler);
  for (const t of ['أ', 'ب', 'ج']) await request(app).post('/api/analysis/analyze/text').send({ arabicText: t });
  expect(cache.size()).toBe(2);
  const r = await request(app).post('/api/analysis/analyze/text').send({ arabicText: 'أ' });
  expect(r.headers['x-cache']).toBe('MISS');
});

test('maxEntries 0 disables caching', async () => {
  const handler = jest.fn((req, res) => res.json({ ok: 1 }));
  const app = appWith(createResponseCache({ maxEntries: 0 }), handler);
  await request(app).post('/api/analysis/analyze/text').send({ arabicText: 'ذهب' });
  await request(app).post('/api/analysis/analyze/text').send({ arabicText: 'ذهب' });
  expect(handler).toHaveBeenCalledTimes(2);
});

test('stableStringify ignores key order', () => {
  expect(stableStringify({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(stableStringify({ a: [2, { c: 4, d: 3 }], b: 1 }));
});
