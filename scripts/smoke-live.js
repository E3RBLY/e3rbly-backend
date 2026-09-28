#!/usr/bin/env node
/**
 * Live smoke test against a DEPLOYED backend. Makes real AI calls (costs money),
 * so it never runs in CI. Run by hand after each deploy:
 *
 *   SMOKE_BASE_URL=https://<deployment>.vercel.app node scripts/smoke-live.js
 *
 * Env:
 *   SMOKE_BASE_URL       required
 *   SMOKE_ID_TOKEN       Firebase ID token, only needed if the deployment uses AUTH_MODE=strict
 *   SMOKE_MAX_AI_CALLS   hard cap on AI calls per run (default 10)
 *
 * Exit code 1 if any check fails.
 */
const BASE = (process.env.SMOKE_BASE_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.SMOKE_ID_TOKEN;
const MAX_AI = Number.parseInt(process.env.SMOKE_MAX_AI_CALLS || '10', 10);

if (!BASE) {
  console.error('Set SMOKE_BASE_URL, e.g. SMOKE_BASE_URL=https://e3rbly-backend.vercel.app');
  process.exit(2);
}

const corpus = require('../tests/fixtures/arabic_corpus.json').sentences;
const SAMPLE = ['v01', 'n02', 'h03', 'p01', 's02'].map((id) => corpus.find((s) => s.id === id).text);
const HARAKAT = /[ً-ْٰ]/;

let aiCalls = 0;
const results = [];

async function call(name, method, path, body, { ai = false, check } = {}) {
  if (ai && aiCalls >= MAX_AI) {
    results.push({ name, result: 'SKIPPED', status: '-', ms: 0, note: `AI cap ${MAX_AI} reached` });
    return;
  }
  if (ai) aiCalls += 1;
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const t0 = Date.now();
  let status = 0;
  let json;
  let note = '';
  try {
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(65000),
    });
    status = res.status;
    json = await res.json().catch(() => undefined);
    note = check ? check(status, json) || '' : status === 200 ? '' : `HTTP ${status}`;
  } catch (e) {
    note = `request failed: ${e.name}`;
  }
  const ms = Date.now() - t0;
  const code = json && json.code ? ` code=${json.code}` : '';
  results.push({ name, result: note ? 'FAIL' : 'PASS', status, ms, note: note ? note + code : '' });
}

const expect200 = (pred, msg) => (status, json) => (status !== 200 ? `HTTP ${status}` : pred(json) ? '' : msg);

(async () => {
  await call('GET /', 'GET', '/', null, { check: expect200((j) => j && j.message, 'no message') });
  await call('GET /api/config', 'GET', '/api/config', null, {
    check: expect200((j) => j && j.apiAvailable === true, 'apiAvailable is false (GOOGLE_GENAI_API_KEY missing?)'),
  });
  await call('GET concept-types', 'GET', '/api/grammar/concept-types', null, {
    check: expect200((j) => j && Array.isArray(j.conceptTypes) && j.conceptTypes.length === 12, 'unexpected conceptTypes'),
  });
  await call('POST quiz/evaluate', 'POST', '/api/quiz/evaluate', { questionId: 'q', userAnswerIndex: 1, correctAnswerIndex: 1 }, {
    check: expect200((j) => j && j.isCorrect === true, 'isCorrect not true'),
  });
  await call('POST analyze/text (non-Arabic -> 400)', 'POST', '/api/analysis/analyze/text', { arabicText: 'hello' }, {
    check: (s) => (s === 400 ? '' : `expected 400, got ${s}`),
  });

  for (const text of SAMPLE) {
    await call(`POST analyze/text "${text}"`, 'POST', '/api/analysis/analyze/text', { arabicText: text }, {
      ai: true,
      check: expect200(
        (j) => j && typeof j.explanation === 'string' && /[؀-ۿ]/.test(j.explanation),
        'explanation missing or not Arabic',
      ),
    });
  }
  await call('POST analyze (structured)', 'POST', '/api/analysis/analyze', { arabicText: SAMPLE[0] }, {
    ai: true,
    check: expect200(
      (j) => j && Array.isArray(j.tokens) && j.tokens.length > 0 && j.tokens.some((t) => HARAKAT.test(t.diacritized || '')),
      'no tokens, or no harakat in diacritized forms',
    ),
  });
  await call('POST quiz/generate', 'POST', '/api/quiz/generate', { topic: 'الفاعل', difficulty: 'beginner', questionCount: 2 }, {
    ai: true,
    check: expect200((j) => j && Array.isArray(j.quiz) && j.quiz.length > 0, 'empty quiz'),
  });
  await call('POST exercises/generate', 'POST', '/api/exercises/generate', { difficulty: 'beginner', exerciseType: 'multiple-choice', count: 2 }, {
    ai: true,
    check: expect200((j) => j && Array.isArray(j.exercises) && j.exercises.length > 0, 'no exercises'),
  });
  await call('POST grammar/explanation', 'POST', '/api/grammar/explanation', { conceptType: 'case', conceptName: 'nominative' }, {
    ai: true,
    check: expect200((j) => j && j.nameArabic && Array.isArray(j.examples), 'bad concept'),
  });

  const aiMs = results.filter((r) => r.ms && r.name.startsWith('POST') && !r.name.includes('evaluate') && !r.name.includes('400')).map((r) => r.ms).sort((a, b) => a - b);
  const p50 = aiMs.length ? aiMs[Math.floor(aiMs.length / 2)] : 0;
  const max = aiMs.length ? aiMs[aiMs.length - 1] : 0;

  console.log(`\nSmoke test: ${BASE}   (${new Date().toISOString()})`);
  console.log('| Check | Result | Status | Latency | Notes |\n|---|---|---|---|---|');
  for (const r of results) console.log(`| ${r.name} | ${r.result} | ${r.status} | ${r.ms}ms | ${r.note} |`);
  console.log(`\nAI calls made: ${aiCalls}/${MAX_AI}   AI latency p50 ${p50}ms, max ${max}ms`);
  const failed = results.filter((r) => r.result === 'FAIL').length;
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
})();
