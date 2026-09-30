const express = require("express");
const { z } = require("zod");
const { ApiError, envelope } = require("./http");
const { sha256, splitBasmala } = require("./pack");
const { KINDS, loadAnnotations } = require("./annotations");
const { defaultRemoteTafsir } = require("./remoteSources");

const positiveInt = z.coerce.number().int().min(1);
const surahParam = positiveInt.max(114);
const listQuery = z.object({ from: positiveInt.optional(), to: positiveInt.optional() }).strict();

function parse(schema, value, field = "") {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: [field, ...i.path].filter(Boolean).join("."), message: i.message }));
    throw new ApiError(400, "VALIDATION_ERROR", "Invalid request parameters.", details);
  }
  return result.data;
}

/** Read-only /v1/quran routes over an already verified pack. */
function createQuranRouter(pack, annotations = loadAnnotations(), remote = defaultRemoteTafsir()) {
  const router = express.Router();
  const { source } = pack;
  const sourceRef = { id: source.id, name_ar: source.name_ar, name_en: source.name_en, url: source.url, license: source.license, license_url: source.license_url };
  const packSha = pack.checksums.file_sha256;

  // The pack is immutable per deploy: same URL + same pack = same bytes, so a strong ETag is safe.
  router.use((req, res, next) => {
    res.set("Cache-Control", "public, max-age=3600");
    res.set("ETag", `"${sha256(`${packSha}${annotations.version}${remote.version}${req.originalUrl}`).slice(0, 32)}"`);
    next();
  });

  const canonicalBasmala = pack.surahs[0][0];
  const ayah = (surah, n) => {
    const text = pack.surahs[surah - 1][n - 1];
    const split = n === 1 ? splitBasmala(surah, text, canonicalBasmala) : { basmala: null, ayah: text };
    return { surah, ayah: n, text, text_ayah: split.ayah, basmala_prefixed: split.basmala !== null };
  };

  router.get("/source", (req, res) => {
    res.json({
      source: { ...sourceRef, variant: source.variant, variant_notes: source.variant_notes, version: source.version, retrieved_at: source.retrieved_at },
      provenance: source.provenance,
      review_status: source.review_status,
      surah_count: pack.surahs.length,
      ayah_count: pack.surahs.reduce((n, s) => n + s.length, 0),
      pack_sha256: packSha,
      notice: pack.notice,
    });
  });

  router.get("/surahs", (req, res) => {
    res.json({
      source: sourceRef,
      surahs: pack.surahs.map((ayat, i) => ({ number: i + 1, ayah_count: ayat.length, sha256: pack.checksums.surahs[i] })),
    });
  });

  router.get("/surahs/:n/ayat", (req, res) => {
    const surah = parse(surahParam, req.params.n, "n");
    const { from = 1, to } = parse(listQuery, req.query);
    const total = pack.surahs[surah - 1].length;
    const last = to ?? total;
    if (from > total || last > total) throw new ApiError(404, "NOT_FOUND", `Surah ${surah} has ${total} ayat.`);
    if (from > last) throw new ApiError(400, "VALIDATION_ERROR", "`from` must not exceed `to`.");
    const ayat = [];
    for (let n = from; n <= last; n += 1) ayat.push(ayah(surah, n));
    res.json({ source: sourceRef, surah, from, to: last, total, ayat });
  });

  router.get("/ayat/:s/:a", (req, res) => {
    const surah = parse(surahParam, req.params.s, "s");
    const n = parse(positiveInt, req.params.a, "a");
    const total = pack.surahs[surah - 1].length;
    if (n > total) throw new ApiError(404, "NOT_FOUND", `Surah ${surah} has ${total} ayat.`);
    res.json({ source: sourceRef, ayah: ayah(surah, n) });
  });

  // Which annotation sources exist and how many ayat each covers (only served, i.e. reviewed, content).
  router.get("/annotation-sources", (req, res) => {
    const sources = [...annotations.sources(), ...remote.sources()].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    res.json({ sources, reviewed_only: !annotations.includeUnreviewed, remote_enabled: remote.enabled });
  });

  // Tafsir / i'rab / simple explanation for one ayah. Empty lists are a normal answer:
  // no content is invented when no licensed, reviewed source covers the ayah.
  router.get("/ayat/:s/:a/annotations", async (req, res) => {
    const surah = parse(surahParam, req.params.s, "s");
    const n = parse(positiveInt, req.params.a, "a");
    const { kind } = parse(z.object({ kind: z.enum(KINDS).optional() }).strict(), req.query);
    const total = pack.surahs[surah - 1].length;
    if (n > total) throw new ApiError(404, "NOT_FOUND", `Surah ${surah} has ${total} ayat.`);

    // Local packs (AI drafts, imported packs) and on-demand tafsir books, merged and ordered by priority.
    const fetched = await remote.forAyah(surah, n, kind);
    const items = [...annotations.forAyah(surah, n, kind), ...fetched.items].sort((a, b) => (a.source.priority ?? 500) - (b.source.priority ?? 500) || a.id.localeCompare(b.id));
    const kinds = KINDS.filter((k) => items.some((i) => i.kind === k));

    if (fetched.warnings.length) {
      // Partial answer: never let a CDN or browser keep it.
      res.set("Cache-Control", "no-store");
      res.removeHeader("ETag");
    } else {
      // The content depends on the upstream book text, so let Express tag the real body, and let the CDN keep it.
      res.set("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
      res.removeHeader("ETag");
    }
    res.json({
      source: sourceRef,
      ayah: ayah(surah, n),
      available_kinds: kinds,
      annotations: items,
      ...(fetched.warnings.length ? { warnings: fetched.warnings } : {}),
    });
  });

  router.use((req, res) => {
    res.status(404).json(envelope("NOT_FOUND", `Route ${req.method} ${req.originalUrl.split("?")[0]} not found.`));
  });

  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, next) => {
    if (err instanceof ApiError) return res.status(err.status).json(envelope(err.code, err.message, err.details));
    console.error("quran module error:", err.message);
    return res.status(500).json(envelope("INTERNAL_ERROR", "Something went wrong."));
  });

  return router;
}

module.exports = { createQuranRouter };
