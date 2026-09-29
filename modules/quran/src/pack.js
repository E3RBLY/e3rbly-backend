/**
 * Quran pack: parse the Tanzil text file and verify it against pinned checksums.
 *
 * The Quran text is immutable (Tanzil terms: "changing it is not allowed").
 * Nothing here trims, normalizes or re-encodes ayah text; the string that was in the
 * file is the string that is served. Checksums cover the exact UTF-8 bytes.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const TEXT_FILE = path.join(DATA_DIR, "quran-uthmani.txt");
const CHECKSUMS_FILE = path.join(DATA_DIR, "checksums.json");
const SOURCE_FILE = path.join(DATA_DIR, "source.json");

// Independent of the text file: the standard Hafs ayah count per surah (6,236 in total).
const AYAH_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89,
  59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30,
  52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15,
  21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];
const TOTAL_AYAT = 6236;

const sha256 = (input) => crypto.createHash("sha256").update(input).digest("hex");

/** Parse `surah|ayah|text` lines; `#` lines and blank lines are the license notice. */
function parseTanzil(buffer) {
  const raw = buffer.toString("utf8");
  if (raw.includes("\r")) throw new Error("quran text must use LF line endings");
  if (raw.charCodeAt(0) === 0xfeff) throw new Error("quran text must not start with a BOM");

  const surahs = Array.from({ length: 114 }, () => []);
  const notice = [];
  for (const line of raw.split("\n")) {
    if (line === "") continue;
    if (line.startsWith("#")) {
      notice.push(line);
      continue;
    }
    const first = line.indexOf("|");
    const second = line.indexOf("|", first + 1);
    if (first < 1 || second < 0) throw new Error(`malformed line: ${line.slice(0, 40)}`);
    const surah = Number(line.slice(0, first));
    const ayah = Number(line.slice(first + 1, second));
    const text = line.slice(second + 1);
    if (!Number.isInteger(surah) || surah < 1 || surah > 114) throw new Error(`bad surah: ${surah}`);
    if (ayah !== surahs[surah - 1].length + 1) throw new Error(`gap or disorder at ${surah}:${ayah}`);
    surahs[surah - 1].push(text);
  }
  return { surahs, notice: notice.join("\n") };
}

/** SHA-256 of a surah's ayah texts joined by "\n" (UTF-8, no trailing newline). */
const surahChecksum = (ayat) => sha256(Buffer.from(ayat.join("\n"), "utf8"));

function computeChecksums(buffer) {
  const { surahs } = parseTanzil(buffer);
  return { file_sha256: sha256(buffer), surahs: surahs.map(surahChecksum) };
}

/** Throws unless the parsed text is complete and matches the pinned checksums. */
function verifyPack(parsed, fileBuffer, pinned) {
  const problems = [];
  const total = parsed.surahs.reduce((n, s) => n + s.length, 0);
  if (total !== TOTAL_AYAT) problems.push(`expected ${TOTAL_AYAT} ayat, found ${total}`);
  parsed.surahs.forEach((ayat, i) => {
    if (ayat.length !== AYAH_COUNTS[i]) problems.push(`surah ${i + 1}: expected ${AYAH_COUNTS[i]} ayat, found ${ayat.length}`);
    if (surahChecksum(ayat) !== pinned.surahs[i]) problems.push(`surah ${i + 1}: checksum mismatch`);
  });
  if (sha256(fileBuffer) !== pinned.file_sha256) problems.push("file checksum mismatch");
  if (problems.length) throw new Error(`Quran pack verification failed:\n${problems.join("\n")}`);
}

function loadPack({ textFile = TEXT_FILE, checksumsFile = CHECKSUMS_FILE, sourceFile = SOURCE_FILE } = {}) {
  const buffer = fs.readFileSync(textFile);
  const parsed = parseTanzil(buffer);
  const pinned = JSON.parse(fs.readFileSync(checksumsFile, "utf8"));
  verifyPack(parsed, buffer, pinned);
  const source = JSON.parse(fs.readFileSync(sourceFile, "utf8"));
  return { surahs: parsed.surahs, notice: parsed.notice, checksums: pinned, source };
}

module.exports = { AYAH_COUNTS, TOTAL_AYAT, TEXT_FILE, CHECKSUMS_FILE, parseTanzil, computeChecksums, verifyPack, loadPack, sha256 };

const SHADDA = "ّ";
const stripShadda = (s) => s.split(SHADDA).join("");

/**
 * Tanzil puts the basmala in front of ayah 1 of every surah except 1 (where it IS ayah 1) and 9.
 * We never edit that string. This only reports where the basmala ends, so clients can show the
 * ayah proper: `basmala + " " + ayah === text` always holds (lossless split on the 4th space).
 */
function splitBasmala(surah, text, canonicalBasmala) {
  if (surah === 1 || surah === 9) return { basmala: null, ayah: text };
  const words = text.split(" ");
  const head = words.slice(0, 4).join(" ");
  if (stripShadda(head) !== stripShadda(canonicalBasmala)) {
    throw new Error(`surah ${surah}: ayah 1 does not start with the basmala`);
  }
  return { basmala: head, ayah: words.slice(4).join(" ") };
}

module.exports.splitBasmala = splitBasmala;
