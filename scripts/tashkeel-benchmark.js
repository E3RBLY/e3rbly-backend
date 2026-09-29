#!/usr/bin/env node
/**
 * Tashkeel benchmark against a deployed backend (real AI calls, one per gold sentence).
 *   SMOKE_BASE_URL=https://<deployment> node scripts/tashkeel-benchmark.js
 * Sends each gold sentence stripped of marks to POST /api/tashkeel and reports DER.
 */
const { der } = require('../src/domain/arabic/der');
const { stripDiacritics } = require('../src/domain/arabic/diacritics');
const gold = require('../tests/fixtures/tashkeel_gold.json').sentences;
const BASE = (process.env.SMOKE_BASE_URL || '').replace(/\/+$/, '');
if (!BASE) { console.error('Set SMOKE_BASE_URL'); process.exit(2); }

(async () => {
  let T = 0, W = 0, ET = 0, EW = 0, invalid = 0, failed = 0;
  for (const g of gold) {
    const res = await fetch(`${BASE}/api/tashkeel`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: stripDiacritics(g) }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.status !== 200) { failed += 1; console.log(`FAIL ${res.status} ${j.code || ''}  ${g}`); continue; }
    const r = der(g, j.text);
    if (!r.valid) { invalid += 1; console.log(`INVALID  ${g}`); continue; }
    T += r.total; W += r.wrong; ET += r.endTotal; EW += r.endWrong;
    console.log(`${(r.der * 100).toFixed(0).padStart(3)}%  ${j.text}   (gold: ${g})`);
    await new Promise((ok) => setTimeout(ok, 1500)); // stay under rate limits
  }
  console.log(`\nDER ${(100 * W / T).toFixed(1)}%  case-ending DER ${(100 * EW / ET).toFixed(1)}%  failed ${failed}  invalid ${invalid}  (n=${gold.length})`);
})();
