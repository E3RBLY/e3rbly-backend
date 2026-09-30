/** A small valid raw pool; tests copy it and break one thing at a time. */
function rawPool(overrides = {}) {
  const labels = { a: "فاعل مرفوع وعلامة رفعه الضمة", b: "مفعول به منصوب وعلامة نصبه الفتحة", c: "مبتدأ مرفوع وعلامة رفعه الضمة", d: "مضاف إليه مجرور وعلامة جره الكسرة", e: "فعل ماض مبني على الفتح", f: "نعت مرفوع وعلامة رفعه الضمة" };
  const puzzle = (id) => ({
    id,
    sentence: "قرأ الطالب الدرس",
    targets: [
      { word: "قرأ", correct: "e", distractors: ["a", "b", "d"], explanation: "قرأ فعل ماض مبني على الفتح." },
      { word: "الطالب", correct: "a", distractors: ["b", "d", "e"], explanation: "الطالب هو من قام بالقراءة فهو فاعل." },
      { word: "الدرس", correct: "b", distractors: ["a", "c", "d"], explanation: "الدرس وقع عليه فعل القراءة فهو مفعول به." },
    ],
  });
  return { epoch: "2026-10-01", review_status: "unreviewed", labels, puzzles: [puzzle("t-001"), puzzle("t-002"), puzzle("t-003")], ...overrides };
}

module.exports = { rawPool };
