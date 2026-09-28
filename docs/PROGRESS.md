# Progress

| Phase | Task | Status | Date |
|---|---|---|---|
| 0 | Audit both repos (read-only) | ✅ done | 2026-09-29 |
| 0 | Owner approved plan; open questions use recommended defaults | ✅ | 2026-09-29 |
| 0 | Security: Firebase admin key `53abba…` | ✅ auto-disabled by Google (owner to delete) | 2026-09-29 |
| 0 | Security: old Gemini key `AIzaSy…Uwh4` | ⚠️ **owner could not locate it**; still possibly valid, still public in GitHub PR refs and forks. Open risk. | 2026-09-29 |
| 0 | Security: rotate `JWT_SECRET` | ⏳ at redeploy (or removed with /auth, Q5 default = remove) | |
| 0.5 | Backup bundles → `H:\Projects\e3rbly\_backup\` (sha256 verified on device) | ✅ | 2026-09-29 |
| 0.5 | Backend history rewritten (dropped `.env`, service-account key, `node_modules`, `.vercel`); all 5 branches force-pushed; content scan: 0 hits | ✅ | 2026-09-29 |
| 0.5 | Backend `main` = cleaned `Final-Dev`; `develop` created (both repos) | ✅ | 2026-09-29 |
| 0.5 | Owner: set default branch → `main`, make backend private, delete stale branches (proxy blocks settings/branch deletion for Claude) | ⏳ owner | |
| 0.5 | Owner: GitHub Support request to purge cached PR refs #1–#5 (still contain old secrets) | ⏳ owner | |
| 0.5 | `chore/repo-hygiene` (.gitignore, .gitattributes, .env.example, docs) | 🔄 PR open | 2026-09-29 |
| 1 | Backend characterization tests (86, all 19 routes, mocked AI) + CI | ✅ PR #7, CI green | 2026-09-29 |
| 1 | Mobile unit tests + Flutter CI (analyze report-only, 0 errors) | ✅ mobile PR #13, CI green | 2026-09-29 |
| 1 | ESLint/Prettier | ⏳ blocked: npm registry unreachable from Claude's workspace (Q8) | |
| 1 | Crashlytics hook | ⏳ needs a device build to verify | |
| 2 | **H2+H3** no raw error leaks, quiz fallback crash removed | ✅ PR #9 | 2026-09-29 |
| 2 | **C3/H4** per-IP rate limits (API 60/min, AI 10/min), 16kb body cap, 1000-char text caps, Arabic-ratio validation | ✅ PR #11 | 2026-09-29 |
| 2 | **C4/H5/M1/M2** removed unused `/auth/*` + JWT, `/test-route`, double auth middleware, startup noise; service account via `FIREBASE_SERVICE_ACCOUNT_JSON`; strict mode fails fast without credentials | ✅ PR #10 | 2026-09-29 |
| 2 | **C2** Gemini: REST client, `GEMINI_MODEL` (default `gemini-3.6-flash`), per-call timeout, 1 retry, typed errors; SDK removed; Node pinned 22.x; `maxDuration` 60 | ✅ PR #8 | 2026-09-29 |
| 2 | Mobile **H7** Arabic font actually bundled (+ manifest regression test) | ✅ mobile PR #14, CI green | 2026-09-29 |
| 2 | Mobile **M4/M6** build-time `API_BASE_URL`, friendly 429/413/5xx, debug-only logging | ✅ mobile PR #15, CI green | 2026-09-29 |
| 1b | `scripts/smoke-live.js` (AI-call cap, latency p50/max, exit code) + `docs/TEST_REPORT.md` | ✅ this PR | 2026-09-29 |
| 1c | Zero-config Vercel (`vercel.json` = region only), `docs/DEPLOY.md` | ✅ this PR; **owner: create project + env vars** | 2026-09-29 |
| 1c | Preview deploy → live smoke → production | ⏳ owner (new account + new Gemini key) | |

