# Kids' Letter Magic + Daily I'rab: design

Status: draft for owner review. Two independent features; each gets its own implementation plan.

## Intent (agreed in conversation)

1. **Kids' feature.** Teach Arabic letters to ages 3-9 in a new way: the child draws letters and words with a finger (no keyboard), and the app recognises and corrects what was drawn. Ages 3-5 start with tracing; 6-9 continue to free drawing and words. Both handwriting styles matter: **Naskh** and **Ruq'ah**.
2. **Daily game.** One shared daily puzzle, "إعراب اليوم", plus a streak and a growing tree, to make users open the app every day. Owner delegated the idea; this is the chosen one.

Success: a child can trace, recall and write letters and short words and gets a gentle correction when wrong; a user can solve today's puzzle in about 2 minutes, sees a streak, and can share the result without spoilers.

Decisions made: Letter Magic concept (letter morphs into a picture that starts with it); emoji pictures behind a replaceable per-letter asset slot; one style per learning path chosen inside the grown-up gate (Naskh or Ruq'ah, separate progress each); on-device recognition; no ads, sign-in or external links in the kids' area.

## Part A: Kids' Letter Magic (mobile only, no backend)

Module `lib/features/kids_letters` (domain / data / presentation, like `features/quran`).

### Flow per letter
1. **Meet:** letter, picture, spoken name and sound (flutter_tts, on-device).
2. **Trace:** follow a dotted guide. Own `StrokeChecker` tests shape, direction and stroke order. A wrong attempt shows a ghost hand demonstrating the path; there is no failure screen, stars are earned per attempt.
3. **Magic:** the finished letter morphs into its picture. **Recall:** the picture is shown and the child draws the letter; ML Kit checks it.
4. **Words:** the child writes a short word; `WordCorrector` compares candidates with the target and gives feedback ("you wrote ت, we need ث"), handling initial / middle / final / isolated forms.
- Letters come in sets of 3-4. Three misses add guidance. Weak letters return later (simple spaced repetition).

### Units
| Unit | Purpose | Depends on |
|---|---|---|
| `LetterCatalog` | 28 letters: name, sound, forms, picture slot, example words, guide strokes per style (Naskh, Ruq'ah) | none |
| `StrokeChecker` (pure Dart) | score a stroke against a guide: shape, direction, order; report which part is wrong | none |
| `InkRecognizer` (interface) | strokes -> candidate characters; ML Kit implementation, fake for tests; exposes model-download state | google_mlkit_digital_ink_recognition |
| `WordCorrector` | candidates vs target word -> feedback | InkRecognizer result types |
| `ProgressRepository` | per-letter mastery and review schedule per style, stored locally | shared_preferences |
| `KidsLessonCubit` | drives Meet -> Trace -> Magic -> Recall -> Words | the above |
| Widgets | `DrawingPad`, `GhostHand`, `LetterMorph`, grown-up gate | flutter |

Entry: a drawer item behind the grown-up gate (simple maths question). Registered in get_it.

### Naskh and Ruq'ah
- Guide strokes exist per style; the child only sees the selected style. Ruq'ah has its own stroke order and simplified shapes (for example ك, ه) and compact baselines.
- Recognition is style-agnostic (ML Kit reads handwriting in general); style only affects guides and feedback.
- Guide shapes are **unreviewed** until a calligrapher checks them (the Ruq'ah shapes especially). A debug gallery draws all 28 letters x forms x 2 styles for review.

### Safety and data
- No ads (the app's ads feature is explicitly excluded from this module), no external links, no sign-in required.
- Progress stays on the device; drawings are never saved or sent.
- If the recognition model is not downloaded, tracing still works; recall and words unlock when the download finishes (Wi-Fi).

### Testing
Unit tests: `StrokeChecker`, `WordCorrector`, mastery/spaced repetition. Data test: all 28 letters x forms x 2 styles have valid guide paths. Widget tests with the fake recogniser. Overflow matrix on small phones and tablets (as done for Quran). **Handwriting accuracy can only be verified on a real device**; a debug APK with a test checklist is delivered, and accuracy is reported as unverified until then.

### Risks
Children's handwriting is messy (mitigation: own tracing checker, near-match acceptance in recall); guide-path errors make tracing feel wrong (mitigation: gallery review); ML model is a ~20 MB download; Ruq'ah shapes need expert review.

## Part B: Daily I'rab (mobile + small backend module)

### Mechanic
One puzzle per day, the same for everyone: a short sentence, the user resolves the i'rab of 3 marked words by choosing from options. Result: coloured squares (correct / wrong), no spoilers.

- **Streak:** consecutive days with a completed puzzle. A missed day resets it unless a **streak freeze** is available; freezes are earned by a bonus round, never purchased.
- **Tree:** grows through stages as the streak grows; visible on the home screen.
- **Share card:** image with the day number, squares and streak; no answers.
- **Reminder:** local notification at a user-chosen time, skipped if today's puzzle is done. Permission requested only when the user turns the reminder on.

### Content
The existing quiz endpoint generates questions with AI on the fly (no stable answer key, not identical for all users), so it is not used. Instead:
- Backend module `modules/daily` (isolated like `modules/quran`): a curated JSON pool of sentences, each with 3 target words, the correct i'rab and 3 wrong options per word, plus a short explanation.
- Puzzle of the day = deterministic pick from the pool by date (UTC+3 day boundary, documented), so all users match and no database is needed.
- `GET /v1/daily/today` returns the day's puzzle, `dayNumber` and `expires`. The client caches it and works offline for an already-fetched day.
- Every sentence is validated at load: exactly one correct option per word, options distinct, sentence contains the word. Sentences use simple, unambiguous constructions; the pool ships flagged `review_status: unreviewed` until a grammarian checks it, and the app shows a small "under review" note like the Quran drafts.
- Initial pool: a starter set (about 60 sentences, two months of daily puzzles) so the feature can launch; growth is a content task.

### Units (mobile)
`DailyPuzzleRepository` (fetch + cache), `StreakEngine` (pure Dart: streak, freeze, timezone-safe day math), `TreeStage` mapping, `ShareCardBuilder`, `ReminderScheduler` (flutter_local_notifications), `DailyCubit`, home entry card. Progress is local-only for v1 (no accounts).

### Out of scope (v1)
Leaderboards, friends, coins, shops, cross-device sync (would need accounts; see FEATURE_PROPOSALS Tier C).

### Testing
Backend: pool validation tests, deterministic date pick, endpoint contract, timezone boundary. Mobile: `StreakEngine` edge cases (missed day, freeze, DST/timezone change, device clock going backwards), widget tests, overflow matrix. Notifications need a real device to verify.

### Risks
Device-clock manipulation can fake a streak (acceptable in v1, local only; noted); i'rab options may be arguable for some sentences (mitigation: simple sentences, review flag); notification permission and OEM battery restrictions on Android reduce delivery.

## Delivery order
1. Part B backend module + StreakEngine (small, ships value fast). 2. Part B mobile UI. 3. Part A catalog and StrokeChecker, then recognizer, then lessons and Naskh/Ruq'ah gallery review. Each part is merged and released separately; nothing pushed to production without the owner's go.

## New dependencies
`google_mlkit_digital_ink_recognition`, `flutter_tts`, `flutter_local_notifications` (+ `timezone`), optional `confetti`, `share_plus` if not present.
