# Test report

## Live, all endpoints: production after Groq fallback + markdown fix (2026-09-29 03:01 UTC)

Environment: `https://e3rbly-api-new.vercel.app` (`main` at 61404e2), AUTH_MODE=optional, Gemini primary + Groq fallback.
Every route, valid and invalid input, plus 404, malformed JSON, 16kb body cap, 1000-char text cap and the AI rate limiter.
AI replies content-checked: Arabic present, i'rab markers present, no Markdown reaching the app, structured tokens have string roots.

**34/34 PASS.** 12 AI calls, p50 1.8s, max 10.9s (well under the 60s function limit).
Replies of ~1–2s are Groq (Gemini free-tier quota was exhausted during the run); the switch is seamless.

| Check | Method | Path | Result | Status | Latency |
|---|---|---|---|---|---|
| root lists APIs | GET | `/` | PASS | 200 | 641ms |
| config | GET | `/api/config` | PASS | 200 | 230ms |
| concept types | GET | `/api/grammar/concept-types` | PASS | 200 | 339ms |
| concept types (trailing slash) | GET | `/api/grammar/concept-types/` | PASS | 200 | 103ms |
| concept values: case | GET | `/api/grammar/concept-values/case` | PASS | 200 | 89ms |
| concept values: invalid type -> 400 | GET | `/api/grammar/concept-values/nope` | PASS | 400 | 91ms |
| quiz evaluate: correct | POST | `/api/quiz/evaluate` | PASS | 200 | 135ms |
| quiz evaluate: wrong | POST | `/api/quiz/evaluate` | PASS | 200 | 93ms |
| quiz evaluate: missing fields -> 400 | POST | `/api/quiz/evaluate` | PASS | 400 | 82ms |
| unknown route -> 404 | GET | `/api/does-not-exist` | PASS | 404 | 153ms |
| malformed JSON -> 400 | POST | `/api/quiz/evaluate` | PASS | 400 | 91ms |
| body over 16kb -> 413 | POST | `/api/quiz/evaluate` | PASS | 413 | 144ms |
| analyze: non-Arabic -> 400 | POST | `/api/analysis/analyze` | PASS | 400 | 88ms |
| analyze/text: empty -> 400 | POST | `/api/analysis/analyze/text` | PASS | 400 | 86ms |
| analyze/text: over 1000 chars -> 400 | POST | `/api/analysis/analyze/text` | PASS | 400 | 90ms |
| explain: missing analysisResult -> 400 | POST | `/api/analysis/explain` | PASS | 400 | 85ms |
| exercises generate: missing -> 400 | POST | `/api/exercises/generate` | PASS | 400 | 84ms |
| exercises generate: count 50 -> 400 | POST | `/api/exercises/generate` | PASS | 400 | 83ms |
| exercises check: missing -> 400 | POST | `/api/exercises/check` | PASS | 400 | 87ms |
| grammar explanation: bad type -> 400 | POST | `/api/grammar/explanation` | PASS | 400 | 97ms |
| quiz generate: 20 questions -> 400 | POST | `/api/quiz/generate` | PASS | 400 | 92ms |
| irab text: ذهب الولد إلى المدرسة | POST | `/api/analysis/analyze/text` | PASS | 200 | 8245ms (AI) |
| irab text: الْعِلْمُ نُورٌ | POST | `/api/analysis/analyze/text` | PASS | 200 | 1781ms (AI) |
| irab text: جاء الأصدقاء مسرورين | POST | `/api/analysis/analyze/text` | PASS | 200 | 1420ms (AI) |
| irab text: هل فهمت الدرس؟ | POST | `/api/analysis/analyze/text` | PASS | 200 | 1482ms (AI) |
| irab text: إِنَّ الصَّبْرَ مِفْتَاحُ الْفَرَجِ | POST | `/api/analysis/analyze/text` | PASS | 200 | 1895ms (AI) |
| structured analyze | POST | `/api/analysis/analyze` | PASS | 200 | 1308ms (AI) |
| explain analysis | POST | `/api/analysis/explain` | PASS | 200 | 2238ms (AI) |
| exercises generate | POST | `/api/exercises/generate` | PASS | 200 | 1089ms (AI) |
| exercises check | POST | `/api/exercises/check` | PASS | 200 | 5227ms (AI) |
| grammar explanation: case | POST | `/api/grammar/explanation` | PASS | 200 | 10877ms (AI) |
| grammar related: case | POST | `/api/grammar/related` | PASS | 200 | 1347ms (AI) |
| quiz generate | POST | `/api/quiz/generate` | PASS | 200 | 960ms (AI) |
| AI rate limit burst -> 429 | POST | `/api/analysis/analyze` | PASS | 429 | 0ms |

Open items (not failures):
- Gemini key is free tier: quota runs out after a few calls per minute, so Groq carries most traffic. Enable billing for Gemini if Gemini quality is preferred.
- Old deployment `e3rbly-backend-main.vercel.app` is still dead (suspended key): released app versions need an update.

## Contract / integration (automated, mocked AI): 2026-09-29

Environment: GitHub Actions `ubuntu-latest`, Node 22, `npm ci && npm test`, and locally (Node 22.22).
Branch `chore/vercel-redeploy` (includes every Phase 2 fix).

| Suite | Tests | Result |
|---|---|---|
| `tests/integration/characterization.test.js`: all routes, 40-sentence corpus (harakat preserved), error envelope, removed routes → 404 | 86 | PASS |
| `tests/integration/limits.test.js`: rate limits, text caps, body cap wired into the app | 6 | PASS |
| `tests/unit/aiService.test.js`: Gemini REST client (timeouts, retries, typed errors, key never leaks) | 17 | PASS |
| `tests/unit/authMiddleware.test.js`: strict/optional, Firebase ID tokens | 11 | PASS |
| `tests/unit/rateLimit.test.js` | 5 | PASS |
| `tests/unit/arabicValidator.test.js`: whole corpus + rejects | 50 | PASS |
| **Total** | **175** | **PASS** |

Endpoint coverage: every live route has at least one success test and its validation failures. AI failure modes (timeout, 429, 5xx, bad JSON, blocked, empty) are covered at the client level and pass through to the HTTP layer as `code`.

## Live smoke (`scripts/smoke-live.js`)

| Environment | Date | Result | Notes |
|---|---|---|---|
| Old production `e3rbly-backend-main.vercel.app` | — | NOT RUN | Unreachable from Claude's workspace. Expected FAIL on AI routes: retired `gemini-2.0-flash`. |
| Local dry run (fake key) | 2026-09-29 | 5 PASS / 3 FAIL (expected) / 6 SKIPPED (cap) | Proves the script: non-AI checks pass, AI checks fail with `code=AI_AUTH`, the AI cap is enforced, exit code 1. Server logs contained no user text. |
| New Vercel **Preview** | — | pending | Needs the new account + new Gemini key (DEPLOY.md §1) |
| New Vercel **Production** | — | pending | |

## Mobile

| Check | Result | Where |
|---|---|---|
| `flutter analyze` (report-only) | 0 errors | CI, Flutter 3.29.3 |
| `flutter test`: quota manager, error handler, font manifest, env config | PASS | CI |
| Manual run on a device against the new backend | pending | owner |
