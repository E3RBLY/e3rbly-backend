# e3rbly Content Features: Implementation Plan

Save as `docs/plans/CONTENT_FEATURES_PLAN.md` in the repo. Companion to the `e3rbly-modernizer` skill.

**Owner-approved scope (this document is the approval of scope, not of every dependency):**

1. **تفسير القرآن الكريم** with the related **نحو، صرف، بلاغة** for each ayah.
2. **بيوت الشعر والنثر** of famous poets and writers, analysed by **نحو، صرف، بلاغة، أدب**.
3. A **separate section for البلاغة والأدب** (lessons, glossary, examples, exercises).

The owner wants the agent to think proactively. That mandate still holds, but on this content the Tier C rules from the skill apply **per item**: no paid API, no third-party data upload, no recurring cost, no unlicensed text, and nothing that changes religious content without review, unless the owner approves it explicitly.

---

## 1. Honest framing (read first)

- **The hard part is content, not code.** Schema, screens, and APIs are a few weeks of work. Getting *correct, licensed, reviewable* tafsir, i'rab, morphology, balagha notes, and verified poetry is the real project.
- **Three products, not one feature.** Trying to ship all three at once is the failure mode. Ship them in the order in §9, each as a small MVP with real content, not a big empty framework.
- **A developer cannot be the content authority.** Religious and literary content needs a named **content reviewer** (Arabic-language or Islamic-studies specialist). Without one, ship less content, not unreviewed content. (Open question Q1.)
- **Accuracy beats volume.** 300 verified verses beat 10,000 unverified ones.

Recommended order: **X0 sourcing audit → X1 foundation → X2 Quran → X3 Balagha & Adab section → X4 Poetry & prose → X5 cross-linking and extras.** Reason: the app's strongest fit is i'rab of the Quran; the balagha section then reuses Quranic examples; poetry has the heaviest licensing and authenticity work, so it goes last.

---

## 2. Non-negotiable content rules

1. **Quran text is immutable.** Use one canonical, verified Uthmani source. Never generate, normalize, re-diacritize, or "correct" ayah text. Ship a checksum per surah and a CI test that fails if any byte changes. The auto-tashkeel feature must **skip** Quranic text.
2. **No unlabeled AI-generated religious content, ever.** Tafsir and i'rab shown to users must come from an identified, licensed source (or from the reviewed in-house set). AI may only produce **drafts for the reviewer** (§8).
3. **Every annotation carries provenance:** source, edition, editor (المحقق) where relevant, license, `provenance` (`imported | curated | ai_draft`), `review_status` (`unreviewed | reviewed | disputed`), reviewer, date. The UI shows the source name next to every tafsir/i'rab item.
4. **Only `reviewed` content is visible to users in production.** `unreviewed` and `ai_draft` stay behind an admin/staging flag.
5. **Attribute differing views; do not pick a winner.** Where tafsir sources differ, show each with its name. No fatwa-style answers anywhere in the app.
6. **Licensing is a gate, not a footnote.** Classical texts are public domain, but a specific modern *edition/tahqiq*, a database, or a digitization can still be copyrighted or carry a license (some corpora are GPL or non-commercial). Record the license per source in `docs/CONTENT_SOURCES.md`, verify it by reading the actual license text (web search), and get owner sign-off before importing. **Modern poets (for example those who died recently) are excluded unless a license exists.**
7. **Authenticity of poetry and prose.** Record attribution certainty (`certain | disputed | attributed`) per poem. Never invent or "complete" verses. Never add a verse that has no source.
8. **Arabic text handling:** follow §9 of the skill (Unicode, harakat, RTL). Store the original text; search on a normalized copy.

---

## 3. Open questions for the owner (ask in one batch, with recommended defaults)

| # | Question | Recommended default |
|---|---|---|
| Q1 | Who is the content reviewer (name/role), and how many hours can they give? | Do not build X2+ content pipelines until one is named; start with a small seed set |
| Q2 | Does the app work offline for this content? | Yes for the Quran text + one tafsir (bundled), online for the rest |
| Q3 | Which database does the backend use today, and is there a place to host content? | Decide via ADR in X1; default in §4.4 |
| Q4 | Is any of this paid or ad-supported? | Free at first; decide monetization later |
| Q5 | Which languages for the UI of these sections? | Arabic primary, English secondary; content itself is Arabic |
| Q6 | Are audio recitations wanted? | Not in MVP (licensing and hosting cost = Tier C) |
| Q7 | Are there madhhab/creed constraints on which tafsir sources are shown? | Show attributed, mainstream, widely used sources; owner picks |

---

## 4. Shared foundation (X1)

### 4.1 Content model (logical; adapt to the actual DB)

```
Source        id, name_ar, edition, muhaqqiq, publisher, year, license, license_url,
              url, retrieved_at, attribution_text, notes
Author        id, name_ar, name_en, birth_h, death_h, era, bio_ar, copyright_status
Work          id, type(quran|diwan|prose|lesson), title_ar, author_id?, source_id
Unit          id, work_id, kind(ayah|verse|passage), ref (e.g. 2:255, poem_id:idx),
              text_original, text_normalized, meta(json)  // poem: hemistich_a/b, bahr, qafiya
Token         id, unit_id, idx, text, lemma, root, wazn, pos, i3rab_role, case,
              features(json), source_id
Annotation    id, unit_id, token_range?, kind(tafsir|i3rab|sarf|balagha|meaning|
              gharib|adab_note), body_ar, source_id, provenance, review_status,
              reviewer_id, reviewed_at, version
BalaghaDevice id, branch(ma3ani|bayan|badi3), name_ar, definition_ar, parent_id?
DeviceExample id, device_id, unit_id, explanation_ar, source_id, review_status
Lesson        id, path(balagha|adab), order, title_ar, body_md, prerequisites
Exercise      id, lesson_id, type(identify|explain|choose), payload(json), answer, explanation
```

Key idea: **one annotation layer for everything.** Tafsir, i'rab, sarf, balagha, and literary notes are all `Annotation` rows on a `Unit` (optionally on a token range), with provenance and review status. Adding a new source later is data, not code.

### 4.2 Content pipeline
- `content/` folder in the repo (or separate repo): raw sources + importer scripts + a **validation suite** (schema, orphan refs, missing provenance/licence, Quran checksum, invalid Unicode sequences, unreviewed items flagged).
- Importers are **idempotent** and versioned. Output is a **versioned content pack** (`content-vN`): SQLite file for the app and JSON/DB rows for the backend.
- CI fails if any user-visible annotation lacks provenance or is not `reviewed`.

### 4.3 API (read-only, cacheable; all under `/v1`)
```
GET /v1/quran/surahs
GET /v1/quran/surahs/:n/ayat?from=&to=
GET /v1/quran/ayat/:s/:a?include=tokens,tafsir,i3rab,balagha&source=
GET /v1/tafsir/sources
GET /v1/poets            GET /v1/poets/:id/works
GET /v1/poems/:id?include=tokens,annotations
GET /v1/balagha/devices  GET /v1/balagha/lessons/:id
GET /v1/adab/eras        GET /v1/adab/authors/:id
GET /v1/search?q=&scope=quran|poetry|prose|balagha
GET /v1/content/version
```
Rules: ETag + cache headers, pagination, input validation, rate limiting, error envelope from the skill. These endpoints are static-ish, so cache aggressively and keep them **out of AI cost paths**. Add every route to `docs/ENDPOINTS.md` and the test matrix (§3b of the skill).

### 4.4 Storage and delivery (decide via ADR; default recommendation)
- **App:** bundled read-only SQLite content pack for the Quran and seed content (offline, fast, no backend cost); downloadable content packs for the rest, checked via `/v1/content/version`.
- **Backend:** serves the same pack and search. Postgres if the project already has one (Supabase is fine if it's in use); otherwise ship the SQLite/JSON pack read-only with the function, since this content changes rarely. Verify Vercel function size and read-only filesystem limits in current docs before choosing.
- **Search:** SQLite FTS or Postgres full-text on `text_normalized` (strip harakat, unify alef/ya/ta marbuta variants). Highlight matches on the original text.

### 4.5 Flutter modules (feature-first, per skill §6)
`features/quran`, `features/poetry`, `features/balagha`, `features/adab`, `features/content_search`, all using a shared `core/content` layer (repository over the pack + annotation widgets). One reusable **annotated text** widget: tokens are tappable, a bottom sheet shows i'rab / sarf / balagha / tafsir tabs with the source name and review badge. RTL-first, correct harakat rendering (bundle a proper Quranic font for the Quran and a readable naskh font elsewhere; test shadda + vowel + small alef stacking and line-height).

---

## 5. Feature 1: القرآن الكريم: تفسير + نحو + صرف + بلاغة

**MVP scope (X2):**
- Mushaf-style reader: surah list, ayah view, jump to ayah, continue reading, bookmarks (local).
- **Two tafsir sources** the owner picks (recommend one concise and one detailed). Show source name; switch between them per ayah. Never merge or paraphrase them.
- **إعراب for ALL 6,236 ayat (owner requirement, not a subset).** Reach full coverage by **sourcing, not authoring**, in two layers:
  1. **Ayah-level i'rab text (Arabic prose), full coverage from the first release.** Import one or more complete i'rab works with a clean digitization and a verified license, always shown with the source name. Candidates to evaluate: العكبري «التبيان في إعراب القرآن», النحاس «إعراب القرآن», السمين الحلبي «الدر المصون», درويش «إعراب القرآن وبيانه», صافي «الجدول في إعراب القرآن». Judge the license of the **specific digitization/edition**, not just the author's death date. Where works give different أوجه إعرابية, **store all of them, attributed**; never force a single answer.
  2. **Word-level structured layer** (tap a word → role, case, root, pattern, POS). Two routes, owner picks: (a) Quranic Arabic Corpus (complete, but GPL v3: do not import into the app or repo until the owner decides), or (b) build in-house: AI drafts token-level structure **grounded in the imported i'rab text** (each item cites the source passage), then automated cross-checks (agreement with the imported text, morphology consistency, valid role/case combinations). **Auto-accept** items where at least two independent sources agree; **send only disagreements and low-confidence items to the reviewer**; the reviewer also samples a random slice of auto-accepted items to measure the real error rate. Publish surah by surah when a surah passes the error-rate threshold agreed with the reviewer (start with the most-read: الفاتحة، يس، الكهف، الملك، الرحمن، جزء عمّ), and show honest coverage % per surah in the app.
  Why not 100% manual review: roughly 77,000 words; even at a few minutes per ayah that is hundreds of reviewer hours. Source-agreement plus sampling is what makes full coverage feasible.
- **Word-by-word morphology** (root, lemma, وزن, POS) comes from the same layer-2 route.
- **بلاغة notes** for a curated seed set of ayat (start with 50 to 100 well-known examples chosen with the reviewer), each reviewed.
- Search (normalized) inside the Quran; share an ayah as text/image **with source attribution**.

**Later (Tier B/C, separate proposals):** tajweed colouring (dataset license), audio recitation (licensing + hosting cost), asbab al-nuzul, qira'at, tafsir comparison view, thematic index.

**Acceptance criteria:**
- Checksum test proves the Quran text matches the canonical source, byte for byte.
- **6,236 / 6,236 ayat have at least one attributed i'rab source (layer 1).** Layer-2 (word-level) coverage % is tracked per surah and shown honestly in the app.
- Every visible tafsir/i'rab/balagha item shows its source and is `reviewed`.
- Works offline for text + one tafsir; all reader flows have loading/empty/error states.
- Tap any word → correct root/pattern/i'rab within 300 ms from the local pack.
- 100% of MVP endpoints PASS in `docs/TEST_REPORT.md`; license file for each source exists.

---

## 6. Feature 2: بيوت الشعر والنثر (شعراء وكتّاب مشهورون)

**MVP scope (X4):**
- **10 to 15 classical poets across eras** (جاهلي، إسلامي/أموي، عباسي، أندلسي, plus a few canonical prose writers such as المقامات, الرسائل, الخطب), about **300 verses** and **20 prose passages**, all public-domain text from a **verified, cited edition**.
- Poet profile (era, bio, notable works), poem page with verses, **full tashkeel** (reviewed), and per-verse: شرح المعنى، غريب الألفاظ، إعراب، صرف، بلاغة، ملاحظة أدبية, each as an `Annotation` with provenance.
- Poem metadata: بحر، قافية، غرض (theme), attribution certainty.
- Tap a word → same annotated-text sheet as the Quran.
- Search by poet, keyword, theme, and بحر.

**Extras (Tier B, propose first):**
- **العروض:** detect بحر and show التقطيع for a verse. It is high value and verifiable against a gold set, but it is a real algorithm; measure accuracy on a labeled test set before shipping and mark output as "تقدير".
- Daily verse, favorites, "verse of the day" notification (Tier C if it needs push infrastructure).

**Do not:** include modern/copyrighted poets without a license; "complete" or "restore" verses; ship annotations that are only `ai_draft`.

**Acceptance criteria:** every poem has a cited source + edition; attribution certainty set; ≥ 90% of MVP verses have reviewed sarf/nahw notes and 100% have reviewed diacritics; no text without licence record.

---

## 7. Feature 3: قسم البلاغة والأدب (separate section)

Its own tab/entry in the app, not buried inside the i'rab flow.

**Structure**
- **البلاغة:** علم المعاني، علم البيان، علم البديع, each with lessons: definition → types → examples (linked to real ayat/verses) → common mistakes → exercises.
- **الأدب:** timeline by era, authors, genres (شعر، مقامة، خطبة، رسالة، مسرح/رواية حديثة as overview only), key works. Modern authors: **biographical overview only** unless licensed.
- **Glossary** (المصطلحات) with search; each term links to lessons and examples.
- **Exercises:** "identify the device", "explain its effect", "choose the correct analysis" with explanations. Progress and streaks stored **locally** (no accounts needed).

**MVP (X3) topics, about 12 core devices, 5 examples each (about 60 reviewed examples):**
تشبيه، استعارة، كناية، مجاز مرسل، طباق، مقابلة، جناس، سجع، تقديم وتأخير، حذف، القصر، الإنشاء الطلبي (الأمر/الاستفهام/النداء…).

**Acceptance criteria:** each lesson has ≥ 1 reviewed example from the Quran or poetry with the source shown; every exercise has an answer explanation; the section works offline; content passes the reviewer checklist (§10).

---

## 8. Where AI is and is not allowed

| Use | Verdict |
|---|---|
| Draft annotations for the **reviewer** (admin side, labeled `ai_draft`, hidden from users) | Allowed, Tier B; measure error rate on a reviewed sample before relying on it |
| Generate quiz distractors / exercise variants from reviewed examples | Allowed, reviewed before publishing |
| Search query normalization, spelling suggestions | Allowed |
| End-user free-form "explain this ayah / poem" chat | **Not in MVP.** Later only as strict retrieval over approved sources with citations, refusal when out of scope, no fatwa, clear disclaimer. Recurring cost = Tier C |
| Producing or "fixing" Quran text, hadith, verse text, or attributions | **Never** |

Known failure to guard against: models confidently invent tafsir quotes, hadith, verses, and attributions. Every test set includes traps for this.

---

## 9. Phases, gates, effort

| Phase | Deliverable | Effort | Gate |
|---|---|---|---|
| **X0** Sourcing and licensing audit (docs only, can run in parallel with skill Phases 1 to 3) | `docs/CONTENT_SOURCES.md`: candidate sources per feature, license text verified, edition, quality notes, recommended picks; reviewer plan | S | Owner approves sources and names a reviewer |
| **X1** Foundation | Schema, importer + validation pipeline, content packs, read-only API + tests, Flutter `core/content` + annotated-text widget, search normalization | M | Requires skill Phases 3 to 4 skeletons (clean layers); tests green, endpoints PASS |
| **X2** Quran MVP | §5 scope | L | Acceptance criteria §5 + reviewer sign-off |
| **X3** Balagha & Adab MVP | §7 scope | M | Reviewer sign-off on ~60 examples |
| **X4** Poetry & prose MVP | §6 scope | L | Reviewer sign-off; licences confirmed |
| **X5** Cross-links and extras | Ayah/verse ↔ devices links, unified search, العروض (Tier B), retrospective + new proposals | M | Tier B/C approvals per item |

Each phase ends with: report, updated `docs/PROGRESS.md`, updated `docs/TEST_REPORT.md`, redeploy to the new Vercel account, and a feature retrospective (new ideas into `docs/FEATURE_PROPOSALS.md` with tiers).

Do **not** build X1 on top of the legacy structure. Refactor the layers first, or build the content modules as clean, isolated features from day one.

---

## 10. QA and review checklist

**Automated**
- Quran checksum test; Unicode validity (no stray control characters, consistent diacritic order); every user-visible `Annotation` has source + `reviewed`; link integrity (device examples point to real units); FTS search tests with harakat variants; API contract tests + live smoke on the deployed URL; performance budget (token tap < 300 ms local, list scroll at 60 fps on a mid-range Android device).

**Human (reviewer)**
- Sample-check at least 20% of new annotations per batch (100% for Quran-related ones); record disagreements as `disputed` instead of silently choosing.
- Verify poem attribution, verse order, and diacritics against the cited edition.
- Confirm each balagha example really illustrates its labeled device.

**In-app**
- "الإبلاغ عن خطأ" (report an error) on every annotation → queue for the reviewer (Tier A).

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| No qualified reviewer available | Ship a smaller seed set; keep everything else `unreviewed` and hidden |
| License surprises (GPL/non-commercial data, copyrighted editions) | X0 audit before any import; owner sign-off; keep sources swappable behind the annotation layer |
| Wrong Quranic text or diacritics | Immutable canonical source, checksums, skip auto-tashkeel on Quran |
| AI hallucinated religious/literary content | Provenance + review gate; no user-facing AI content in MVP |
| Scope explosion (three products at once) | Phases X0 to X5, MVP sizes fixed, WIP cap from the skill |
| Content pack too large or slow on low-end phones | Split packs by feature, lazy download, measure early |
| Font rendering breaks harakat | Test set of hard strings, bundled fonts, golden tests |
| Attribution disputes in poetry | `attribution certainty` field + citations, no guessing |

---

## 12. First actions for the agent

1. Read this plan and the `e3rbly-modernizer` skill; confirm they do not conflict.
2. Do **X0 only**: research sources with web search, read the actual license text of each, write `docs/CONTENT_SOURCES.md`, list open questions Q1 to Q7 with defaults, then **stop and wait for approval**.
3. Do not import any text into the repo before the owner approves sources.
