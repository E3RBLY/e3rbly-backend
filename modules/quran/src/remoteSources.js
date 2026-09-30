/**
 * Tafsir served on demand by AlQuran Cloud (docs/licenses/alquran-cloud-terms.md).
 *
 * Design (follows the provider's terms): one upstream request per ayah, covering every wanted
 * edition; results cached in memory and by the CDN; no bulk crawl and no mirror in our repo.
 * Text is passed through exactly as received. Any failure degrades to "these books are
 * unavailable right now": it never fails the whole annotations response.
 */
const fs = require("fs");
const path = require("path");
const { AYAH_COUNTS } = require("./pack");
const { validateSource, KINDS } = require("./annotations");

const DEFAULT_FILE = path.join(__dirname, "..", "data", "remote-sources.json");
const DEFAULT_LICENSES_DIR = path.join(__dirname, "..", "..", "..", "docs", "licenses");
const MAX_TEXT = 300000; // longest real entry seen is ~18k characters; anything wildly bigger is not a tafsir

/** Reads and validates the source list. Throws one error listing every problem. */
function loadRemoteSources({ file = DEFAULT_FILE, licensesDir = DEFAULT_LICENSES_DIR, env = process.env } = {}) {
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  const problems = [];
  const disabledIds = new Set((env.QURAN_DISABLED_SOURCES || "").split(",").map((s) => s.trim()).filter(Boolean));
  const seen = new Set();
  for (const source of config.sources) {
    for (const p of validateSource(source, licensesDir)) problems.push(`${source.id || "?"}: ${p}`);
    if (!/^[a-z0-9.]+$/.test(source.edition_id || "")) problems.push(`${source.id}: edition_id is required`);
    if (!Number.isFinite(source.priority)) problems.push(`${source.id}: priority must be a number`);
    if (seen.has(source.id)) problems.push(`${source.id}: duplicate id`);
    seen.add(source.id);
  }
  if (problems.length) throw new Error(`Remote sources are invalid:\n${problems.join("\n")}`);
  const off = env.QURAN_REMOTE_TAFSIR === "false";
  return {
    provider: config.provider,
    enabled: off ? [] : config.sources.filter((s) => !disabledIds.has(s.id)),
  };
}

const metaOf = (s) => ({
  id: s.id,
  kind: s.kind,
  name_ar: s.name_ar,
  author_ar: s.author_ar || null,
  attribution_text: s.attribution_text,
  license: s.license,
  provenance: s.provenance,
  priority: s.priority,
});

/** A provider with no sources: used in tests and when the feature is switched off. */
function noRemoteTafsir() {
  return { enabled: false, async forAyah() { return { items: [], warnings: [], kinds: [] }; }, sources: () => [], version: "none" };
}

function createRemoteTafsir({ config, fetchImpl = fetch, timeoutMs = 8000, cacheSize = 600, breakerFailures = 3, breakerPauseMs = 60000, now = () => Date.now() } = {}) {
  const sources = config.enabled;
  if (sources.length === 0) return noRemoteTafsir();
  const byEdition = new Map(sources.map((s) => [s.edition_id, s]));
  const cache = new Map(); // key -> text (insertion order = LRU order)
  const inflight = new Map(); // key -> Promise<Map<edition, text>>
  let failures = 0;
  let pausedUntil = 0;

  const remember = (key, text) => {
    cache.delete(key);
    cache.set(key, text);
    if (cache.size > cacheSize) cache.delete(cache.keys().next().value);
  };

  async function fetchEditions(surah, ayah, editions) {
    const url = `${config.provider.base_url}/ayah/${surah}:${ayah}/editions/${editions.join(",")}`;
    const res = await fetchImpl(url, { headers: { Accept: "application/json", "User-Agent": "e3rbly-backend (+https://github.com/E3RBLY)" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { code: "REMOTE_UNAVAILABLE" });
    const body = await res.json();
    if (!body || !Array.isArray(body.data)) throw Object.assign(new Error("unexpected response shape"), { code: "REMOTE_BAD_RESPONSE" });
    const out = new Map();
    for (const entry of body.data) {
      const id = entry && entry.edition && entry.edition.identifier;
      const okText = entry && typeof entry.text === "string" && entry.text.trim().length > 0 && entry.text.length <= MAX_TEXT;
      const okRef = entry && entry.numberInSurah === ayah && entry.surah && entry.surah.number === surah;
      if (editions.includes(id) && okText && okRef) out.set(id, entry.text);
    }
    return out;
  }

  /** Cached texts plus one upstream call for whatever is missing. Never throws. */
  async function resolve(surah, ayah, wanted) {
    const texts = new Map();
    const missing = [];
    for (const s of wanted) {
      const key = `${surah}:${ayah}:${s.edition_id}`;
      if (cache.has(key)) {
        const text = cache.get(key);
        remember(key, text);
        texts.set(s.edition_id, text);
      } else missing.push(s.edition_id);
    }
    if (missing.length === 0) return { texts, failed: [] };
    if (now() < pausedUntil) return { texts, failed: missing, code: "REMOTE_UNAVAILABLE" };

    const flightKey = `${surah}:${ayah}:${[...missing].sort().join(",")}`;
    let flight = inflight.get(flightKey);
    if (!flight) {
      flight = fetchEditions(surah, ayah, missing).finally(() => inflight.delete(flightKey));
      inflight.set(flightKey, flight);
    }
    try {
      const got = await flight;
      failures = 0;
      for (const [id, text] of got) {
        remember(`${surah}:${ayah}:${id}`, text);
        texts.set(id, text);
      }
      const failed = missing.filter((id) => !got.has(id));
      return { texts, failed, code: failed.length ? "REMOTE_BAD_RESPONSE" : undefined };
    } catch (err) {
      failures += 1;
      if (failures >= breakerFailures) pausedUntil = now() + breakerPauseMs;
      return { texts, failed: missing, code: err.code || "REMOTE_UNAVAILABLE" };
    }
  }

  return {
    enabled: true,
    version: sources.map((s) => s.id).join("|"),
    sources: () => sources.map((s) => ({ ...metaOf(s), coverage: { ayat: AYAH_COUNTS.reduce((a, b) => a + b, 0) }, remote: true })),
    /** Items for one ayah (optionally one kind), ordered by priority, plus warnings for what could not be loaded. */
    async forAyah(surah, ayah, kind) {
      const wanted = sources.filter((s) => !kind || s.kind === kind);
      if (wanted.length === 0) return { items: [], warnings: [], kinds: [] };
      const { texts, failed, code } = await resolve(surah, ayah, wanted);
      const items = wanted
        .filter((s) => texts.has(s.edition_id))
        .map((s) => ({ id: `${s.id}:${surah}:${ayah}:0`, kind: s.kind, source: metaOf(s), label: null, body_ar: texts.get(s.edition_id), review_status: "unreviewed" }));
      const warnings = failed.length ? [{ code, sources: failed.map((id) => byEdition.get(id).id) }] : [];
      return { items, warnings, kinds: [...new Set(items.map((i) => i.kind))].filter((k) => KINDS.includes(k)) };
    },
  };
}

/** Production default. Tests (NODE_ENV=test) never touch the network unless they inject a fake. */
function defaultRemoteTafsir() {
  if (process.env.NODE_ENV === "test") return noRemoteTafsir();
  return createRemoteTafsir({ config: loadRemoteSources() });
}

module.exports = { loadRemoteSources, createRemoteTafsir, noRemoteTafsir, defaultRemoteTafsir, DEFAULT_FILE };
