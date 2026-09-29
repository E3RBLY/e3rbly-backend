/**
 * Diacritic Error Rate (DER) for tashkeel evaluation.
 * For each Arabic letter, the set of marks on it in the prediction must equal the gold set.
 * DER = wrong letters / Arabic letters. "Case-ending DER" looks only at each word's last letter.
 * Letters where gold has no mark are skipped (gold leaves them intentionally bare, e.g. ال before sun letters).
 */
const d = require('./diacritics');

const ARABIC_LETTER = /[ء-غف-ي]/;

function letterMarks(text) {
  const out = []; // [{ch, marks, wordEnd}]
  const s = text.normalize('NFC');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (d.isMark(ch)) {
      if (out.length) out[out.length - 1].marks.push(ch);
      continue;
    }
    if (ARABIC_LETTER.test(ch)) out.push({ ch, marks: [], wordEnd: false });
    else if (out.length && /\s|[.,،؛:!?؟]/.test(ch)) out[out.length - 1].wordEnd = true;
  }
  if (out.length) out[out.length - 1].wordEnd = true;
  return out;
}

function der(gold, predicted) {
  if (!d.sameBaseText(gold, predicted)) return { valid: false };
  const g = letterMarks(gold);
  const p = letterMarks(predicted);
  let total = 0, wrong = 0, endTotal = 0, endWrong = 0;
  g.forEach((gl, i) => {
    if (!gl.marks.length) return;
    const ok = gl.marks.slice().sort().join('') === (p[i] ? p[i].marks.slice().sort().join('') : '');
    total += 1; if (!ok) wrong += 1;
    if (gl.wordEnd) { endTotal += 1; if (!ok) endWrong += 1; }
  });
  return { valid: true, total, wrong, der: total ? wrong / total : 0, endTotal, endWrong, caseEndingDer: endTotal ? endWrong / endTotal : 0 };
}

module.exports = { der, letterMarks };
