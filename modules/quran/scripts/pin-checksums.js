/**
 * Recompute and (re)write data/checksums.json from data/quran-uthmani.txt.
 * Only run this when deliberately importing a new Tanzil version. Review the diff:
 * every changed line means the Quran text changed.
 */
const fs = require("fs");
const { TEXT_FILE, CHECKSUMS_FILE, computeChecksums } = require("../src/pack");

const checksums = computeChecksums(fs.readFileSync(TEXT_FILE));
fs.writeFileSync(CHECKSUMS_FILE, `${JSON.stringify(checksums, null, 2)}\n`);
console.log(`pinned ${checksums.surahs.length} surahs, file ${checksums.file_sha256}`);
