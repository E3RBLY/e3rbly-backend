/**
 * Normalizes the i'rab explanation text returned by the model for the app, which renders it
 * as plain text. Some models (Groq's gpt-oss in particular) answer in Markdown, which the app
 * would show literally, and which broke the exact-marker check (live 500s).
 *
 * Only Markdown symbols and whitespace are touched; Arabic letters, harakat, shadda and
 * tatweel are never changed.
 */
const MARKERS = ['الجملة الأصلية', 'الإعراب'];

/** Returns the plain-text explanation, or null when the required markers are missing. */
function toPlainExplanation(text) {
  if (typeof text !== 'string') return null;

  let out = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*#{1,6}\s+/, '') // headings
        .replace(/^(\s*)[*+]\s+/, '$1- ') // "* item" bullets -> "- item"
        .replace(/\*+|__|`+/g, '') // bold/italic/code markers
        .replace(/[ \t]+$/, ''),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  for (const marker of MARKERS) {
    out = out.split(new RegExp(`${marker}[ \t]+:`)).join(`${marker}:`);
  }

  return MARKERS.every((m) => out.includes(`${m}:`)) ? out : null;
}

module.exports = { toPlainExplanation };
