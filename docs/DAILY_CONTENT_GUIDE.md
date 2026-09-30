# Daily I'rab: content guide

The pool lives in `modules/daily/data/puzzles.json`. The validator (`npm run -s validate:daily`) checks structure only; whether the grammar is right is a human check.

1. **Sentences:** 3-6 words, unvocalised, one clear analysis. If grammarians accept two analyses of a word, do not use the sentence (for example a noun before a verb, where schools differ).
2. **Options:** every wrong option must be plainly wrong for that word (wrong case, wrong function). Never offer a second valid analysis. Do not use `majrur` as a distractor for a `mudaf_ilayh` word, or the reverse without care: a muḍāf ilayh is also majrūr.
3. **Labels:** reuse the shared vocabulary in `labels`. Add a label only when needed, worded in the same style (function, then case, then the sign). Two labels may never have the same text.
4. **Explanations:** one sentence naming the reason. Never claim scholar approval or attribute the analysis to a book.
5. **Ids:** continue the sequence (`d-061`, ...). A target word must appear exactly once in the sentence, spelled exactly as in the sentence.
6. **Review status:** the file stays `review_status: "unreviewed"` until a named grammarian signs off; record the name and date in `docs/PROGRESS.md`, then change the value to `reviewed`. The app shows the "under review" notice until then.
7. **Launch gate:** `npm run -s validate:daily -- --min 60`.

The first 60 puzzles were drafted with a fixed set of explanation templates and cover: past and present verbs with fa'il and maf'ul bih, mubtada/khabar, time and place adverbs, na't, prepositions and majrur nouns, idafa, inna and kana with their nouns and khabars, the dual, sound masculine and feminine plurals, and the five nouns. Not yet covered: hal, verbs of the imperative, conjunctions, jazm, and the accusative particles other than inna.
