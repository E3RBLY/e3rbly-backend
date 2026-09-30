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

## Quran content module (local, 2026-09-29)

`npx jest`: 15 suites, 405 tests PASS (legacy 351 unchanged + 54 new: module, pilot harness, mount). No AI calls, no network.

| Endpoint | Result | Notes |
|---|---|---|
| GET `/v1/quran/source` | PASS | attribution, checksum, notice |
| GET `/v1/quran/surahs` | PASS | 114 rows |
| GET `/v1/quran/surahs/:n/ayat` | PASS | all 114 surahs served byte-identical to the pack (6,236 ayat); 400/404 matrix incl. `from`/`to`, unknown query keys |
| GET `/v1/quran/ayat/:s/:a` | PASS | UTF-8 JSON, harakat intact, basmala split lossless for all 114 |
| Read-only (POST/DELETE) | PASS | 404 envelope |
| ETag / 304, 429 envelope, `/health` | PASS | |
| Integrity | PASS | per-surah + whole-file SHA-256, independent ayah counts (114 / 6,236), tamper test (one changed harakah is detected), missing-ayah test |
| Mounted in main app | PASS | `tests/integration/quranMount.test.js`: public (no token), legacy routes unchanged |
| Live Preview smoke | NOT RUN | `scripts/smoke-live.js` now checks the Quran routes; run after the Preview deploy. Watch the function log at start-up: the pack must load (data files are read with `fs` from `modules/quran/data`) |

## Ayah annotations (local, 2026-09-30)

`npx jest`: 18 suites, 437 tests PASS. `npm run validate:annotations` OK (0 packs). Covered: reviewed-only serving, staging opt-in, wujuh kept separate and attributed, every invalid-pack rule (missing/unknown license file, path traversal, enums, ayah refs, empty body, unlabeled wujuh, folder/id mismatch), empty answer for uncovered ayat, kind filter, 400/404 envelope, ETag changes with content. Uses clearly-marked test fixtures only; no real tafsir/i'rab text exists in the repo. Live Preview smoke: NOT RUN.

## Tafsir books on demand (local, 2026-09-30)

`npx jest`: 20 suites, 489 tests PASS. Covered with a fake AlQuran Cloud: one upstream request for six books, exact URL shape, priority order, kind filter fetches only its books, cache hit, partial cache fill, concurrent-request merging, bounded LRU, HTTP error / timeout / circuit breaker (3 failures, 60 s pause, retry after), failures not cached, upstream data validation (wrong ayah, wrong surah, empty, non-string, oversized, unknown edition), partial answers keep good books and report the missing ones, `no-store` on partial vs `s-maxage` on complete, 304 on repeat, kill switches, config validation (missing license file, duplicate id), 404 without touching upstream. **Real-service check (manual):** 2:255 returned all six books in 820 ms, second call 0 ms from cache.
