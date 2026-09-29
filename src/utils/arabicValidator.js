// Arabic input validation. Never modifies the text (harakat, tatweel, hamza forms are kept as-is).

// Arabic letters only: excludes tatweel (U+0640), harakat (U+064B-U+0652) and digits.
const ARABIC_LETTER = /[\u0621-\u063F\u0641-\u064A\u0671-\u06D3\u06FA-\u06FF\u0750-\u077F\u08A0-\u08C9\uFB50-\uFDFF\uFE70-\uFEFC]/u;
const ANY_LETTER = /\p{L}/u;

/** Share of letters (ignoring digits, spaces, punctuation, diacritics) that must be Arabic. */
const MIN_ARABIC_RATIO = 0.5;

function isValidArabic(text) {
  if (typeof text !== "string" || text.trim().length === 0) return false;
  let letters = 0;
  let arabic = 0;
  for (const ch of text) {
    if (ch === "\u0640") continue; // tatweel is decoration, not a letter
    if (ARABIC_LETTER.test(ch)) {
      arabic += 1;
      letters += 1;
    } else if (ANY_LETTER.test(ch)) {
      letters += 1;
    }
  }
  return arabic > 0 && arabic / letters >= MIN_ARABIC_RATIO;
}

module.exports = { isValidArabic, MIN_ARABIC_RATIO };
