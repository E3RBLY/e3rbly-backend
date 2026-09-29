const { diacritize } = require('../services/tashkeelService');
const { isValidArabic } = require('../utils/arabicValidator');
const { errorCode, errorStatus } = require('../utils/errors');

// POST /api/tashkeel  { text: string, preserveExisting?: boolean }
async function tashkeel(req, res) {
  const { text, preserveExisting } = req.body || {};
  if (!isValidArabic(text)) {
    return res.status(400).json({ error: 'نص عربي غير صالح', code: 'INVALID_TEXT' });
  }
  if (preserveExisting !== undefined && typeof preserveExisting !== 'boolean') {
    return res.status(400).json({ error: 'preserveExisting must be a boolean', code: 'INVALID_INPUT' });
  }
  try {
    const result = await diacritize(text, { preserveExisting: preserveExisting !== false });
    return res.json(result);
  } catch (error) {
    if (error.code === 'TASHKEEL_LETTERS_CHANGED') {
      console.error('tashkeel rejected: model changed base letters');
      return res.status(502).json({ error: 'تعذر تشكيل النص بدقة. يرجى المحاولة مرة أخرى.', code: error.code });
    }
    console.error(`tashkeel failed: ${errorCode(error)}`);
    return res.status(errorStatus(error)).json({ error: 'فشل في تشكيل النص. يرجى المحاولة لاحقًا.', code: errorCode(error) });
  }
}

module.exports = { tashkeel };
