# Endpoints

> **Update (Phase 2):** rows 2 and 4–8 were **removed** (`/test-route` and the unused `/auth/*` + JWT scheme). `/api` auth now runs once, with Firebase ID tokens only. AI calls use the Gemini REST API with `GEMINI_MODEL` (default `gemini-3.6-flash`). Error bodies no longer carry `details`; they carry a `code`. **New:** `POST /api/tashkeel` `{text, preserveExisting?}` → `{text, original, addedMarks, verified:false, notice, cached}`; 400 invalid text, 502 `TASHKEEL_LETTERS_CHANGED`, 500 AI errors with `code`. AI route (rate-limited). The table below is the original Phase 0 inventory (`Final-Dev` @ d9bc833).

Base URL (production, compat contract): `https://e3rbly-backend-main.vercel.app`

Auth column: what the **code** enforces. Production reports `authMode: none` and local `.env` is `optional`, so in practice **nothing is enforced** on `/api/*`.

AI = calls Gemini (`gemini-2.0-flash`, shut down 2026-06-01). No per-call timeout, 3 retries, no caching, on all AI routes.

| # | Method | Path | Auth | Input | Output | AI | Called by app | Test status |
|---|---|---|---|---|---|---|---|---|
| 1 | GET | `/` | public | — | service info + route list | – | no | PASS (local) |
| 2 | POST | `/test-route` | public | any | `{message}`, logs body | – | no | none, **remove** |
| 3a | GET | `/health` | none | — | `{status:"ok"}` for uptime monitors; no rate limit, no AI | – | no | none |
| 3 | GET | `/api/config` | /api mw | — | `{authMode, apiAvailable, firebaseConfigured:true}` | – | no | none |
| 4 | POST | `/auth/register` | public | `{email, password≥6}` | 201 `{message,user}` / 409 | – | no | none |
| 5 | POST | `/auth/login` | public | `{email,password}` | `{token (JWT), user}` | – | no | none |
| 6 | GET | `/auth/validate-token` | Bearer JWT | — | `{valid,user}` | – | no | none |
| 7 | POST | `/auth/request-verification-email` | public | `{email}` | 200 / 404 (user enumeration) — **no email actually sent** | – | no | none |
| 8 | POST | `/auth/request-password-reset` | public | `{email}` | 200 generic; **link logged** | – | no | none |
| 9 | POST | `/api/analysis/analyze` | /api mw ×2 | `{arabicText}` | `{tokens[{surface,diacritized,root,pattern,pos,features}], syntaxTree}` | ✔ JSON | `ApiService.analyzeText` (defined, **not used by UI**) | FAIL (test sends `text`) |
| 10 | POST | `/api/analysis/analyze/text` | /api mw ×2 | `{arabicText}` | `{explanation: string}` | ✔ text | **HomeCubit (main i'rab flow)** | none |
| 11 | POST | `/api/analysis/explain` | /api mw ×2 | `{analysisResult, arabicText}` | `{explanation}` | ✔ text | no | none |
| 12 | POST | `/api/exercises/generate` | /api mw ×2 | `{difficulty, exerciseType∈[parsing,fill-in-blanks,error-correction,multiple-choice], count 1–10}` | `{exercises[…]}` incl. answers | ✔ JSON | Exercises feature | FAIL (test sends type `vocabulary`) |
| 13 | POST | `/api/exercises/check` | /api mw ×2 | `{exerciseId, exerciseText, userAnswer, correctAnswer, exerciseType}` | `{isCorrect, score, feedback, correctAnswer, explanation}` | ✔ JSON | Exercises feature | none |
| 14 | POST | `/api/quiz/generate` | /api mw ×2 | `{topic, difficulty, questionCount 1–15}` | `{quiz[…], metadata}` | ✔ JSON | Quiz feature | FAIL: 500 `generateFallbackContent is not a function` |
| 15 | POST | `/api/quiz/evaluate` | /api mw ×2 | `{questionId, userAnswerIndex 0–3, correctAnswerIndex 0–3, explanation?}` | `{isCorrect, score, feedback,…}` (no AI, trusts client) | – | Quiz feature | none |
| 16 | POST | `/api/grammar/explanation` | /api mw ×2 | `{conceptType∈enum, conceptName}` | `GrammarConcept` | ✔ JSON | Grammar feature | none |
| 17 | POST | `/api/grammar/related` | /api mw ×2 | `{conceptType, conceptName, count≤5}` | `{relatedConcepts[…]}` | ✔ JSON | Grammar feature | none |
| 18 | GET | `/api/grammar/concept-types` | /api mw ×2 | — | `{conceptTypes[12]}` | – | Grammar feature | none |
| 19 | GET | `/api/grammar/concept-values/:conceptType` | /api mw ×2 | path | `{conceptType, values}` (route registered twice) | – | ? | none |

Error shape today is inconsistent: `{error}`, `{error, message}`, `{error, details: <raw provider message>}`.

## Quran content module (X1, isolated in `modules/quran/`, mounted in `server.js` via `mountQuran(app)`)

Read-only, no auth, no AI, no DB. Data: Tanzil Uthmani text (CC BY 3.0, unmodified). Errors: `{ error: { code, message, details? } }`. Every 200 carries `source` (name, url, license). Headers: `Cache-Control: public, max-age=3600`, strong `ETag` (304 supported). Limit: 120/min per IP per instance.

| # | Method | Path | Input | Output | AI | Tests |
|---|---|---|---|---|---|---|
| 20 | GET | `/v1/quran/source` | – | source, variant, version, counts, `pack_sha256`, license notice, `provenance`, `review_status` | none | PASS (local) |
| 21 | GET | `/v1/quran/surahs` | – | 114 × `{number, ayah_count, sha256}` | none | PASS (local) |
| 22 | GET | `/v1/quran/surahs/:n/ayat?from=&to=` | n 1–114; from/to ≥1 | `{surah, from, to, total, ayat[{surah, ayah, text, text_ayah, basmala_prefixed}]}`; 400 bad params, 404 out of range | none | PASS (local) |
| 23 | GET | `/v1/quran/ayat/:s/:a` | s 1–114, a ≥1 | `{ayah:{surah, ayah, text, text_ayah, basmala_prefixed}}`; 404 if a > ayah count | none | PASS (local) |

`text` is Tanzil's string, never edited. Tanzil prefixes the basmala to ayah 1 of every surah except 1 and 9; `text_ayah` is the ayah proper (lossless split, `text === basmala + " " + text_ayah`), `basmala_prefixed` says whether it happened.
