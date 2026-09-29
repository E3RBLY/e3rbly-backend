const { splitBasmala } = require("../src/pack");

/** The ayah proper as an array of words, exactly as Tanzil spells them. */
function ayahWords(pack, surah, ayah) {
  const text = pack.surahs[surah - 1][ayah - 1];
  const proper = ayah === 1 ? splitBasmala(surah, text, pack.surahs[0][0]).ayah : text;
  return proper.split(" ");
}

/**
 * UNGROUNDED prompt: no third-party i'rab or tafsir text is included, so the model works from its own
 * knowledge and must not cite books. Words are pre-split so the output can be checked against the input.
 */
function buildPrompt(words) {
  return [
    "You are an expert in classical Arabic grammar (nahw and sarf) analysing one Quranic ayah for a research pilot.",
    "The output is a DRAFT that a human specialist will check. Accuracy matters more than completeness.",
    "",
    "Rules:",
    "- Return JSON only, matching the schema below. One entry per input word, same order, same count.",
    '- Copy each word into "text" EXACTLY as given (same letters and marks). Never correct, re-vocalise or change it.',
    "- Do not quote or cite any book, scholar, or tafsir. Do not invent sources. If you are unsure, lower the confidence.",
    '- Where scholars accept more than one wajh i\'rabi, put the most common one in the main fields and the others in "alternatives".',
    "- Write role, case and reason in Arabic, using standard terminology.",
    "",
    'Schema: {"words":[{"index":0,"text":"","pos":"","root":"","lemma":"","wazn":"","role":"","case":"","reason":"","confidence":0.0,"alternatives":[{"role":"","case":""}]}]}',
    "",
    `Words (${words.length}): ${JSON.stringify(words)}`,
  ].join("\n");
}

module.exports = { ayahWords, buildPrompt };
