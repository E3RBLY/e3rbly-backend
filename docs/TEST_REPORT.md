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
| New Vercel **Preview** | — | pending | Needs the new account + new Gemini key (DEPLOY.md §1) |
| New Vercel **Production** | — | pending | |

## Mobile

| Check | Result | Where |
|---|---|---|
| `flutter analyze` (report-only) | 0 errors | CI, Flutter 3.29.3 |
| `flutter test`: quota manager, error handler, font manifest, env config | PASS | CI |
| Manual run on a device against the new backend | pending | owner |
