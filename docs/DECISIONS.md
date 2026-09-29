# Decisions

| Date | Decision | Alternatives | Why |
|---|---|---|---|
| 2026-09-29 | Refactor incrementally, don't rebuild | Rewrite from scratch | Small codebase, sound structure; problems are ops/security, not design. |
| 2026-09-29 | Keep Cubit (`flutter_bloc`) + `get_it` in mobile | Migrate to Riverpod | Already used consistently in 20+ places; switching is churn with no user value. |
| 2026-09-29 | Rewrite backend git history to remove secrets (owner-approved) | Fresh repo; keep history + private | Keeps commit history while removing the files. PR refs need a GitHub Support purge. |
| 2026-09-29 | Branch model: task branches → PR → `develop` → one final PR → `main` | Trunk-based on `main` | Owner request: one branch per feature, push to `main` at the end. |
| 2026-09-29 | Docs live in the backend repo `docs/` (covers both apps) | Duplicate in both repos | One source of truth; the mobile README links to it. |
| 2026-09-29 | Gemini via REST + built-in fetch, no SDK | `@google/genai` SDK | Old SDK retired; npm unreachable from Claude's workspace; REST is small and stable. Revisit if we need streaming or tools. |
| 2026-09-29 | In-memory per-IP rate limiter | express-rate-limit; Upstash Redis | No new dependency (npm blocked) and no new vendor/cost (Tier C). Per-instance on Vercel; upgrade to a shared store if abuse is observed. |
| 2026-09-29 | AI failures keep HTTP 500 (not 502/503/504) | Precise gateway codes | Released app maps 500 to a friendly message; other 5xx show a raw code (M6). Revisit after the app update ships. |
| 2026-09-29 | Removed /auth/* and JWT (Q5 default) | Keep and fix | Unused by the app; they carried C4/H5. Firebase ID tokens are the only auth. |
| 2026-09-29 | Tashkeel v1 = Gemini with a hard letters-unchanged guard, user marks preserved, LRU cache | Open-source diacritizer models (e.g. hosted neural models); rule + lexicon | No new hosting/cost; ships now. Quality is measured with a DER benchmark (gold set) before promoting it in the app; a dedicated model stays an option if DER is poor. |
