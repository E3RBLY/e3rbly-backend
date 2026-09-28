# e3rbly (اعربلي) — Phase 0 Audit

- **Date:** 2026-09-29
- **Scope:** `E3RBLY/e3rbly-backend` (branch `Final-Dev`, HEAD `d9bc833`) and `E3RBLY/e3rbly-mobile` (branch `main`, HEAD `1c023d3`).
- **Method:** read-only. The local copies on `H:\Projects\e3rbly` are identical to GitHub apart from Windows line endings (checked file by file). No code was changed.

---

## 1. Summary

The app itself is reasonably organized. The mobile side has feature folders, cubits and get_it, and the backend is a small Express API over Gemini. But the **operational state is poor**:

1. **Secrets are public.** The backend repo is public and has `.env` (Gemini key, JWT secret) and the Firebase admin service-account key committed since the first commit. Google has already auto-disabled the Firebase key ("Exposed"). The Gemini key was not yet found or revoked when this report was written.
2. **The AI is almost certainly broken today.** Every AI call uses `gemini-2.0-flash`, which Google **shut down on 2026-06-01**, through an SDK (`@google/generative-ai`) whose support **ended 2025-11-30**. Unless the undeployed production code differs, every i'rab, quiz, exercise and grammar call is failing now. This needs one manual test from a phone to confirm (see OPEN_QUESTIONS Q1).
3. **The API is wide open.** Production reports `authMode: "none"` and the app never sends a token. Anyone can call every AI endpoint with no rate limit. The "3 free analyses, then watch an ad" quota exists only on the phone, in SharedPreferences.
4. **Production runs code that isn't in git.** The live root response (`authMode: "none"`, "(Public)" labels) doesn't match any commit on any branch, so it was deployed from uncommitted local files via the Vercel CLI.
5. **Almost no safety net.** Backend: 1 real test passes, 3 fail (stale request shape, and one real bug). Mobile: 1 test, the default Flutter counter template, which cannot pass. No CI, no linting in backend, no crash reporting.

Recommendation: **refactor, not rebuild.** The codebase is small (backend about 2.4k lines of source; mobile 246 Dart files, about 24k lines) and the architecture direction is already right. The problems are secrets, a dead model, missing auth/limits and hygiene, all fixable incrementally.

---

## 2. Inventory

### Backend (`e3rbly-backend`)
| Item | Finding |
|---|---|
| Runtime | Node, `engines: >=18` (not pinned). Express **5.1**. CommonJS. |
| Deploy | Vercel, legacy `builds` config (`@vercel/node` on `server.js`, catch-all route), `maxDuration: 30`. |
| AI | Google Gemini via `@google/generative-ai@^0.24.1`, model `gemini-2.0-flash` hard-coded in `src/services/aiService.js`. No timeout, 3 retries with up to 10s backoff, no caching. |
| Auth | Firebase Admin (service-account **file**) + self-issued JWT. `AUTH_MODE` = `strict` / `optional` (local `.env` = `optional`; production reports `none`, a value the committed code doesn't know). |
| Validation | Zod on AI **outputs**; request inputs are mostly hand-checked. |
| Storage | None on the backend. The mobile app writes Firestore (`users`, `bookmarks`) directly. |
| Env vars read | `GOOGLE_GENAI_API_KEY`, `AUTH_MODE`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `VERIFICATION_REDIRECT_URL`, `PORT`, `NODE_ENV` (+ service-account JSON file). |
| Undeclared deps | `jsonwebtoken` and `uuid` are `require`d but not in `package.json`. They only work because `firebase-admin` pulls them in. |
| Repo hygiene | `node_modules/` committed (16,435 files, 214 MB). `.gitignore` covers only coverage/html. `.vercel/` committed. 5 branches; default is `Final-Dev`, not `main`. |

### Mobile (`e3rbly-mobile`)
| Item | Finding |
|---|---|
| Flutter | Dart SDK `^3.7.0`; app `1.0.0+4`; Android id `com.mahmoudkarsli1998.e3rbly`, minSdk 23. |
| State | `flutter_bloc` (Cubits) + `get_it`. Consistent enough to **keep** (the skill's Riverpod default doesn't apply; switching would be churn). |
| Networking | **Two** HTTP stacks: `Dio` (`DioClient`, analysis/grammar) and `package:http` (`ApiClient`, quiz/exercises). Base URL hard-coded in `core/config/env_config.dart`. |
| Backend URL (contract) | `https://e3rbly-backend-main.vercel.app` (**live** as of today). |
| Auth | Firebase Auth directly from the app (email + Google Sign-In). **No token is sent to the backend.** Backend `/auth/*` routes are unused by the app. |
| Data | Firestore `users/…` (profile, progress) and `bookmarks`. Security rules are **not in the repo** (unknown). |
| Monetization | Google Mobile Ads. Android production ad unit IDs set; iOS/web are `ca-app-pub-XXXX` placeholders. |
| i18n | Arabic forced (`Locale('ar')`); no ARB/l10n; strings hard-coded. |
| Tests | `test/widget_test.dart` = unmodified counter template (fails). |
| Repo hygiene | `bundletool.jar` (9.6 MB) committed; `.bak` files; package-rename scripts; `lib/testapi.dart`, `lib/test_grammar.dart`, `lib/test_quizes_api.dart` shipped in `lib/` (`testapi.dart` is imported by the router). A file named `" grammar_models.dart"` with a **leading space**. |

### How i'rab works today (end-to-end trace)
1. `HomePage`: user types text → `HomeCubit.analyzeText()`.
2. Connectivity check → `AdService.checkAndHandleQuota()` (local counter: 3 free, then rewarded ad).
3. `ApiService.explainAnalysis()` → **`POST /api/analysis/analyze/text`** `{arabicText}` via Dio (60s timeouts, `LogInterceptor` logging full bodies).
4. Backend: `authenticateToken` runs **twice** (app-level and router-level), passes with no token → `analyzeArabicTextExplanation` → `isValidArabic` (true if **any** Arabic character) → Arabic prompt with the user text concatenated in → `gemini-2.0-flash` → checks the reply contains `الجملة الأصلية:` and `الإعراب:` → `{ explanation }` (free text).
5. App renders the explanation string (markdown). Bookmarks go to Firestore.

So i'rab is **100% LLM-generated free text**. There is no rule engine, no dataset and no structured output in the main flow. The structured `/api/analysis/analyze` (tokens, root, pattern, case, syntax tree) exists but the app doesn't call it.

---

## 3. Findings (severity-ranked)

### CRITICAL

**C1. Admin credentials and API keys committed to a public repo.**
- *Evidence:* `github.com/E3RBLY/e3rbly-backend` is public. `.env` and `firebase-service-account-key.json` are tracked since `aa63867` (2025-04-30).
- *Status:* Firebase key `53abba…` was auto-disabled by Google ("Exposed"). The owner is deleting it. Gemini key (`AIzaSy…Uwh4`) was **not yet located**.
- *Fix:* revoke all (done/in progress), rewrite git history (approved), rotate `JWT_SECRET`, move all config to Vercel env vars, add `.gitignore` + a pre-commit secret scan.
- *Caveat:* GitHub keeps `refs/pull/*` refs that a force-push **cannot** rewrite. PRs #1–#5 still contain the files. Full removal needs GitHub Support to purge, or deleting and recreating the repo. Since the keys are revoked, the rewrite plus a Support request is enough.

**C2. AI model shut down; SDK unsupported.**
- *Evidence:* `aiService.js` → `gemini-2.0-flash`. Google's deprecations page lists shutdown **2026-06-01**, replacement `gemini-3.6-flash`. The `@google/generative-ai` README: support ended **2025-11-30**.
- *Impact:* every AI endpoint (8 of 19 routes) is expected to return 500 in production.
- *Fix:* migrate to `@google/genai` behind an `AiProvider` port, make the model an env var, evaluate current Flash models on the Arabic corpus. Needs a new key (owner).

**C3. Every AI endpoint is public with no rate limit (cost/abuse).**
- *Evidence:* live `/` returns `authMode: "none"`. The app sends no `Authorization` header (grep: 0 hits). No rate limiting. Ad quota is client-side SharedPreferences.
- *Fix (compatible with released app):* per-IP rate limiting + input size caps + response caching now. Later a `/v2` that requires a Firebase ID token (and optionally Firebase App Check), with the app updated to send it. Keep `/api/*` for old installs until they age out.

**C4. `JWT_SECRET` falls back to a public default.**
- *Evidence:* `authMiddleware.js` and `loginController.js`: `process.env.JWT_SECRET || "your_jwt_secret_key"`.
- *Impact:* on any deployment without the var, anyone can mint valid tokens. The real secret is also public (C1).
- *Fix:* fail fast at startup if missing. Rotate.

### HIGH

**H1. Production runs code that isn't in git.** No commit on any branch produces the live `/` response. The deployed source is only on the old Vercel account. *Fix:* after the redeploy, production only ever builds from GitHub `main`.

**H2. Quiz fallback crashes.** `quizController.js` calls `aiService.generateFallbackContent()`, which doesn't exist. Any AI failure → `500 "aiService.generateFallbackContent is not a function"` (reproduced locally). *Fix:* remove or implement, with a regression test.

**H3. Provider errors leak to clients.** Controllers return `details: error.message`, which exposes raw Gemini errors, URLs and Zod internals (reproduced: the 500 body contains the full `generativelanguage.googleapis.com` URL). *Fix:* central error middleware, envelope `{error:{code,message}}`, Arabic user-facing messages.

**H4. Prompt injection / unbounded input.** User text is concatenated straight into prompts. `isValidArabic` passes `"aaaaaaaaaaب"`. No max length, and the `express.json()` default is 100 kB. `exercises/check` puts user-supplied `correctAnswer` into the prompt. *Fix:* input length caps, stricter Arabic ratio check, delimited user content, output schema validation, Gemini JSON mode.

**H5. Password-reset and verification links written to logs.** `authController.js` `console.log`s the generated reset/verification links. Anyone with log access can take over accounts. Also, `generateEmailVerificationLink` does **not send** email (Admin SDK only generates links), so the backend's register/verify flow never emails anyone. *Fix:* the app already uses the Firebase client for this, so propose **removing the unused `/auth/*` routes** (owner decision, Q5).

**H6. Latency vs. platform limit.** `vercel.json` `maxDuration: 30`. The worst-case retry chain (4 attempts + up to about 1+2+4s backoff + model time) with no per-call timeout can exceed 30s. The app waits up to 60s. *Fix:* per-call timeout (~20s), at most 1 retry, `maxDuration` 60 (Hobby now allows up to 300s with Fluid compute), and caching.

**H7. Arabic font never loads.** In `pubspec.yaml`, `fonts:` sits at the **top level** instead of under `flutter:`, so Flutter ignores it. It also points to `PlaySansArabic-*.ttf` while the files are `PlaypenSansArabic-*.ttf`. The app silently uses the system font. *Fix:* move under `flutter:`, fix paths, verify harakat stacking (shadda + vowel) renders unclipped.

**H8. No tests, no CI.** Backend tests call the real API and use the wrong request field (`text` instead of `arabicText`): 3 of 4 fail. Mobile test is the counter template. *Fix:* Phase 1.

### MEDIUM
- **M1.** `authenticateToken` applied twice per `/api` request (app + router), so double Firebase verification and duplicate logs.
- **M2.** `/api/config` is defined *after* the `/api` auth middleware, and `/test-route` is a public debug route that echoes the body to logs. Startup prints routes and curl examples. Remove.
- **M3.** Two HTTP clients in the app (Dio + `http`), each with its own error mapping. Consolidate on Dio.
- **M4.** `LogInterceptor(requestBody: true, responseBody: true)` runs in release builds and logs user text. Debug-only.
- **M5.** 7 empty `catch (e) {}` blocks (e.g. `main.dart` ads init, `HomeCubit`). Failures vanish silently.
- **M6.** Some error messages still show raw exception text (`'حدث خطأ غير معروف: ${error.message}'`, `"فشل النسخ: $error"`).
- **M7.** Non-directional layout: 151 `EdgeInsets.only/symmetric/…`, 0 `EdgeInsetsDirectional`. It works today only because the app is forced RTL; it breaks if English UI is added.
- **M8.** `withOpacity` used 148× (deprecated in current Flutter). Harmless now, noisy in `flutter analyze`.
- **M9.** Test/debug files in `lib/` (`testapi.dart` is routed in `AppRouter.dart`), a file name with a leading space, `.bak` files, a 9.6 MB `bundletool.jar` in the repo.
- **M10.** Unpinned deps: `firebase_core/auth`, `cloud_firestore` have no version constraints. `build_runner` is in `dependencies`.
- **M11.** Firestore security rules aren't version-controlled. With client-side writes, rules are the only protection for user data.
- **M12.** No config per environment. The base URL is a hard-coded constant, so there's no staging.

### LOW
- **L1.** Firebase client config (`google-services.json`, `firebase_options.dart`) is committed. This is normal for mobile apps (these are identifiers, not secrets) provided Firestore rules and API-key restrictions are set.
- **L2.** iOS/web ad unit IDs are placeholders (release on iOS would request invalid units).
- **L3.** README describes endpoints that differ from the code (e.g. quiz `evaluate` "contextual feedback").
- **L4.** `package.json` lint/format scripts reference ESLint/Prettier, which aren't installed.
- **L5.** `pubspec` description is still "A new Flutter project."

---

## 4. Deployment archaeology

| Clue | Value |
|---|---|
| Production URL (compat contract) | `https://e3rbly-backend-main.vercel.app` (live 2026-09-29) |
| Vercel project | `prj_nIo70XWYXUvfWA6afrUQyig1bsqU`, likely named `e3rbly-backend-main` |
| Vercel org/team | `team_kw6mHvzrhwA3lLfy0JvEhosg` |
| Likely login | GitHub `E3RBLY` org or the commit email `mahmoudkarsli1998@outlook.com` |
| Deployed source | Not in git (H1). Recoverable only from the old Vercel dashboard (Deployment → Source). |

**Released-app impact:** installed apps call the old URL. If we move to a new Vercel account, the old URL stays alive only as long as the old account keeps it, and it currently serves a dead model. Two options: (a) find the old account and redeploy there or add a redirect, or (b) ship an app update pointing to the new URL. Old installs stay broken either way unless (a).

---

## 5. Environment limits for this work (honest)
- My cloud workspace **cannot reach npm or PyPI**, and your computer's workspace has no internet. So I can't `npm install` new packages (ESLint, Vitest, `@google/genai`, rate-limit middleware) or run a live smoke test from here. Fixes: allow `registry.npmjs.org` in Claude's network settings (Team/Enterprise: Admin settings → Capabilities), **or** you run `npm install` locally when a branch needs it. **GitHub Actions** will run installs, tests and `flutter analyze/test` in CI.
- There's no Flutter SDK here. Flutter verification happens in CI plus you running the app.
- GitHub push works from my workspace (repos attached). Force-push for the history rewrite is untested until we do it.

---

## 6. Proposed phase plan

| Phase | What | Branches (examples) | Effort |
|---|---|---|---|
| **0.5 Security & repo cleanup** | Back up both repos; rewrite backend history (drop `.env`, key file, `node_modules`, `.vercel`, coverage); force-push; GitHub Support purge request; make `main` the default; `.gitignore` / `.gitattributes`; delete stale branches (after your OK); same hygiene for mobile (remove jar/.bak/test files from `lib/`). | `chore/repo-hygiene` | 0.5 day |
| **1 Safety net** | ESLint + Prettier, Vitest/Jest with **mocked** Gemini, characterization tests for all 19 routes, `test/fixtures/arabic_corpus.json` (40 sentences), GitHub Actions for both repos, mobile: `flutter analyze` baseline + cubit unit tests. | `test/backend-characterization`, `ci/github-actions`, `test/mobile-baseline` | 2–3 days |
| **1b Endpoint tests** | `docs/TEST_REPORT.md`, `scripts/smoke-live.js` (capped AI calls). | `test/smoke-live` | 0.5 day |
| **2 Fix what's broken** | Gemini SDK + model migration (C2), rate limit + input caps (C3/H4), fail-fast config (C4), quiz fallback (H2), error envelope (H3), timeouts (H6), log hygiene (H5/M4), font fix (H7), remove `/test-route`. Each with a regression test. | one `fix/…` branch each | 3–4 days |
| **1c Redeploy (new Vercel)** | Modernize `vercel.json`, pin Node 22, env var list, Preview → smoke → Production; app base URL via `--dart-define`; decide old-URL strategy. | `chore/vercel-redeploy`, `feat/mobile-env-config` | 1 day + your dashboard steps |
| **3 Backend clean architecture** | `config/ domain/ application/ infrastructure/ interfaces/http/`, `AiProvider` + `Cache` ports, pino, OpenAPI, `/v2` with Firebase ID-token auth. TypeScript incrementally (asks you). | `refactor/backend-layers`, … | 4–6 days |
| **4 Flutter cleanup** | Keep Cubit + get_it; one Dio client with auth interceptor; `Result`/`Failure`; l10n ARB; directional insets; loading/empty/error states audit; env flavors. | `refactor/mobile-network`, … | 5–8 days |
| **5 Features** | `FEATURE_PROPOSALS.md` with tiers; **Auto Tashkeel** per spec (benchmark first, i'rab-aware case endings, Quran guard). | `feat/tashkeel-…` | proposal first |

**Branch model (as you asked):** `main` is the stable line. An integration branch `develop` is cut from it. Every task gets its own branch from `develop` (`feat/`, `fix/`, `chore/`, `test/`, `refactor/`, `docs/`), merged by PR into `develop` after CI is green. At the end, `develop` → `main` in one PR, and production deploys from `main`.
