// Utility function to validate if a string contains Arabic characters

function isValidArabic(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return false;
  }
  // Regular expression to check for Arabic characters
  // This range covers basic Arabic letters, diacritics, and numerals.
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return arabicRegex.test(text);
}

module.exports = {
  isValidArabic,
};

