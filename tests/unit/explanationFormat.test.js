const { toPlainExplanation } = require('../../src/utils/explanationFormat');

const plain = 'الجملة الأصلية: ذهب الولد\nالإعراب:\nذهب: فعل ماض مبني على الفتح';

test('already plain: returned unchanged', () => {
  expect(toPlainExplanation(plain)).toBe(plain);
});

test('markdown bold/headings/bullets from the model are stripped', () => {
  const md = '### **الجملة الأصلية**: ذهب الولد\n\n**الإعراب**:\n* **ذهب**: فعل ماض مبني على الفتح\n* `الولد`: فاعل مرفوع';
  expect(toPlainExplanation(md)).toBe(
    'الجملة الأصلية: ذهب الولد\n\nالإعراب:\n- ذهب: فعل ماض مبني على الفتح\n- الولد: فاعل مرفوع',
  );
});

test('space before the marker colon is accepted and normalized', () => {
  expect(toPlainExplanation('الجملة الأصلية : ذهب\nالإعراب :\nذهب: فعل')).toBe('الجملة الأصلية: ذهب\nالإعراب:\nذهب: فعل');
});

test('harakat, shadda and tatweel are never touched', () => {
  const t = 'الجملة الأصلية: إِنَّ الصَّبْرَ مِفْتَـاحُ الْفَرَجِ\nالإعراب:\nإِنَّ: حرف توكيد ونصب';
  expect(toPlainExplanation(`**${t}**`)).toBe(t);
});

test('extra blank lines collapse to one empty line', () => {
  expect(toPlainExplanation('الجملة الأصلية: ذهب\n\n\n\nالإعراب:\nذهب: فعل')).toBe('الجملة الأصلية: ذهب\n\nالإعراب:\nذهب: فعل');
});

test.each([['some unrelated text'], ['الإعراب: فقط'], [''], [null], [undefined]])('missing markers -> null (%p)', (t) => {
  expect(toPlainExplanation(t)).toBeNull();
});
