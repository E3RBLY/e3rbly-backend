# Feature proposals

Tiers (from the modernization playbook): **A** = build now (small, reversible, no new cost); **B** = propose then build (new flow or touches i'rab/tashkeel output); **C** = always ask first (recurring cost, accounts/data, Quran/religious text).

| Feature | User value | Effort | Risk | Depends on | Tier | Recommendation |
|---|---|---|---|---|---|---|
| **Auto tashkeel** (`POST /api/tashkeel`) | Core ask; learners and writers need harakat | M | Wrong case endings presented as fact | Gemini | B (owner asked for it) | **Now**: backend built with the letters-never-change guard; app button next |
| Tashkeel diff highlight + tap-to-change | Shows what was added; users can fix one word | M | UI complexity | tashkeel | B | Next |
| Copy / share i'rab and tashkeel with harakat | Everyone shares results | S | none | — | A | Now (app) |
| "Report wrong result" button | Builds an evaluation dataset, finds bad outputs | S–M | Stores user text (needs consent wording) | Firestore | B | Next |
| History of analyses (local) | Re-open past work; offline viewing | S | none | local storage | A | Now (app) |
| Structured word-by-word i'rab view (tap a word → case and why) | Much clearer than a text block | M | `/analyze` output quality | fix/structured-analysis | B | Next, after a quality check on the corpus |
| Server-side quota per user (replace client-only ad quota) | Stops abuse, fair limits | M | Requires app to send ID tokens | AUTH_MODE=strict | B | Next (with app update) |
| Response caching for i'rab (same sentence) | Faster, cheaper | S | Stale answers after prompt changes (key by prompt version) | — | A | Now (backend) |
| Faster model for simple routes (quiz evaluate is already AI-free) | Lower latency (i'rab is 6–15s today) | S | Quality drop | benchmark | B | Next, measured with the corpus |
| Camera OCR input | Photograph a textbook sentence | M | OCR errors on harakat | on-device ML | B | Later |
| Verified Quran mode | Correct text + i'rab for ayat | L | Religious text must be exact; licensing | Tanzil or similar dataset | **C** | Ask owner; never auto-modify Quranic text |
| Daily sentence / mini-quiz streak | Retention | M | — | quiz API | B | Later |
| Accounts sync across devices | Keep history everywhere | L | Personal data | Firebase | C | Skip until requested |

## Auto tashkeel: design (built on `feat/auto-tashkeel`)

- **Endpoint:** `POST /api/tashkeel { text, preserveExisting=true }` → `{ text, original, addedMarks, verified:false, notice, cached }`.
- **Guarantee:** the result must have exactly the input's base letters (NFC; tatweel, hamza forms, digits, punctuation and Latin untouched). Otherwise it's rejected with `502 TASHKEEL_LETTERS_CHANGED` and the user's text is never replaced. The model may only add marks.
- **User marks win:** harakat the user already typed are kept (`preserveExisting`).
- **Honesty:** always `verified:false` plus an Arabic notice that case endings may be wrong.
- **Cost/speed:** in-memory LRU cache (500 entries); counts as an AI route for rate limiting; text capped at 1000 characters.
- **Prompt injection:** user text is fenced in `<<< >>>`, the prompt says to ignore instructions inside it, and the letter guard rejects any output that isn't the same text.
- **Quality measurement:** `tests/fixtures/tashkeel_gold.json` (12 hand-checked sentences, growing) and `scripts/tashkeel-benchmark.js` report DER and case-ending DER against a deployment. Target to beat before promoting in the app: case-ending DER < 10%.
- **Not yet:** the Quran guard (needs a verified dataset, Tier C), i'rab-aware case-ending correction, and alternatives per word.
