# AI-generated draft explanations (in-house)

Status: **recorded 2026-09-30**. This file is the "license" for the packs `ai-simple`, `ai-tafsir` and `ai-irab` under `modules/quran/data/annotations/`.

## What they are

Short Arabic texts (simple explanation, meaning summary, i'rab) written by an AI model **from its own knowledge, without being given any third-party tafsir or i'rab text**. Nothing was copied from a book, so no third-party copyright is involved. The Quran text itself is Tanzil's, unchanged, under `tanzil-terms.md`.

## Owner decision

On 2026-09-30 the owner asked for the tafsir, simple explanation and i'rab tabs to show AI-generated text. We agreed to show it **only with these safeguards**:

1. `provenance: ai_draft` and `review_status: unreviewed` are stored in the data and returned by the API.
2. The app shows a visible warning on every unreviewed text: it is AI-generated, not checked by a specialist, may contain errors, and must not be relied on alone.
3. It is **never attributed to a scholar or a book**. Source names say "مسودة بالذكاء الاصطناعي". The "tafsir" tab here is a plain-language meaning summary, not a quotation of Ibn Kathir, al-Tabari or anyone else.
4. **Owner decision 2026-09-30: public production shows these labelled drafts by default.** Set `QURAN_INCLUDE_UNREVIEWED=false` on the server to hide unreviewed content instantly (only `reviewed` items are then served).
5. Reviewed text replaces drafts item by item: a specialist changes `review_status` to `reviewed` (or corrects the text), and the warning disappears for that item.

## Known risks (why the warning exists)

Language models can state wrong meanings, wrong i'rab, or wrong attributions with confidence, and religious text raises the stakes. Draft quality has not been measured (the pilot in `modules/quran/pilot` exists to measure it). Do not remove the warning or the `unreviewed` status without a reviewer's sign-off.

## Provider terms

Drafts generated with a free-tier provider key are subject to that provider's terms. Only Quran words and generic instructions are sent to the provider; no licensed third-party text is ever included in the prompt.
