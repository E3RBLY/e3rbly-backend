#!/usr/bin/env node
/**
 * Validates every annotation pack (licenses, provenance, review status, ayah refs).
 * Run in CI; exits 1 with the full problem list. Uses include-unreviewed mode so
 * unreviewed packs are still checked, even though they are not served.
 */
const { loadAnnotations } = require("../src/annotations");

try {
  const store = loadAnnotations({ includeUnreviewed: true });
  const sources = store.sources();
  console.log(`annotation packs OK: ${sources.length} source(s)`);
  for (const s of sources) console.log(`  ${s.id} (${s.kind}, ${s.provenance}): ${s.coverage.ayat} ayat`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
