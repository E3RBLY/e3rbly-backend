/**
 * Arabic diacritics (harakat) helpers. Pure functions, no dependencies.
 *
 * Invariant used by tashkeel: a diacritizer may ADD marks but must never change,
 * add, drop or reorder base letters. `sameBaseText(a, b)` checks exactly that.
 *
 * Marks handled: tanween (U+064B-064D), fatha/damma/kasra (064E-0650), shadda (0651),
 * sukun (0652), superscript alef (0670). Tatweel (0640) is a base character here:
 * it is kept exactly where the user typed it.
 */
const MARK = /[ً-ْٰ]/;
const MARKS_G = /[ً-ْٰ]/g;

const isMark = (ch) => MARK.test(ch);

/** NFC so shadda+vowel ordering is canonical on both sides of any comparison. */
const nfc = (s) => (typeof s === 'string' ? s.normalize('NFC') : s);

function stripDiacritics(text) {
  return nfc(text).replace(MARKS_G, '');
}

function countMarks(text) {
  return (nfc(text).match(MARKS_G) || []).length;
}

function hasDiacritics(text) {
  return MARK.test(text);
}

function sameBaseText(a, b) {
  return stripDiacritics(a) === stripDiacritics(b);
}

/** Split into [base char, marks after it] clusters. Leading marks attach to an empty base. */
function clusters(text) {
  const out = [];
  for (const ch of nfc(text)) {
    if (isMark(ch)) {
      if (!out.length) out.push({ base: '', marks: '' });
      out[out.length - 1].marks += ch;
    } else {
      out.push({ base: ch, marks: '' });
    }
  }
  return out;
}

/**
 * Merge a suggestion into the original: wherever the user already typed marks on a
 * letter, keep theirs; elsewhere take the suggestion's. Requires sameBaseText.
 */
function mergePreservingExisting(original, suggested) {
  if (!sameBaseText(original, suggested)) {
    throw new Error('mergePreservingExisting: base text differs');
  }
  const o = clusters(original);
  const s = clusters(suggested);
  return nfc(o.map((c, i) => c.base + (c.marks || (s[i] ? s[i].marks : ''))).join(''));
}

/**
 * Spelling variants a model "corrects" while diacritizing (انا -> أنا, الى -> إلى,
 * مدرسه -> مدرسة, علي -> على). They count as the same letter when aligning, but the
 * USER's letter is always the one kept.
 */
const EQUIVALENT = [new Set(['ا', 'أ', 'إ', 'آ', 'ٱ']), new Set(['ي', 'ى']), new Set(['ه', 'ة'])];
const sameLetter = (a, b) => a === b || EQUIVALENT.some((g) => g.has(a) && g.has(b));
const isSpace = (ch) => /\s/.test(ch);

/**
 * Copy the suggestion's marks onto the original's letters, cluster by cluster.
 * Letters (and spaces) always come from the original, so
 * stripDiacritics(result) === stripDiacritics(original) by construction.
 * Marks the user already typed win (unless keepExisting is false). Returns null when the texts don't align
 * (a real letter was added, dropped or changed).
 */
function transferMarks(original, suggested, { keepExisting = true } = {}) {
  const o = clusters(original);
  const s = clusters(suggested);
  let j = 0;
  let out = '';
  for (const c of o) {
    while (j < s.length && isSpace(s[j].base) && !isSpace(c.base)) j++;
    if (isSpace(c.base)) {
      out += c.base + c.marks;
      while (j < s.length && isSpace(s[j].base)) j++;
      continue;
    }
    if (j >= s.length || !sameLetter(c.base, s[j].base)) return null;
    out += c.base + (keepExisting ? c.marks || s[j].marks : s[j].marks);
    j++;
  }
  while (j < s.length && isSpace(s[j].base)) j++;
  return j === s.length ? nfc(out) : null;
}

module.exports = {
  stripDiacritics,
  countMarks,
  hasDiacritics,
  sameBaseText,
  mergePreservingExisting,
  transferMarks,
  isMark,
};
