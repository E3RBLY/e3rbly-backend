# Decisions

| Date | Decision | Alternatives | Why |
|---|---|---|---|
| 2026-09-29 | Refactor incrementally, don't rebuild | Rewrite from scratch | Small codebase, sound structure; problems are ops/security, not design. |
| 2026-09-29 | Keep Cubit (`flutter_bloc`) + `get_it` in mobile | Migrate to Riverpod | Already used consistently in 20+ places; switching is churn with no user value. |
| 2026-09-29 | Rewrite backend git history to remove secrets (owner-approved) | Fresh repo; keep history + private | Keeps commit history while removing the files. PR refs need a GitHub Support purge. |
| 2026-09-29 | Branch model: task branches → PR → `develop` → one final PR → `main` | Trunk-based on `main` | Owner request: one branch per feature, push to `main` at the end. |
| 2026-09-29 | Docs live in the backend repo `docs/` (covers both apps) | Duplicate in both repos | One source of truth; the mobile README links to it. |
