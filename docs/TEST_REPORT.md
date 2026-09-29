# Test report

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
| New Vercel **Production** `e3rbly-api-new.vercel.app` | 2026-09-29 | **9 PASS / 1 FAIL** | Run from the browser (same-origin fetch); details below |

### Production smoke, 2026-09-29 (`gemini-3.6-flash`, AUTH_MODE=optional)

| Endpoint | Result | Status | Latency | Notes |
|---|---|---|---|---|
| GET /api/config | PASS | 200 | 229ms | `apiAvailable: true` |
| GET /api/grammar/concept-types | PASS | 200 | 97ms | 12 types |
| POST /api/quiz/evaluate | PASS | 200 | 100ms | |
| POST /api/analysis/analyze/text `hello` | PASS | 400 | 90ms | non-Arabic rejected |
| POST /api/analysis/analyze/text `ذهب الولد إلى المدرسة` | PASS | 200 | 10.0s | Correct i'rab (ذهب فعل ماضٍ مبني على الفتح، الولد فاعل مرفوع) |
| POST /api/analysis/analyze/text `إِنَّ الصَّبْرَ مِفْتَاحُ الْفَرَجِ` (full harakat) | PASS | 200 | 11.2s | Harakat preserved in the echo; إنّ correctly identified as حرف توكيد ونصب |
| POST /api/quiz/generate | PASS | 200 | 5.9s | 2 questions, diacritized, correct answer index right |
| POST /api/exercises/generate | PASS | 200 | 12.4s | 2 exercises (question text mixes an English gloss) |
| POST /api/grammar/explanation | PASS | 200 | 14.6s | حالة الرفع, 3 examples |
| POST /api/analysis/analyze (structured) | **FAIL** | 500 | 10.6s | `AI_BAD_RESPONSE`. **Not used by the app.** First try under 5 parallel calls got `AI_RATE_LIMITED` (Gemini free-tier limit). |

**Findings**
1. **Main app flow works** on the new model; i'rab output checked by hand for the two sentences above.
2. **Structured `/analyze` fails** (JSON parse or schema mismatch). Needs the Vercel function log to tell which; likely causes: output truncated by `maxOutputTokens` (thinking tokens share the budget) or schema drift. Unused by the app, so not blocking.
3. **Gemini free-tier rate limit** was hit with 5 simultaneous requests. Real traffic will hit `AI_RATE_LIMITED` unless billing is enabled on the Gemini project (owner decision, cost).
4. AI latency 6–15s (p50 ≈ 11s): under the 20s per-attempt timeout, but slow for users. Caching and a lighter model for simple routes are Phase 3 candidates.

## Mobile

| Check | Result | Where |
|---|---|---|
| `flutter analyze` (report-only) | 0 errors | CI, Flutter 3.29.3 |
| `flutter test`: quota manager, error handler, font manifest, env config | PASS | CI |
| Manual run on a device against the new backend | pending | owner |
