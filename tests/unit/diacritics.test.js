const d = require('../../src/domain/arabic/diacritics');
const corpus = require('../fixtures/arabic_corpus.json').sentences;

test('stripDiacritics removes harakat, tanween, shadda, sukun, superscript alef only', () => {
  expect(d.stripDiacritics('إِنَّ الصَّبْرَ مِفْتَاحُ الْفَرَجِ')).toBe('إن الصبر مفتاح الفرج');
  expect(d.stripDiacritics('رأيتُ رجلاً كريماً')).toBe('رأيت رجلا كريما');
  expect(d.stripDiacritics('هٰذا')).toBe('هذا');
});

test('tatweel, hamza forms, digits, Latin and punctuation are untouched', () => {
  const t = 'جمـــيل: سأل المؤمنُ عن شاطئ ٢٠٢٠ Amazon؟';
  expect(d.stripDiacritics(t)).toBe('جمـــيل: سأل المؤمن عن شاطئ ٢٠٢٠ Amazon؟');
});

test.each(corpus.map((s) => [s.id, s.text]))('corpus %s: text is the same base as itself', (_id, text) => {
  expect(d.sameBaseText(text, text)).toBe(true);
  expect(d.sameBaseText(d.stripDiacritics(text), text)).toBe(true);
});

test('sameBaseText detects any letter change, even with identical marks', () => {
  expect(d.sameBaseText('ذَهَبَ', 'ذهب')).toBe(true);
  expect(d.sameBaseText('ذَهَبَ', 'ذَهَبْتَ')).toBe(false); // letter added
  expect(d.sameBaseText('مسألة', 'مسالة')).toBe(false); // hamza form changed
  expect(d.sameBaseText('جمـيل', 'جميل')).toBe(false); // tatweel dropped
});

test('shadda + vowel in either typed order compares equal (NFC)', () => {
  const a = 'إِنَّ'; // shadda then fatha
  const b = 'إِنَّ'; // fatha then shadda
  expect(d.sameBaseText(a, b)).toBe(true);
  expect(d.mergePreservingExisting(a, b)).toBe(a.normalize('NFC'));
});

test('merge keeps the user\'s marks and fills the rest from the suggestion', () => {
  // user typed a damma on the last letter of الولد only
  expect(d.mergePreservingExisting('ذهب الولدُ', 'ذَهَبَ الْوَلَدَ')).toBe('ذَهَبَ الْوَلَدُ'.normalize('NFC'));
});

test('merge refuses mismatched base text', () => {
  expect(() => d.mergePreservingExisting('ذهب', 'ذهبت')).toThrow(/base text differs/);
});

test('countMarks and hasDiacritics', () => {
  expect(d.countMarks('ذَهَبَ')).toBe(3);
  expect(d.hasDiacritics('ذهب')).toBe(false);
  expect(d.hasDiacritics('ذهبَ')).toBe(true);
});
