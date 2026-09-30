const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadAnnotations } = require("../src/annotations");
const { stripHarakat, buildAyahPrompt, validateGenerated, ensureSources, existingKinds, storeGenerated, DRAFT_SOURCES } = require("../src/annotationGenerator");

const good = {
  simple: "معنى الآية بلغة سهلة يفهمها الجميع بإذن الله.",
  tafsir: "ملخص لمعنى الآية وألفاظها الأساسية بلغة واضحة.",
  i3rab: [{ label: "", body: "مبتدأ مرفوع وعلامة رفعه الضمة الظاهرة على آخره." }],
};

function tempDirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "quran-gen-"));
  const licenses = path.join(root, "licenses");
  fs.mkdirSync(licenses);
  fs.writeFileSync(path.join(licenses, "ai-generated-drafts.md"), "test");
  return { dir: path.join(root, "annotations"), licenses };
}

describe("prompt", () => {
  test("names the ayah, forbids citing books/scholars, and forbids changing the ayah", () => {
    const p = buildAyahPrompt(112, 1, "قُلْ هُوَ ٱللَّهُ أَحَدٌ");
    expect(p).toContain("surah 112, ayah 1");
    expect(p).toContain("قُلْ هُوَ ٱللَّهُ أَحَدٌ");
    expect(p).toMatch(/Do NOT quote or cite any book, scholar/);
    expect(p).toMatch(/Never change, correct or re-quote the ayah text/);
  });

  test("sends no third-party tafsir or i'rab text (only the ayah and instructions)", () => {
    const p = buildAyahPrompt(1, 2, "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ");
    expect(p.split("\n").filter((l) => /قال (ابن|الطبري|القرطبي)/.test(l))).toHaveLength(1); // only the "do not write" instruction
  });
});

describe("validateGenerated", () => {
  test("accepts a well-formed draft", () => expect(validateGenerated(good)).toBeNull());

  test.each([
    ["not an object", null, /not an object/],
    ["empty simple", { ...good, simple: "" }, /simple/],
    ["English simple", { ...good, simple: "This is an English explanation of the ayah." }, /not Arabic/],
    ["oversized tafsir", { ...good, tafsir: "ا".repeat(3000) }, /tafsir/],
    ["no i3rab", { ...good, i3rab: [] }, /i3rab must have/],
    ["too many wujuh", { ...good, i3rab: Array(7).fill({ label: "و", body: good.i3rab[0].body }) }, /i3rab must have/],
    ["several wujuh without labels", { ...good, i3rab: [good.i3rab[0], good.i3rab[0]] }, /needs a label/],
  ])("rejects %s", (_n, json, expected) => expect(validateGenerated(json)).toMatch(expected));
});

describe("storing drafts", () => {
  test("writes all three kinds as ai_draft + unreviewed, and the packs then pass validation", () => {
    const { dir, licenses } = tempDirs();
    ensureSources({ dir });
    expect(storeGenerated(112, 1, good, { dir }).sort()).toEqual(["i3rab", "simple", "tafsir"]);
    const store = loadAnnotations({ dir, licensesDir: licenses, includeUnreviewed: true });
    const items = store.forAyah(112, 1);
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.review_status === "unreviewed" && i.source.provenance === "ai_draft")).toBe(true);
  });

  test("unreviewed drafts are NOT served unless the operator opts in", () => {
    const { dir, licenses } = tempDirs();
    ensureSources({ dir });
    storeGenerated(112, 1, good, { dir });
    expect(loadAnnotations({ dir, licensesDir: licenses, includeUnreviewed: false }).forAyah(112, 1)).toEqual([]);
  });

  test("never overwrites existing text (drafted, imported or reviewed)", () => {
    const { dir } = tempDirs();
    ensureSources({ dir });
    const file = path.join(dir, "ai-simple", "surah-112.json");
    fs.writeFileSync(file, JSON.stringify({ "112:1": [{ body_ar: "نص راجعه مختص", review_status: "reviewed" }] }));
    expect(storeGenerated(112, 1, good, { dir }).sort()).toEqual(["i3rab", "tafsir"]);
    expect(JSON.parse(fs.readFileSync(file, "utf8"))["112:1"][0].body_ar).toBe("نص راجعه مختص");
  });

  test("resumable: existingKinds reports what is already there", () => {
    const { dir } = tempDirs();
    ensureSources({ dir });
    expect(existingKinds(112, 1, dir)).toEqual([]);
    storeGenerated(112, 1, good, { dir });
    expect(existingKinds(112, 1, dir).sort()).toEqual(["i3rab", "simple", "tafsir"]);
    expect(existingKinds(112, 2, dir)).toEqual([]);
  });

  test("keeps ayat in numeric order in the file", () => {
    const { dir } = tempDirs();
    ensureSources({ dir });
    storeGenerated(112, 4, good, { dir });
    storeGenerated(112, 2, good, { dir });
    expect(Object.keys(JSON.parse(fs.readFileSync(path.join(dir, "ai-simple", "surah-112.json"), "utf8")))).toEqual(["112:2", "112:4"]);
  });

  test("generated text is stored without harakat (the model's vowel slips never reach users)", () => {
    const { dir } = tempDirs();
    ensureSources({ dir });
    storeGenerated(112, 1, { ...good, simple: "يَدَبِّرُ اللَّهُ أُمُورَ خَلْقِهِ بِحِكْمَةٍ وَرَحْمَةٍ." }, { dir });
    const stored = JSON.parse(fs.readFileSync(path.join(dir, "ai-simple", "surah-112.json"), "utf8"))["112:1"][0].body_ar;
    expect(stored).toBe("يدبر الله أمور خلقه بحكمة ورحمة.");
    expect(stripHarakat("مَلِكِ النَّاسِ")).toBe("ملك الناس");
  });

  test("rejects invalid model output and writes nothing", () => {
    const { dir } = tempDirs();
    ensureSources({ dir });
    expect(() => storeGenerated(112, 1, { ...good, simple: "" }, { dir })).toThrow(/rejected/);
    expect(existingKinds(112, 1, dir)).toEqual([]);
  });

  test("shipped drafts: Al-Fatiha and Al-Ikhlas have all three kinds for every ayah, all unreviewed and unattributed", () => {
    const store = loadAnnotations({ includeUnreviewed: true });
    for (const [surah, count] of [[1, 7], [112, 4]]) {
      for (let n = 1; n <= count; n += 1) {
        expect(store.availableKinds(surah, n).sort()).toEqual(["i3rab", "simple", "tafsir"]);
        for (const item of store.forAyah(surah, n)) {
          expect(item.review_status).toBe("unreviewed");
          expect(item.source.provenance).toBe("ai_draft");
          // Never attributed to a scholar or book.
          expect(item.body_ar).not.toMatch(/قال (ابن|الإمام|الطبري|القرطبي|السعدي)|رواه|أخرجه/);
        }
      }
    }
  });

  test("the three source ids match the packs shipped in the repo", () => {
    for (const s of DRAFT_SOURCES) expect(fs.existsSync(path.join(__dirname, "..", "data", "annotations", s.id, "source.json"))).toBe(true);
  });
});

describe("restoreHamza (repairs the model's dropped hamza without touching anything else)", () => {
  const { restoreHamza } = require("../src/annotationGenerator");
  const ayah = "وَرَأَيْتَ ٱلنَّاسَ يَدْخُلُونَ فِى دِينِ ٱللَّهِ أَفْوَاجًا";

  test("words quoted from the ayah get the ayah's own spelling (with or without the attached و)", () => {
    expect(restoreHamza("«رايت» و«ورايت» و«افواجا» و«الناس»", ayah)).toBe("«رأيت» و«ورأيت» و«أفواجا» و«الناس»");
  });

  test("a quoted phrase is repaired word by word; unknown words are left as written", () => {
    expect(restoreHamza("«دين الله» و«كلمة اخرى»", ayah)).toBe("«دين الله» و«كلمة اخرى»");
  });

  test("common grammar terms get their hamza back", () => {
    expect(restoreHamza("مضاف اليه، وعلامة الاعراب، على اخره، لانه من الافعال الخمسة، تقديره انت", "")).toBe(
      "مضاف إليه، وعلامة الإعراب، على آخره، لأنه من الأفعال الخمسة، تقديره أنت",
    );
  });

  test("whole words only: it never edits inside a longer word", () => {
    const safe = "رجالا وظلالا الا ان ولاكن اخرون واليهم";
    expect(restoreHamza(safe, ayah)).toBe(safe);
  });

  test("idempotent: repairing twice equals repairing once", () => {
    const once = restoreHamza("«رايت» على اخره مضاف اليه", ayah);
    expect(restoreHamza(once, ayah)).toBe(once);
  });

  test("storeGenerated applies it: what is written to disk has the hamza", () => {
    const { dir } = tempDirs();
    ensureSources({ dir });
    storeGenerated(110, 2, { i3rab: [{ label: "", body: "«رايت» فعل ماض مبني على السكون، والجملة معطوفة على ما قبلها لا محل لها من الاعراب وعلامة اخره" }] }, { dir, only: "i3rab", ayahText: ayah, wordCount: 1 });
    const stored = JSON.parse(fs.readFileSync(path.join(dir, "ai-irab", "surah-110.json"), "utf8"))["110:2"][0].body_ar;
    expect(stored).toContain("«رأيت»");
    expect(stored).toContain("الإعراب");
    expect(stored).toContain("آخره");
  });
});

describe("model tier (lite models slip more, and the app says so)", () => {
  const { tierOf } = require("../src/annotationGenerator");

  test("tierOf", () => {
    expect(tierOf("gemini-3.5-flash-lite")).toBe("lite");
    expect(tierOf("gemini-flash-lite-latest")).toBe("lite");
    expect(tierOf("gemini-3.8-flash")).toBe("standard");
    expect(tierOf(undefined)).toBe("standard");
  });

  test("new items carry the tier, and the API serves it", () => {
    const { dir, licenses } = tempDirs();
    ensureSources({ dir });
    storeGenerated(112, 1, good, { dir, only: "i3rab", model: "gemini-3.5-flash-lite" });
    const stored = JSON.parse(fs.readFileSync(path.join(dir, "ai-irab", "surah-112.json"), "utf8"))["112:1"][0];
    expect(stored.model_tier).toBe("lite");
    const item = loadAnnotations({ dir, licensesDir: licenses, includeUnreviewed: true }).forAyah(112, 1)[0];
    expect(item.model_tier).toBe("lite");
  });

  test("an unknown tier value is rejected by the pack validator", () => {
    const { dir, licenses } = tempDirs();
    ensureSources({ dir });
    fs.writeFileSync(path.join(dir, "ai-irab", "surah-112.json"), JSON.stringify({ "112:1": [{ body_ar: "نص طويل بما يكفي للتحقق", review_status: "unreviewed", model_tier: "ultra" }] }));
    expect(() => loadAnnotations({ dir, licensesDir: licenses, includeUnreviewed: true })).toThrow(/model_tier must be one of/);
  });
});
