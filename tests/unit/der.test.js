const { der } = require('../../src/domain/arabic/der');
const gold = require('../fixtures/tashkeel_gold.json').sentences;

test.each(gold.map((g) => [g]))('gold vs itself = 0 errors: %s', (g) => {
  expect(der(g, g)).toMatchObject({ valid: true, der: 0, caseEndingDer: 0 });
});

test('one wrong case ending is counted in both rates', () => {
  const r = der('ذَهَبَ الْوَلَدُ', 'ذَهَبَ الْوَلَدَ');
  expect(r.wrong).toBe(1);
  expect(r.endWrong).toBe(1);
  expect(r.der).toBeCloseTo(1 / r.total);
});

test('missing marks count as errors', () => {
  expect(der('الْعِلْمُ نُورٌ', 'العلم نور').der).toBe(1);
});

test('changed letters make the pair invalid', () => {
  expect(der('الْعِلْمُ', 'الْقَلَمُ').valid).toBe(false);
});
