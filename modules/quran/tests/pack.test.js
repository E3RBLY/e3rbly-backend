const fs = require("fs");
const { AYAH_COUNTS, TOTAL_AYAT, TEXT_FILE, CHECKSUMS_FILE, parseTanzil, computeChecksums, verifyPack, loadPack } = require("../src/pack");

describe("Quran pack integrity (CI fails if any byte of the Quran text changes)", () => {
  const buffer = fs.readFileSync(TEXT_FILE);
  const pinned = JSON.parse(fs.readFileSync(CHECKSUMS_FILE, "utf8"));

  test("the pinned per-surah and whole-file checksums match the text file", () => {
    expect(computeChecksums(buffer)).toEqual(pinned);
  });

  test("known ayah counts are independent of the file: 114 surahs, 6,236 ayat", () => {
    expect(AYAH_COUNTS).toHaveLength(114);
    expect(AYAH_COUNTS.reduce((a, b) => a + b, 0)).toBe(TOTAL_AYAT);
    const { surahs } = parseTanzil(buffer);
    expect(surahs.map((s) => s.length)).toEqual(AYAH_COUNTS);
  });

  test("the text is stored raw: no BOM, no CR, valid UTF-8 round trip", () => {
    const raw = buffer.toString("utf8");
    expect(raw.charCodeAt(0)).not.toBe(0xfeff);
    expect(raw).not.toContain("\r");
    expect(Buffer.from(raw, "utf8").equals(buffer)).toBe(true);
  });

  test("no ayah is empty, padded, or contains control/zero-width characters", () => {
    const bad = [];
    parseTanzil(buffer).surahs.forEach((surah, i) => {
      surah.forEach((text, j) => {
        const ok = text.length > 0 && text === text.trim() && !/[\u0000-\u001f​-‏﻿]/.test(text);
        if (!ok) bad.push(`${i + 1}:${j + 1}`);
      });
    });
    expect(bad).toEqual([]);
  });

  test("a single changed character is detected (tamper test)", () => {
    const original = buffer.toString("utf8");
    const tampered = original.replace("َ", "ُ"); // fatha -> damma, first occurrence
    expect(tampered).not.toBe(original);
    const tamperedBuffer = Buffer.from(tampered, "utf8");
    expect(() => verifyPack(parseTanzil(tamperedBuffer), tamperedBuffer, pinned)).toThrow(/checksum mismatch/);
    expect(() => verifyPack(parseTanzil(buffer), buffer, pinned)).not.toThrow();
  });

  test("a missing ayah is rejected", () => {
    const lines = buffer.toString("utf8").split("\n");
    const idx = lines.findIndex((l) => l.startsWith("1|3|"));
    const broken = Buffer.from([...lines.slice(0, idx), ...lines.slice(idx + 1)].join("\n"), "utf8");
    expect(() => parseTanzil(broken)).toThrow(/gap or disorder/);
  });

  test("the license notice travels with the data and names Tanzil", () => {
    const pack = loadPack();
    expect(pack.notice).toMatch(/Tanzil Project/);
    expect(pack.notice).toMatch(/CHANGING IT IS NOT ALLOWED/);
    expect(pack.source).toMatchObject({ id: "tanzil-uthmani", provenance: "imported", url: "https://tanzil.net" });
  });

  test("surah sizes for well-known surahs", () => {
    const { surahs } = loadPack();
    expect(surahs[0]).toHaveLength(7);
    expect(surahs[1]).toHaveLength(286);
    expect(surahs[111]).toHaveLength(4);
    expect(surahs[113]).toHaveLength(6);
  });
});

describe("Tanzil data quirks (documented, never silently corrected)", () => {
  test("surahs 95 and 97 spell the basmala with an extra shadda on the ba; all others match 1:1", () => {
    const { surahs } = loadPack();
    const canonical = surahs[0][0];
    const differing = [];
    surahs.forEach((s, i) => {
      const n = i + 1;
      if (n === 1 || n === 9) return;
      if (!s[0].startsWith(`${canonical} `)) differing.push(n);
    });
    expect(differing).toEqual([95, 97]);
  });
});
