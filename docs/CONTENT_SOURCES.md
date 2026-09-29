# Content Sources Audit (Phase X0), revision 2

Status: **DRAFT. §6 picks do NOT yet meet the owner's approval condition (see §6). Nothing has been imported. No AI drafting has been run.**
Date: 2026-09-29. Method: web research. Where a fetch tool only returned a summary, or a page returned 404, the item is marked **UNVERIFIED**. Saved license texts live in `docs/licenses/`.

Legend: ✅ clear · ⚠️ conditional · ❌ do not use · ❓ unverified.

## 0. Owner decisions recorded (2026-09-29)

1. Reviewer: **not named yet**. Proceed with X1 and the Quran reader on imported, attributed sources. No in-house balagha/poetry annotations. Layer 2 (word-level) stays hidden until a reviewer exists.
2. Tafsir: **al-Muyassar (concise) + Ibn Kathir (detailed)**, subject to license verification of the specific digitization. A language-focused third source is recommended below but not imported.
3. i'rab: all 6,236 ayat. Layer 1 = imported complete works, all وجوه kept, attributed. Layer 2 = in-house, **no GPL data in app or repo**. Tier C: cost estimate + hard cap needed before any AI run (§7).
4. QUL: license **unverified**. Nothing imported until written permission for specific resource IDs and attribution wording. Owner will place QUL's terms in `docs/licenses/qul-terms.md` (not present yet).
5. §6 approved only if every pick has its license text saved, none is "unstated", and the Quran text has explicit terms plus a checksum test.

## 1. Quran text (the one item that meets the bar)

| | |
|---|---|
| Source | **Tanzil Project** (Uthmani), https://tanzil.net |
| License | Creative Commons Attribution 3.0 plus Tanzil's terms: verbatim copies only, **"changing it is not allowed"**, source clearly indicated with a link to tanzil.net, notice reproduced in all files containing a substantial portion |
| Saved | [licenses/tanzil-text-license.md](licenses/tanzil-text-license.md), downloaded directly from tanzil.net (verbatim) |
| Verdict | ✅ explicit terms. Checksum test: SHA-256 per surah computed at import and pinned in the repo; CI fails on any byte change |
| Caveat | UNVERIFIED which printed mushaf Tanzil follows. The plan's reviewer (or any Arabic-literate person) should spot-check a few surahs against a printed Madinah mushaf. Search uses a separate normalized copy, never a modified Quran text. The app must show the Tanzil credit and link |

## 2. Layer 1: ayah-level i'rab works, ranked

Ranking criteria: license clarity of the *digitization*, digitization quality, coverage of all 6,236 ayat. **Honest result: no candidate currently has an explicit, saved license for a usable digitization.** Public-domain status of a medieval author does not clear a modern tahqiq or a digitizer's database.

| Rank | Work | Author status | Coverage | Digitizations seen | License clarity | Verdict |
|---|---|---|---|---|---|---|
| 1 | **إعراب القرآن، النحاس** (d. 338 H) | PD text | Full Quran, about 3 vols | tafsir.app (no terms found), Shamela, OpenITI | ❓ none stated | ⚠️ best fit for size and focus; needs a digitization with terms |
| 2 | **التبيان في إعراب القرآن، العكبري** (d. 616 H) | PD text | Full Quran | Internet Archive scan (ط الحلبي, تحقيق البجاوي), Shamela, Waqfeya PDF | ❓ scans are images; the tahqiq may be copyrighted (UNVERIFIED) | ⚠️ needs clean text + edition rights |
| 3 | **الدر المصون، السمين الحلبي** (d. 756 H) | PD text | Full Quran, about 10 vols (very large: big pack, harder to parse per ayah) | tafsir.app, Shamela | ❓ none stated | ⚠️ later, not first |
| 4 | **إعراب القرآن وبيانه، الدرويش** (d. 1403 H) | **Still in copyright** (life+50 gives about 2033; life+70 longer) | Full | tafsir.app, Shamela, Waqfeya, Islamway | ❌ third-party copies, no license | ❌ only with written permission from the publisher/heirs |
| 5 | **الجدول في إعراب القرآن، صافي** | Author death date not verified by me (UNVERIFIED) | Full | Not found in my searches | ❓ | ❓ check |

Digitization providers found, none with explicit reuse terms in what I read: **tafsir.app** (about page says nothing on terms), **Shamela**, **OpenITI/KITAB** (secondary sources say **CC BY-NC-SA 4.0**; I could not fetch its LICENSE file, so UNVERIFIED; if true, NonCommercial + ShareAlike conflicts with any future paid/ad model and ShareAlike would bind our pack; its texts largely originate from Shamela, so upstream rights are unclear too).

### How to unblock (recommended, in order)
1. **Ask for written permission** (I can draft the messages; you send them): tafsir.app maintainers and/or Shamela for النحاس + العكبري + السمين text and the specific tahqiq. Ask exactly: permission to redistribute inside a free mobile app content pack, with attribution wording.
2. **Verify OpenITI's LICENSE** and decide if NC-SA is acceptable at all.
3. **Fallback:** transcribe from a public-domain scan of an old edition. Costly (OCR + proofreading), and only feasible with a reviewer.
Layer 1 needs a verdict on *one* work first (النحاس or العكبري); the rest can follow the same pipeline.

### Differing وجوه
Schema stores one row per (ayah, source, wajh); UI lists all with the source name, never ranking them. Parsing a prose i'rab work into per-ayah, per-wajh rows is itself real work: each work is organized by ayah or by verse-fragment, and headings differ. Budget parsing and a validation suite (6,236/6,236 coverage check per work).

## 3. Tafsir

| Source | Author/owner | License clarity | Verdict |
|---|---|---|---|
| **التفسير الميسر** | King Fahd Complex (institutional author, modern) | I found **no** terms of use for the text. Seen on tafsir.app and Internet Archive, uploaded by third parties. The Complex offers fonts under a free license per secondary mention, which is not the same as the text | ❓ likely usable only with the Complex's permission; treat as **not cleared** |
| **تفسير ابن كثير** (d. 774 H) | PD text | Digitizations: spa5k/tafsir_api and yisa90/rawi-tafsir (both say "public domain or fair use", which is a claim, not a license, and they pull from QUL/altafsir), tafsir.app. QUL unverified | ❓ **not cleared** |
| **التحرير والتنوير، ابن عاشور** (d. 1393 H = 1973), recommended language-focused third source | Life+50 passed in 2023, life+70 not until 2043; jurisdiction-dependent | No digitization license seen | ⚠️ recommended for later, **not imported** per decision 2 |

Rule kept: each tafsir is shown separately with its source name, never merged or paraphrased.

## 4. QUL (Tarteel)

Status: **license UNVERIFIED. Excluded.** My attempt to fetch its terms page returned 404. Awaiting `docs/licenses/qul-terms.md` from the owner and written permission for the exact resource IDs and attribution wording. Nothing from QUL or from repos that re-package QUL data (spa5k, rawi-tafsir) will be used until then.

## 5. Layer 2 word-level data

- **Quranic Arabic Corpus:** GPL v3. **Excluded by decision 3.** Not in the repo, not in the app, not used as training or checking data.
- **In-house route** (decision 3) is Tier C and is detailed in §7. Design notes that need the owner's attention:
  1. **Independence:** the classical i'rab works copy from each other (السمين draws on العكبري and others). "Two independent sources agree" is weaker than it sounds; I will treat sources as independent only when they are different lines of transmission, and report an agreement rate rather than assume correctness. The random-sample error rate is the real measure.
  2. **Sending text to an AI provider = uploading third-party content.** If the imported i'rab text is not licensed for that use, this is a further license question. Public-domain text with clear terms first.
  3. Without a reviewer, layer 2 stays unpublished (decision 1). The automated pipeline can still run to produce drafts and a disagreement queue.
  4. Plan rule 2 (no unlabeled AI religious content) still holds: published layer-2 items are labeled as machine-assisted with their confidence and source.

## 6. Recommended picks and whether they meet your condition

Your condition: license text saved in `docs/licenses/`, none "unstated", Quran text with explicit terms + checksum.

| Pick | License saved? | Explicit? | Meets condition? |
|---|---|---|---|
| Quran text: Tanzil | Yes | Yes | ✅ |
| Tafsir al-Muyassar | No | No terms found | ❌ |
| Tafsir Ibn Kathir | No | Claims only | ❌ |
| i'rab layer 1 (النحاس first, then العكبري) | No | No | ❌ |
| Layer 2 in-house | n/a (no GPL data) | n/a | ⏳ pending §7 approval |

**Result: §6 is not approved as it stands.** Only the Quran text passes. Revised recommendation: proceed with X1 and the reader skeleton using **Tanzil only**; get written permissions (§2 steps 1–2, Muyassar via King Fahd Complex, Ibn Kathir via a digitizer) before importing any tafsir or i'rab. I need you to confirm this revised §6 before anything is imported.

## 7. Layer 2 AI cost estimate (Tier C: no run until you approve a number)

Estimate only. Everything here is a planning figure, not a measurement, and no model was called.

Assumptions (state and change them if you disagree):
- Quran size: about 77,000 words, 6,236 ayat (about 12.4 words/ayah).
- Per-ayah call: instructions + schema (cached across calls) + the ayah + the i'rab passages of 2 works for that ayah. Estimated **input about 3,000 tokens**, **output about 750 tokens** (about 60 tokens per word of structured JSON: role, case, root, pattern, POS, citation).
- Arabic tokenization is heavier than English; these figures include a safety margin but are unmeasured.

| Scenario | Calls | Input tokens | Output tokens |
|---|---|---|---|
| Single draft pass | 6,236 | about 18.7M | about 4.7M |
| Two independent draft passes (cross-check) | 12,472 | about 37M | about 9.4M |
| + retries/re-drafts of disagreements (assume 30%) | about 16,200 | about 48M | about 12M |

**Dollar total: not stated yet.** I will not quote a price from memory; I will read the provider's current pricing for the chosen model and give you: (a) total for each scenario, (b) with and without prompt caching and batch discounts, (c) a proposed hard cap with 25% headroom, enforced in the script (it stops when the cap is hit and prints spend).

Proposed safeguards before you approve:
1. **Pilot of 20 ayat** from الفاتحة and الإخلاص-level short surahs, cost under a small fixed cap, to measure real tokens, agreement rate and error rate. Extrapolate then.
2. Hard budget cap in code, per-run call cap, dry-run mode that prints projected spend, resumable so nothing is paid for twice.
3. Only surahs whose source text is cleared for this use.

Ask: approve (a) the pilot, and (b) that I return with the priced estimate after the pilot. I will not draft anything before that.

## 8. Next steps

1. You: confirm the revised §6 (Tanzil only for now).
2. You: paste QUL terms into `docs/licenses/qul-terms.md` (optional, only if you still want QUL).
3. You: decide whether to send permission requests (I will draft them; I won't send anything).
4. Me, on your go: start X1 in isolation (schema, Tanzil importer with checksums, validation suite, `/v1/quran` endpoints). Note X1's gate: the current backend layers are still legacy, so this would be built as a clean isolated module.

## 10. Findings from the X1 import (2026-09-29)

- **Variant chosen:** Tanzil Uthmani (full), Hafs 'an 'Asim, txt-2, v1.1. Reason: keeps every Quranic mark; simplified scripts would be a change to the text. Recorded in `DECISIONS.md` and `data/source.json`.
- **Basmala:** Tanzil prefixes the basmala to ayah 1 of every surah except 1 and 9. The API keeps `text` verbatim and adds `text_ayah`/`basmala_prefixed` (lossless).
- **Possible upstream error, for a reviewer to confirm:** in surahs **95 and 97** the basmala is spelled with an extra shadda on the ba (بِّسْمِ). I did not correct it (changing is not allowed); a test pins the current state so any upstream fix is a visible diff. Consider reporting it to Tanzil.
- **Fonts:** none bundled. Waiting for KFGQPC written terms (draft letter §3 in `licenses/permission-requests.md`).
