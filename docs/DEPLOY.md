# Deploying the backend (new Vercel account)

Vercel runs this Express app with **zero configuration**: `server.js` exports the app, and `vercel.json` only pins the region (`fra1`, Frankfurt, close to Egypt and to Google's API). Node 22 comes from `package.json` → `engines`.

**Never** put keys in the repo, in chat, or in files. Paste them into the Vercel dashboard only.

---

## 1. One-time setup (owner, ~10 minutes)

1. Sign in to the **new** Vercel account → **Add New… → Project** → **Import Git Repository** → `E3RBLY/e3rbly-backend`.
   If the repo isn't listed, click "Adjust GitHub App Permissions" and give Vercel access to the `E3RBLY` org.
2. On the import screen:
   - Framework preset: leave the auto-detected value (Express / Other).
   - Root directory: `./`. Build & output settings: leave the defaults.
   - **Don't deploy yet.** Open *Environment Variables* first (step 3).
3. **Environment variables.** Add each one for **Production** and **Preview**:

| Name | Value | Required | Why |
|---|---|---|---|
| `GOOGLE_GENAI_API_KEY` | your **new** Gemini key | yes | All AI endpoints |
| `GEMINI_MODEL` | `gemini-3.6-flash` | no (that's the default) | Change the model later without code |
| `GROQ_API_KEY` | your Groq key | no, but recommended | Fallback when Gemini is rate-limited, down, or its key fails |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | no (that's the default) | Change the fallback model without code |
| `AUTH_MODE` | `optional` | **yes** | Released apps send no login token; `strict` would break them (see §4) |
| `RATE_LIMIT_AI_PER_MIN` | `10` | no | Per IP, per instance |
| `RATE_LIMIT_API_PER_MIN` | `60` | no | |
| `MAX_TEXT_CHARS` | `1000` | no | Max i'rab input length |
| `AI_TIMEOUT_MS` | `20000` | no | |
| `AI_MAX_RETRIES` | `1` | no | |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | *(leave unset for now)* | only for `AUTH_MODE=strict` | Not needed until the app sends tokens |

4. Protect the Gemini key: in Google Cloud Console → **APIs & Services → Credentials** → your key → *API restrictions* → restrict to **Generative Language API**. Set a **budget alert** under Billing → Budgets & alerts.

## 2. Every release

1. Work lands on `develop` through PRs (CI must be green).
2. Vercel builds a **Preview** deployment for `develop` (and for every PR). Copy its URL from the Vercel dashboard or the PR's Vercel comment.
3. Smoke-test the preview (real AI calls, 10 max):
   ```bash
   SMOKE_BASE_URL=https://<preview-url> node scripts/smoke-live.js
   ```
   All checks should say PASS. Paste the output table into `docs/TEST_REPORT.md`.
4. Merge `develop` → `main` in one PR. Vercel deploys **Production** from `main`.
5. Smoke-test production the same way.

## 3. Rollback

Vercel dashboard → project → **Deployments** → pick the last good deployment → **⋯ → Instant Rollback**. It takes effect in seconds. Then fix forward on a branch.

## 4. The mobile app and the URL change

- Installed apps call `https://e3rbly-backend-main.vercel.app` (the **old** account). That deployment still runs the retired model, so it's almost certainly failing today.
- New app builds pick the backend at build time:
  ```bash
  flutter build appbundle --release --dart-define=API_BASE_URL=https://<new-production-url>
  ```
  Without the flag, builds keep the old URL.
- **If the old Vercel account is found:** in that project, add a redirect from the old domain to the new one (or redeploy this repo there). Old installs then work without an update.
- **If not:** old installs keep failing until users update. Ship the new build to Google Play and consider making it a required update.
- `AUTH_MODE=strict` becomes possible once an app version that sends Firebase ID tokens is widespread (planned for Phase 3/4, with `FIREBASE_SERVICE_ACCOUNT_JSON` set then).

## 5. Environment variables the code reads

`GOOGLE_GENAI_API_KEY`, `GEMINI_MODEL`, `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_MAX_OUTPUT_TOKENS`, `GROQ_API_KEY`, `GROQ_MODEL`, `AI_FALLBACK_COOLDOWN_MS`, `AI_TOTAL_BUDGET_MS`, `AI_CACHE_MAX_ENTRIES`, `AI_CACHE_TTL_MS`, `AUTH_MODE`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `RATE_LIMIT_API_PER_MIN`, `RATE_LIMIT_AI_PER_MIN`, `MAX_TEXT_CHARS`, `MAX_BODY_SIZE`, `PORT` (local only). See `.env.example`.
