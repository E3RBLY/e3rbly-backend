/**
 * Caps the length of user-supplied text fields before they reach a prompt
 * (cost control and a smaller prompt-injection surface; audit C3/H4).
 * Lengths count Unicode code points, so harakat count as characters.
 */
function intFromEnv(name, fallback) {
  const n = Number.parseInt(process.env[name], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function fieldLimits() {
  const text = intFromEnv("MAX_TEXT_CHARS", 1000);
  return {
    arabicText: text,
    exerciseText: text,
    userAnswer: text,
    correctAnswer: text,
    topic: 200,
    conceptName: 200,
    conceptType: 50,
    difficulty: 50,
    exerciseType: 50,
    exerciseId: 100,
  };
}

function inputLimits(req, res, next) {
  const body = req.body;
  if (!body || typeof body !== "object") return next();
  const limits = fieldLimits();
  for (const [field, max] of Object.entries(limits)) {
    const value = body[field];
    if (typeof value === "string" && [...value].length > max) {
      return res.status(400).json({
        error: `النص طويل جدًا. الحد الأقصى ${max} حرفًا.`,
        code: "TEXT_TOO_LONG",
        field,
        max,
      });
    }
  }
  return next();
}

module.exports = { inputLimits, fieldLimits };
