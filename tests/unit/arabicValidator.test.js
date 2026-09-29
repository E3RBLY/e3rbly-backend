const { isValidArabic } = require('../../src/utils/arabicValidator');
const corpus = require('../fixtures/arabic_corpus.json').sentences;

test.each(corpus.map((s) => [s.id, s.text]))('corpus %s is valid Arabic', (_id, text) => {
  expect(isValidArabic(text)).toBe(true);
});

test.each([
  ['empty', ''],
  ['spaces', '   '],
  ['not a string', 42],
  ['Latin', 'hello world'],
  ['one Arabic letter in Latin', 'aaaaaaaaaaب'],
  ['mostly Latin', 'Amazon ب'],
  ['digits only', '١٢٣ 456'],
  ['tatweel only', 'ـــ'],
  ['harakat only', 'َُِّ'],
])('rejects %s', (_label, text) => {
  expect(isValidArabic(text)).toBe(false);
});

test('accepts diacritized and tatweel-stretched words', () => {
  expect(isValidArabic('ذَهَبَ')).toBe(true);
  expect(isValidArabic('جـــــــــمـــيل')).toBe(true);
});
