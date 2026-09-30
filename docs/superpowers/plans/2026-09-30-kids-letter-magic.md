# Kids' Letter Magic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A children's area where a child learns the 28 Arabic letters by tracing and then drawing them with a finger (Naskh or Ruq'ah, one style per path), sees each letter turn into a picture, and gets a gentle automatic correction for letters and short words.

**Architecture:** New feature `lib/features/kids_letters` (domain / data / presentation) in the style of `lib/features/quran` and `lib/features/daily`. All decision logic is pure Dart and unit tested: `StrokeChecker` (tracing), `WordCorrector` (recognition feedback), `LeitnerScheduler` (which letters come back). Handwriting recognition sits behind an `InkRecognizer` interface (ML Kit on-device implementation, a fake for tests). Letter shapes are data (`assets/kids/letters.json`), validated by tests and reviewed visually in a debug gallery. Progress is local-only; drawings are never stored or sent.

**Tech Stack:** Flutter, flutter_bloc + equatable, get_it, shared_preferences (existing); new: `google_mlkit_digital_ink_recognition`, `flutter_tts`.

**Spec:** `docs/superpowers/specs/2026-09-30-kids-letters-and-daily-irab-design.md` (Part A). Repo for this plan: `H:\Projects\e3rbly\e3rbly-mobile`. Plan 2 (daily game) is independent; this plan does not depend on it.

## Global Constraints

- Ages 3-9. The kids' area has **no ads, no external links, no sign-in requirement, no analytics events containing anything a child drew**. Drawings are never saved or sent.
- Arabic UI, RTL, large touch targets (at least 64 dp for child-facing buttons, 48 dp for grown-up settings), no overflow at 320x568 and 1.5x text scale on the matrix `Size(320,568) (360,640) (412,915) (844,390) (768,1024) (1280,800)`.
- No failure screens: a wrong attempt shows the ghost-hand demonstration and a friendly message; stars are earned per attempt.
- One handwriting style per learning path (`naskh` or `ruqah`), chosen inside a grown-up gate; each style keeps its own progress.
- Recognition runs on the device (ML Kit). Tracing works without the recognition model; recall and words unlock when the model is downloaded.
- Letter guide shapes ship flagged **unreviewed** (Ruq'ah especially) until a calligrapher signs off; the debug gallery shows the flag.
- Analyzer at baseline (0 errors, no growth of the 193 existing issues); all existing tests pass (506 at last run; the daily plan adds more).
- Nothing is pushed to `main` and no APK is published without the owner's go. Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A stroke that is a single tap, an empty submission, or a scribble of hundreds of points must never crash or pass (Task 1).
- A dot drawn in the wrong place (ب dot below vs ت dots above vs ث) must be reported as a dot problem, not silently accepted (Task 1).
- A reversed stroke traces the same path but must be reported as wrong direction (Task 1).
- Recognizer returns no candidates, the model is not downloaded, or the plugin throws: the lesson continues with a friendly message and the child is never blocked (Tasks 5, 7).
- Recognizer output with harakat, tatweel or alef/hamza variants must compare fairly to the target word (Task 2).
- Drawing data must not reach storage: a test asserts the progress store only ever receives mastery data (Task 7).
- The kids' area must not call the ads service: a test registers a spy `AdService` and asserts zero calls while the kids screens are shown (Task 8).
- Screen rotation or a different screen size mid-drawing must not distort strokes: points are normalised to the canvas at capture time (Task 6).

---

## File structure

| File | Responsibility |
|---|---|
| `domain/geometry.dart` | `InkPoint`, resample, path length, point-to-polyline distance |
| `domain/letter_guide.dart` | `LetterGuide` (strokes + dots) |
| `domain/stroke_checker.dart` | `StrokeChecker`, `TraceResult`, `TraceIssue` |
| `domain/arabic_text.dart` | normalisation for comparison |
| `domain/word_corrector.dart` | `WordCorrector`, `WordFeedback` |
| `domain/leitner.dart` | `LetterProgress`, `LeitnerScheduler` |
| `domain/letter.dart`, `data/letter_catalog.dart` | letter model + JSON catalog loader/validator |
| `assets/kids/letters.json` | letter data for both styles |
| `data/progress_store.dart` | mastery per style via `LocalStorage` |
| `recognition/ink_recognizer.dart`, `recognition/mlkit_ink_recognizer.dart` | interface + ML Kit implementation |
| `presentation/cubit/kids_lesson_cubit.dart`, `kids_lesson_state.dart` | flow |
| `presentation/widgets/{drawing_pad,ghost_hand,letter_morph,guide_painter}.dart` | drawing UI |
| `presentation/pages/{kids_home_page,lesson_page,letter_gallery_page,grown_up_gate}.dart` | screens |
| `kids_injection.dart` | get_it |
| `test/features/kids_letters/**` | tests |

All paths above are under `lib/features/kids_letters/` unless they start with `assets/` or `test/`.

---

### Task 1: Geometry, `LetterGuide` and `StrokeChecker` (pure Dart)

**Files:**
- Create: `lib/features/kids_letters/domain/geometry.dart`, `letter_guide.dart`, `stroke_checker.dart`, `test/features/kids_letters/stroke_checker_test.dart`

**Interfaces:**
- Produces:
  `class InkPoint { const InkPoint(this.x, this.y); final double x, y; }` (canvas-normalised, 0..1, y down)
  `typedef InkStroke = List<InkPoint>;`
  `List<InkPoint> resample(List<InkPoint> points, int count)`; `double pathLength(List<InkPoint>)`; `double distanceToPolyline(InkPoint p, List<InkPoint> line)`.
  `class LetterGuide { const LetterGuide({required this.strokes, this.dots = const []}); final List<InkStroke> strokes; final List<InkPoint> dots; }`
  `enum TraceIssue { missingStroke, extraStroke, wrongOrder, wrongDirection, offPath, incomplete, missingDot, extraDot, dotOffPlace }`
  `class TraceResult { final double score; final bool passed; final List<TraceIssue> issues; final int? strokeIndex; }`
  `class StrokeChecker { const StrokeChecker({this.tolerance = 0.10, this.passScore = 0.75}); TraceResult check(LetterGuide guide, List<InkStroke> drawn); }`
  Tolerance is the allowed distance in canvas units: use `0.12` for ages 3-5 and `0.08` for 6-9 (chosen by the caller).
- A drawn stroke shorter than `0.04` of path length is a **tap** (a dot candidate); longer ones are strokes.

- [ ] **Step 1: Write the failing tests**

```dart
import 'package:e3rbly/features/kids_letters/domain/geometry.dart';
import 'package:e3rbly/features/kids_letters/domain/letter_guide.dart';
import 'package:e3rbly/features/kids_letters/domain/stroke_checker.dart';
import 'package:flutter_test/flutter_test.dart';

InkStroke line(double x1, double y1, double x2, double y2, {int n = 20, double jitter = 0}) => [
  for (var i = 0; i <= n; i++)
    InkPoint(x1 + (x2 - x1) * i / n + (i.isEven ? jitter : -jitter), y1 + (y2 - y1) * i / n + (i.isEven ? -jitter : jitter)),
];

// alif: one vertical stroke, top to bottom
final alif = LetterGuide(strokes: [line(0.5, 0.2, 0.5, 0.8)]);
// baa (simplified): one body stroke right to left plus one dot below
final baa = LetterGuide(strokes: [line(0.85, 0.5, 0.15, 0.5)], dots: const [InkPoint(0.5, 0.75)]);
// taa: same body, two dots above
final taa = LetterGuide(strokes: [line(0.85, 0.5, 0.15, 0.5)], dots: const [InkPoint(0.4, 0.25), InkPoint(0.6, 0.25)]);

const checker = StrokeChecker();
InkStroke tap(double x, double y) => [InkPoint(x, y), InkPoint(x + 0.005, y)];

void main() {
  group('geometry', () {
    test('resample returns exactly n evenly spaced points', () {
      final r = resample(line(0, 0, 1, 0, n: 3), 11);
      expect(r, hasLength(11));
      expect(r[5].x, closeTo(0.5, 1e-9));
    });
    test('resample handles empty, single point and zero-length input', () {
      expect(resample(const [], 8), isEmpty);
      expect(resample(const [InkPoint(0.3, 0.3)], 8), hasLength(8));
      expect(resample(const [InkPoint(0.3, 0.3), InkPoint(0.3, 0.3)], 8), everyElement(isA<InkPoint>()));
    });
    test('distanceToPolyline', () {
      expect(distanceToPolyline(const InkPoint(0.5, 0.3), line(0, 0, 1, 0)), closeTo(0.3, 1e-9));
      expect(distanceToPolyline(const InkPoint(2, 0), line(0, 0, 1, 0)), closeTo(1, 1e-9));
    });
    test('pathLength', () => expect(pathLength(line(0, 0, 3, 4)), closeTo(5, 1e-9)));
  });

  group('tracing one stroke (alif)', () {
    test('an accurate stroke with small wobble passes with a high score', () {
      final r = checker.check(alif, [line(0.5, 0.2, 0.5, 0.8, jitter: 0.02)]);
      expect(r.passed, isTrue);
      expect(r.issues, isEmpty);
      expect(r.score, greaterThan(0.9));
    });
    test('a reversed stroke traces the same path but is reported as wrong direction', () {
      final r = checker.check(alif, [line(0.5, 0.8, 0.5, 0.2)]);
      expect(r.passed, isFalse);
      expect(r.issues, contains(TraceIssue.wrongDirection));
    });
    test('a stroke drawn far from the guide is off path', () {
      final r = checker.check(alif, [line(0.9, 0.2, 0.9, 0.8)]);
      expect(r.passed, isFalse);
      expect(r.issues, contains(TraceIssue.offPath));
    });
    test('a stroke that covers only half the guide is incomplete', () {
      final r = checker.check(alif, [line(0.5, 0.2, 0.5, 0.5)]);
      expect(r.passed, isFalse);
      expect(r.issues, contains(TraceIssue.incomplete));
    });
    test('nothing drawn, only taps, or an empty stroke list is missingStroke and never passes', () {
      expect(checker.check(alif, const []).issues, contains(TraceIssue.missingStroke));
      expect(checker.check(alif, [tap(0.5, 0.5)]).passed, isFalse);
      expect(checker.check(alif, [const []]).passed, isFalse);
      expect(checker.check(alif, const []).score, 0);
    });
    test('an extra long stroke is reported and fails', () {
      final r = checker.check(alif, [line(0.5, 0.2, 0.5, 0.8), line(0.1, 0.1, 0.9, 0.1)]);
      expect(r.passed, isFalse);
      expect(r.issues, contains(TraceIssue.extraStroke));
    });
    test('a scribble of hundreds of points does not crash and does not pass', () {
      final scribble = [for (var i = 0; i < 800; i++) InkPoint((i * 37 % 100) / 100, (i * 53 % 100) / 100)];
      final r = checker.check(alif, [scribble]);
      expect(r.passed, isFalse);
    });
    test('the age tolerance matters: a 0.11 offset passes at 0.12 but not at 0.08', () {
      final off = [line(0.61, 0.2, 0.61, 0.8)];
      expect(const StrokeChecker(tolerance: 0.12).check(alif, off).passed, isTrue);
      expect(const StrokeChecker(tolerance: 0.08).check(alif, off).passed, isFalse);
    });
  });

  group('dots decide the letter (baa / taa)', () {
    final body = line(0.85, 0.5, 0.15, 0.5, jitter: 0.01);
    test('baa with its dot below passes', () {
      expect(checker.check(baa, [body, tap(0.5, 0.75)]).passed, isTrue);
    });
    test('baa without the dot reports missingDot', () {
      final r = checker.check(baa, [body]);
      expect(r.passed, isFalse);
      expect(r.issues, contains(TraceIssue.missingDot));
    });
    test('the dot above the body instead of below reports dotOffPlace (that would be a different letter)', () {
      final r = checker.check(baa, [body, tap(0.5, 0.25)]);
      expect(r.passed, isFalse);
      expect(r.issues, contains(TraceIssue.dotOffPlace));
    });
    test('taa needs both dots; one dot is missingDot; three dots is extraDot', () {
      expect(checker.check(taa, [body, tap(0.4, 0.25), tap(0.6, 0.25)]).passed, isTrue);
      expect(checker.check(taa, [body, tap(0.4, 0.25)]).issues, contains(TraceIssue.missingDot));
      expect(checker.check(taa, [body, tap(0.4, 0.25), tap(0.6, 0.25), tap(0.5, 0.2)]).issues, contains(TraceIssue.extraDot));
    });
    test('dots may be drawn before or after the body (order of dots vs strokes is not enforced)', () {
      expect(checker.check(baa, [tap(0.5, 0.75), body]).passed, isTrue);
    });
  });

  group('stroke order in a multi-stroke letter', () {
    final two = LetterGuide(strokes: [line(0.2, 0.2, 0.2, 0.8), line(0.2, 0.8, 0.8, 0.8)]);
    test('correct order passes', () {
      expect(checker.check(two, [line(0.2, 0.2, 0.2, 0.8), line(0.2, 0.8, 0.8, 0.8)]).passed, isTrue);
    });
    test('swapped order reports wrongOrder', () {
      final r = checker.check(two, [line(0.2, 0.8, 0.8, 0.8), line(0.2, 0.2, 0.2, 0.8)]);
      expect(r.passed, isFalse);
      expect(r.issues, contains(TraceIssue.wrongOrder));
    });
    test('one stroke of two is missingStroke', () {
      expect(checker.check(two, [line(0.2, 0.2, 0.2, 0.8)]).issues, contains(TraceIssue.missingStroke));
    });
  });
}
```

- [ ] **Step 2: Run to verify failure**

Run: `flutter test test/features/kids_letters/stroke_checker_test.dart`
Expected: FAIL, missing imports.

- [ ] **Step 3: Implement**

`geometry.dart`:

```dart
import 'dart:math';

class InkPoint {
  const InkPoint(this.x, this.y);
  final double x;
  final double y;
}

typedef InkStroke = List<InkPoint>;

double _dist(InkPoint a, InkPoint b) => sqrt(pow(a.x - b.x, 2) + pow(a.y - b.y, 2));

double pathLength(List<InkPoint> points) {
  var total = 0.0;
  for (var i = 1; i < points.length; i++) {
    total += _dist(points[i - 1], points[i]);
  }
  return total;
}

/// `count` points spaced evenly along the path. Empty input gives empty output; a point or a zero-length path repeats.
List<InkPoint> resample(List<InkPoint> points, int count) {
  if (points.isEmpty || count <= 0) return const [];
  final total = pathLength(points);
  if (points.length == 1 || total == 0) return List.filled(count, points.first);
  final out = <InkPoint>[points.first];
  final step = total / (count - 1);
  var carried = 0.0;
  var prev = points.first;
  var i = 1;
  while (out.length < count - 1 && i < points.length) {
    final seg = _dist(prev, points[i]);
    if (carried + seg >= step) {
      final t = (step - carried) / seg;
      final p = InkPoint(prev.x + (points[i].x - prev.x) * t, prev.y + (points[i].y - prev.y) * t);
      out.add(p);
      prev = p;
      carried = 0;
    } else {
      carried += seg;
      prev = points[i];
      i++;
    }
  }
  while (out.length < count) {
    out.add(points.last);
  }
  return out;
}

double _pointToSegment(InkPoint p, InkPoint a, InkPoint b) {
  final dx = b.x - a.x, dy = b.y - a.y;
  final len2 = dx * dx + dy * dy;
  if (len2 == 0) return _dist(p, a);
  final t = (((p.x - a.x) * dx + (p.y - a.y) * dy) / len2).clamp(0.0, 1.0);
  return _dist(p, InkPoint(a.x + dx * t, a.y + dy * t));
}

double distanceToPolyline(InkPoint p, List<InkPoint> line) {
  if (line.isEmpty) return double.infinity;
  if (line.length == 1) return _dist(p, line.first);
  var best = double.infinity;
  for (var i = 1; i < line.length; i++) {
    best = min(best, _pointToSegment(p, line[i - 1], line[i]));
  }
  return best;
}
```

`letter_guide.dart`:

```dart
import 'geometry.dart';

/// Where a letter form is drawn: ordered strokes (each with a direction) and the dots that give it its identity.
class LetterGuide {
  const LetterGuide({required this.strokes, this.dots = const []});
  final List<InkStroke> strokes;
  final List<InkPoint> dots;
}
```

`stroke_checker.dart`:

```dart
import 'dart:math';

import 'geometry.dart';
import 'letter_guide.dart';

enum TraceIssue { missingStroke, extraStroke, wrongOrder, wrongDirection, offPath, incomplete, missingDot, extraDot, dotOffPlace }

class TraceResult {
  const TraceResult({required this.score, required this.passed, required this.issues, this.strokeIndex});
  final double score;
  final bool passed;
  final List<TraceIssue> issues;

  /// The first stroke that has a problem (for the ghost hand), or null.
  final int? strokeIndex;
}

class StrokeChecker {
  const StrokeChecker({this.tolerance = 0.10, this.passScore = 0.75});

  final double tolerance;
  final double passScore;

  static const double _tapLength = 0.04;
  static const int _samples = 32;

  TraceResult check(LetterGuide guide, List<InkStroke> drawn) {
    final strokes = <InkStroke>[];
    final taps = <InkPoint>[];
    for (final s in drawn) {
      if (s.isEmpty) continue;
      if (pathLength(s) < _tapLength) {
        taps.add(s.first);
      } else {
        strokes.add(s);
      }
    }

    final issues = <TraceIssue>{};
    int? problem;

    if (strokes.length < guide.strokes.length) issues.add(TraceIssue.missingStroke);
    if (strokes.length > guide.strokes.length) issues.add(TraceIssue.extraStroke);

    final pairs = min(strokes.length, guide.strokes.length);
    var total = 0.0;
    for (var i = 0; i < pairs; i++) {
      final own = _strokeScore(guide.strokes[i], strokes[i]);
      total += own.score;
      if (own.issues.isNotEmpty && problem == null) problem = i;
      issues.addAll(own.issues);
      if (own.score < 0.5 && strokes.length == guide.strokes.length) {
        for (var j = 0; j < pairs; j++) {
          if (j != i && _strokeScore(guide.strokes[j], strokes[i]).score >= passScore) {
            issues.add(TraceIssue.wrongOrder);
            problem ??= i;
          }
        }
      }
    }

    // Dots: each guide dot must be met by a tap within tolerance; unmatched taps are extra or misplaced.
    final free = [...taps];
    var matchedDots = 0;
    for (final dot in guide.dots) {
      final near = free.indexWhere((t) => sqrt(pow(t.x - dot.x, 2) + pow(t.y - dot.y, 2)) <= tolerance * 1.5);
      if (near >= 0) {
        matchedDots++;
        free.removeAt(near);
      }
    }
    if (matchedDots < guide.dots.length) {
      issues.add(free.isNotEmpty ? TraceIssue.dotOffPlace : TraceIssue.missingDot);
    } else if (free.isNotEmpty) {
      issues.add(TraceIssue.extraDot);
    }

    final parts = guide.strokes.length + guide.dots.length;
    var score = parts == 0 ? 0.0 : (total + matchedDots) / parts;
    final biggest = max(strokes.length, guide.strokes.length);
    if (biggest > 0 && strokes.length > guide.strokes.length) score *= guide.strokes.length / biggest;
    if (strokes.isEmpty && taps.isEmpty) score = 0;

    final passed = issues.isEmpty && score >= passScore;
    return TraceResult(score: score.clamp(0.0, 1.0), passed: passed, issues: issues.toList(), strokeIndex: problem);
  }

  ({double score, List<TraceIssue> issues}) _strokeScore(InkStroke guide, InkStroke drawn) {
    final g = resample(guide, _samples);
    final d = resample(drawn, _samples);
    double within(List<InkPoint> from, List<InkPoint> to) => from.where((p) => distanceToPolyline(p, to) <= tolerance).length / from.length;
    final coverage = within(g, d); // how much of the guide the child covered
    final precision = within(d, g); // how much of the child's stroke is on the guide
    var score = 0.5 * coverage + 0.5 * precision;
    final issues = <TraceIssue>[];
    if (precision < 0.6) issues.add(TraceIssue.offPath);
    if (coverage < 0.8 && precision >= 0.6) issues.add(TraceIssue.incomplete); // a half-length stroke still covers ~2/3 within tolerance

    final gv = InkPoint(g.last.x - g.first.x, g.last.y - g.first.y);
    final dv = InkPoint(d.last.x - d.first.x, d.last.y - d.first.y);
    if (pathLength(guide) > 0.05 && gv.x * dv.x + gv.y * dv.y < 0 && coverage >= 0.6 && precision >= 0.6) {
      issues.add(TraceIssue.wrongDirection);
      score *= 0.5;
    }
    return (score: score, issues: issues);
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `flutter test test/features/kids_letters/stroke_checker_test.dart`
Expected: all PASS. If a threshold-sensitive test fails (jitter, the 0.11 offset case, scribble), fix the algorithm or constants and keep the tests' intent; do not weaken the test inputs.

- [ ] **Step 5: Commit**

```bash
git add lib/features/kids_letters test/features/kids_letters
git commit -m "feat(kids): stroke checker with dots, direction and order (pure Dart)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Arabic normalisation and `WordCorrector`

**Files:**
- Create: `lib/features/kids_letters/domain/arabic_text.dart`, `word_corrector.dart`, `test/features/kids_letters/word_corrector_test.dart`

**Interfaces:**
- Produces:
  `String normalizeArabic(String s)`: removes harakat (U+064B-U+0652, U+0670), tatweel (U+0640), zero-width and bidi marks, spaces at the ends; maps أ إ آ ٱ to ا; ى to ي; **keeps** ة distinct from ه and keeps ء/ؤ/ئ.
  `enum LetterFault { wrongLetter, missingLetter, extraLetter }`
  `class LetterMismatch { final int index; final String? expected; final String? got; final LetterFault fault; }`
  `class WordFeedback { final bool correct; final String? best; final List<LetterMismatch> mismatches; String message(); }`: `message()` returns a gentle Arabic sentence ("رائع!" when correct; "كتبتَ ت والمطلوب ث" for a wrong letter; "ينقصنا حرف: ب" for missing; "زاد حرف: ت" for extra; if `best == null`: "لم أستطع القراءة، جرّب مرة أخرى").
  `class WordCorrector { const WordCorrector(); WordFeedback compare(String target, List<String> candidates); }`: picks the candidate with the smallest edit distance to the normalised target (ties: earliest); correct only when the normalised strings are equal; mismatches come from an alignment (substitution, insertion, deletion) of that best candidate.

- [ ] **Step 1: Write the failing tests**

```dart
import 'package:e3rbly/features/kids_letters/domain/arabic_text.dart';
import 'package:e3rbly/features/kids_letters/domain/word_corrector.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const corrector = WordCorrector();

  group('normalizeArabic', () {
    test('removes harakat, tatweel and bidi marks', () {
      expect(normalizeArabic('كَتَبَ'), 'كتب');
      expect(normalizeArabic('كـتـب'), 'كتب');
      expect(normalizeArabic('\u200Fكتب\u200E'), 'كتب');
    });
    test('unifies alef forms and ya, keeps taa marbuta distinct from haa', () {
      expect(normalizeArabic('أحمد'), normalizeArabic('احمد'));
      expect(normalizeArabic('إسلام'), 'اسلام');
      expect(normalizeArabic('على'), normalizeArabic('علي'));
      expect(normalizeArabic('مدرسة'), isNot(normalizeArabic('مدرسه')));
    });
    test('handles empty and whitespace', () {
      expect(normalizeArabic(''), '');
      expect(normalizeArabic('  بيت  '), 'بيت');
    });
  });

  group('WordCorrector.compare', () {
    test('an exact candidate is correct', () {
      final f = corrector.compare('بيت', ['بيت', 'ببت']);
      expect(f.correct, isTrue);
      expect(f.message(), contains('رائع'));
    });
    test('a lower-ranked candidate can still be the right one', () {
      expect(corrector.compare('بيت', ['ببت', 'بيت']).correct, isTrue);
    });
    test('recognizer adds harakat or alef variants: still correct', () {
      expect(corrector.compare('أسد', ['اَسَد']).correct, isTrue);
    });
    test('one wrong letter is named with the expected and written letters', () {
      final f = corrector.compare('ثوب', ['توب']);
      expect(f.correct, isFalse);
      expect(f.mismatches.single.fault, LetterFault.wrongLetter);
      expect(f.mismatches.single.expected, 'ث');
      expect(f.mismatches.single.got, 'ت');
      expect(f.message(), allOf(contains('ث'), contains('ت')));
    });
    test('missing and extra letters', () {
      final missing = corrector.compare('كتاب', ['كتب']);
      expect(missing.mismatches.single.fault, LetterFault.missingLetter);
      expect(missing.mismatches.single.expected, 'ا');
      final extra = corrector.compare('كتب', ['كتاب']);
      expect(extra.mismatches.single.fault, LetterFault.extraLetter);
      expect(extra.mismatches.single.got, 'ا');
    });
    test('no candidates, or only empty ones, gives a friendly retry message and never correct', () {
      for (final c in [<String>[], ['', '  ']]) {
        final f = corrector.compare('بيت', c);
        expect(f.correct, isFalse);
        expect(f.best, isNull);
        expect(f.message(), contains('مرة أخرى'));
      }
    });
    test('an empty target is never correct', () {
      expect(corrector.compare('', ['']).correct, isFalse);
    });
    test('picks the closest candidate when none is right', () {
      final f = corrector.compare('بيت', ['قمر', 'بنت']);
      expect(f.best, 'بنت');
      expect(f.mismatches, hasLength(1));
    });
  });
}
```

- [ ] **Step 2: Run to verify failure** — `flutter test test/features/kids_letters/word_corrector_test.dart` -> FAIL.

- [ ] **Step 3: Implement**

`arabic_text.dart`:

```dart
final RegExp _marks = RegExp('[\u064B-\u0652\u0670\u0640\u200B-\u200F\u202A-\u202E]');

/// Compare-friendly form: no harakat, tatweel or bidi marks; alef and ya variants unified. Taa marbuta stays.
String normalizeArabic(String input) {
  return input
      .replaceAll(_marks, '')
      .replaceAll(RegExp('[أإآٱ]'), 'ا')
      .replaceAll('ى', 'ي')
      .trim();
}
```

`word_corrector.dart`:

```dart
import 'arabic_text.dart';

enum LetterFault { wrongLetter, missingLetter, extraLetter }

class LetterMismatch {
  const LetterMismatch({required this.index, required this.fault, this.expected, this.got});
  final int index;
  final LetterFault fault;
  final String? expected;
  final String? got;
}

class WordFeedback {
  const WordFeedback({required this.correct, required this.best, required this.mismatches});
  final bool correct;
  final String? best;
  final List<LetterMismatch> mismatches;

  String message() {
    if (correct) return 'رائع! كتبتَها صحيحة';
    if (best == null || mismatches.isEmpty) return 'لم أستطع القراءة، جرّب مرة أخرى';
    final m = mismatches.first;
    switch (m.fault) {
      case LetterFault.wrongLetter:
        return 'كتبتَ ${m.got} والمطلوب ${m.expected}';
      case LetterFault.missingLetter:
        return 'ينقصنا حرف: ${m.expected}';
      case LetterFault.extraLetter:
        return 'زاد حرف: ${m.got}';
    }
  }
}

class WordCorrector {
  const WordCorrector();

  WordFeedback compare(String target, List<String> candidates) {
    final want = normalizeArabic(target);
    final options = candidates.map(normalizeArabic).where((c) => c.isNotEmpty).toList();
    if (want.isEmpty || options.isEmpty) return const WordFeedback(correct: false, best: null, mismatches: []);

    String best = options.first;
    var bestDistance = _distance(want, best);
    for (final c in options.skip(1)) {
      final d = _distance(want, c);
      if (d < bestDistance) {
        best = c;
        bestDistance = d;
      }
    }
    if (bestDistance == 0) return WordFeedback(correct: true, best: best, mismatches: const []);
    return WordFeedback(correct: false, best: best, mismatches: _align(want, best));
  }

  int _distance(String a, String b) {
    final dp = List.generate(a.length + 1, (i) => List<int>.filled(b.length + 1, 0));
    for (var i = 0; i <= a.length; i++) dp[i][0] = i;
    for (var j = 0; j <= b.length; j++) dp[0][j] = j;
    for (var i = 1; i <= a.length; i++) {
      for (var j = 1; j <= b.length; j++) {
        final cost = a[i - 1] == b[j - 1] ? 0 : 1;
        dp[i][j] = [dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost].reduce((x, y) => x < y ? x : y);
      }
    }
    return dp[a.length][b.length];
  }

  /// Walks back through the edit table: substitutions, then deletions (missing), then insertions (extra).
  List<LetterMismatch> _align(String want, String got) {
    final n = want.length, m = got.length;
    final dp = List.generate(n + 1, (i) => List<int>.filled(m + 1, 0));
    for (var i = 0; i <= n; i++) dp[i][0] = i;
    for (var j = 0; j <= m; j++) dp[0][j] = j;
    for (var i = 1; i <= n; i++) {
      for (var j = 1; j <= m; j++) {
        final cost = want[i - 1] == got[j - 1] ? 0 : 1;
        dp[i][j] = [dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost].reduce((x, y) => x < y ? x : y);
      }
    }
    final out = <LetterMismatch>[];
    var i = n, j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && dp[i][j] == dp[i - 1][j - 1] + (want[i - 1] == got[j - 1] ? 0 : 1)) {
        if (want[i - 1] != got[j - 1]) {
          out.add(LetterMismatch(index: i - 1, fault: LetterFault.wrongLetter, expected: want[i - 1], got: got[j - 1]));
        }
        i--;
        j--;
      } else if (i > 0 && dp[i][j] == dp[i - 1][j] + 1) {
        out.add(LetterMismatch(index: i - 1, fault: LetterFault.missingLetter, expected: want[i - 1]));
        i--;
      } else {
        out.add(LetterMismatch(index: i, fault: LetterFault.extraLetter, got: got[j - 1]));
        j--;
      }
    }
    return out.reversed.toList();
  }
}
```

- [ ] **Step 4: Run to verify pass** — `flutter test test/features/kids_letters/word_corrector_test.dart` -> all PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/features/kids_letters test/features/kids_letters
git commit -m "feat(kids): Arabic normalisation and gentle word correction (pure Dart)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Spaced repetition (Leitner) and the progress store

**Files:**
- Create: `lib/features/kids_letters/domain/leitner.dart`, `data/progress_store.dart`, `test/features/kids_letters/leitner_test.dart`, `test/features/kids_letters/progress_store_test.dart`

**Interfaces:**
- Produces:
  `class LetterProgress extends Equatable { const LetterProgress({this.box = 0, this.stars = 0, this.attempts = 0, this.misses = 0, this.due}); final int box; final int stars; final int attempts; final int misses; final String? due; Map<String,dynamic> toJson(); factory LetterProgress.fromJson(Map<String,dynamic>); }` (`due` is a `yyyy-MM-dd` day).
  `class LeitnerScheduler { const LeitnerScheduler(); static const List<int> intervals = [0, 1, 3, 7]; LetterProgress record(LetterProgress p, {required bool success, required String today}); List<String> dueLetters(Map<String, LetterProgress> all, String today); bool needsMoreGuidance(LetterProgress p); }`
  Rules: success -> `box = min(box+1, 3)`, `stars = min(stars+1, 3)`, `due = today + intervals[box]` days; failure -> `box = 0`, `misses += 1`, `due = today`; `attempts += 1` always; `needsMoreGuidance` = `misses >= 3 && misses > stars`. `dueLetters` = ids whose `due` is null or `<= today`, ordered by lowest box then oldest due.
  `class ProgressStore { ProgressStore(LocalStorage storage); Map<String, LetterProgress> load(String style); Future<void> save(String style, String letterId, LetterProgress p); String? selectedStyle(); Future<void> selectStyle(String style); }` — styles are `'naskh'` and `'ruqah'`; each has its own map; corrupt JSON reads as empty. **The store has no method that accepts strokes or images.**

- [ ] **Step 1: Write the failing tests** covering: first success (box 1, 1 star, due tomorrow since interval index is the new box: define `due = today + intervals[newBox]` so box 1 -> +1 day); three successes reach box 3 with 3 stars and due +7; a failure after success resets box to 0 and due today, keeps stars; stars never exceed 3; `needsMoreGuidance` false at 2 misses, true at 3 misses with 0 stars, false at 3 misses with 3 stars; `dueLetters` ordering and that never-seen letters (absent from the map) are not returned but letters with `due == null` are; year-end due arithmetic (`2026-12-31` + 1 -> `2027-01-01`); store round-trip per style is independent (naskh progress does not appear under ruqah); selecting a style persists; corrupt stored JSON returns an empty map; `save` twice keeps both letters. Use `MemoryStorage` from `test/features/daily/fakes/memory_storage.dart` (move it to `test/support/memory_storage.dart` in this task and update the daily tests' imports if the daily plan has been executed).
- [ ] **Step 2: Run to verify failure** — `flutter test test/features/kids_letters/leitner_test.dart test/features/kids_letters/progress_store_test.dart` -> FAIL.
- [ ] **Step 3: Implement** the scheduler and the store exactly per the rules above (day arithmetic in UTC with `DateTime.utc`, as `StreakEngine` does in the daily plan; store keys `kids.progress.naskh`, `kids.progress.ruqah`, `kids.style`).
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `feat(kids): Leitner scheduling and per-style progress store`.

---

### Task 4: Letter catalog, guide data format, first letters, debug gallery

**Files:**
- Create: `assets/kids/letters.json`, `lib/features/kids_letters/domain/letter.dart`, `data/letter_catalog.dart`, `presentation/widgets/guide_painter.dart`, `presentation/pages/letter_gallery_page.dart`, `test/features/kids_letters/letter_catalog_test.dart`
- Modify: `pubspec.yaml` (register `assets/kids/`)

**Interfaces:**
- Data format of `assets/kids/letters.json`:

```json
{
  "review_status": "unreviewed",
  "letters": [
    {
      "id": "alif", "char": "ا", "name": "ألف", "sound": "أَ", "tts": "ألف",
      "picture": { "emoji": "🐘", "word": "أسد" },
      "connects": false,
      "forms": {
        "isolated": { "naskh": { "strokes": [[[0.5,0.2],[0.5,0.8]]], "dots": [] },
                      "ruqah": { "strokes": [[[0.5,0.2],[0.5,0.8]]], "dots": [] } },
        "final":    { "naskh": { "strokes": [[[0.5,0.2],[0.5,0.8]]], "dots": [] },
                      "ruqah": { "strokes": [[[0.5,0.2],[0.5,0.8]]], "dots": [] } }
      }
    }
  ]
}
```
  Points are `[x, y]` in the unit square, y down; each stroke is an ordered polyline in drawing order (Arabic strokes usually run right to left). `connects: false` letters (ا د ذ ر ز و) have only `isolated` and `final`; connecting letters have all four forms (`isolated`, `initial`, `medial`, `final`). The `picture.emoji` is the per-letter asset slot; `picture.word` starts with the letter (pick a real word whose first letter is the letter, e.g. ب -> 🦆 بطة).
- Produces: `class Letter { id, char, name, sound, tts, pictureEmoji, pictureWord, connects, LetterGuide guide(String form, String style) }`, `class LetterCatalog { static Future<LetterCatalog> load(AssetBundle); List<Letter> get letters; Letter byId(String); String get reviewStatus; }` and `LetterCatalog.fromJson(Map)` (used by tests). Loading validates every rule below and throws `FormatException` naming the letter/form/style.
- Validation rules (each is a test): 28 letters with unique ids and chars; every required form exists for both styles; every stroke has at least 2 points, all coordinates within 0..1, stroke path length at least 0.15; every dot within 0.05..0.95; every letter has a non-empty `picture.emoji` and `picture.word`, and `picture.word` starts with the letter's char (normalised); `review_status` is `unreviewed` or `reviewed`.

- [ ] **Step 1: Write the failing tests** for `LetterCatalog.fromJson` with small inline fixtures (valid single-letter catalog passes the per-letter rules; a test per rule with one broken value; the "28 letters" rule is tested separately as `test('shipped catalog has all 28 letters and validates')` that loads the real asset via `TestWidgetsFlutterBinding` and `rootBundle` — this test is expected to FAIL until Task 9 finishes the 28; until then mark it `skip: 'content in progress (Task 9)'` and remove the skip in Task 9).
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** `letter.dart`, `letter_catalog.dart` (asset loading through `AssetBundle.loadString`, parsing into `LetterGuide`), and write the first four letters ا ب ت ث with both styles and all their forms in `letters.json`. Author strokes as polylines with 8-16 points per curve (smooth by eye, keep within 0.05..0.95). Naskh and Ruq'ah differ as follows: Naskh uses fuller open curves and the baa-family body dips below the baseline (`y` up to 0.62); Ruq'ah uses flatter, shorter bodies (`y` within 0.45..0.55) with the dot(s) placed closer to the body. Emoji and words: ا 🦁 أسد, ب 🦆 بطة, ت 🍎 تفاح, ث 🦊 ثعلب.
- [ ] **Step 4: Build the gallery** `LetterGalleryPage` (registered only in debug builds: `if (kDebugMode)` route `/kids-gallery`): a grid of every letter x form x style drawn by `GuidePainter` (CustomPainter drawing strokes as thick lines with numbered start dots and arrowheads, dots as filled circles), with the catalog `review_status` shown at the top ("غير مراجَع"). Widget test: pumps the gallery with the 4 finished letters and finds 4 letters x their forms x 2 styles painters, no overflow at the six sizes.
- [ ] **Step 5: Run** `flutter test test/features/kids_letters`; commit — `feat(kids): letter catalog format, validator, first four letters and review gallery`.

---

### Task 5: Ink recognition behind an interface

**Files:**
- Create: `lib/features/kids_letters/recognition/ink_recognizer.dart`, `mlkit_ink_recognizer.dart`, `test/features/kids_letters/fakes/fake_ink_recognizer.dart`, `test/features/kids_letters/ink_recognizer_test.dart`
- Modify: `pubspec.yaml` (`flutter pub add google_mlkit_digital_ink_recognition`)

**Interfaces:**
- Produces:
  `enum ModelState { unknown, missing, downloading, ready, failed }`
  `abstract class InkRecognizer { Stream<ModelState> get modelState; ModelState get currentState; Future<void> ensureModel({bool wifiOnly}); Future<List<String>> recognize(List<InkStroke> strokes, {required double width, required double height}); void dispose(); }` — `recognize` **never throws**: it returns `[]` when the model is not ready, the strokes are empty, or the plugin fails.
  `class MlKitInkRecognizer implements InkRecognizer` using language tag `ar` (`DigitalInkRecognizerModelManager.isModelDownloaded`, `downloadModel`, `DigitalInkRecognizer(languageCode: 'ar').recognize(ink)`; convert normalised points to the pixel space given by `width`/`height` and a millisecond timestamp per point; verify the API names against the installed package version).
  `FakeInkRecognizer` in tests: scripted candidate lists, a controllable `ModelState`, records how many times `recognize` was called.

- [ ] **Step 1: Write the failing tests** against the interface using the fake and a thin wrapper `SafeRecognizer` (wrap any `InkRecognizer` so a thrown error becomes `[]`; `MlKitInkRecognizer` uses it internally): recognize with empty strokes returns `[]` without calling the plugin; the plugin throwing returns `[]`; state changes are emitted in order `missing -> downloading -> ready`; `ensureModel(wifiOnly: true)` on mobile data (injected `NetworkKind`) does not start the download and stays `missing`; a failed download sets `failed` and a later `ensureModel` retries.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** the interface, `SafeRecognizer`, and `MlKitInkRecognizer` (the real plugin call is exercised only on a device; the unit tests cover everything around it through an injected `InkEngine` port with methods `isDownloaded()`, `download()`, `recognize(List<List<Offset-like>>)`).
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `feat(kids): on-device ink recognition behind a safe interface`.

---

### Task 6: Drawing widgets

**Files:**
- Create: `lib/features/kids_letters/presentation/widgets/drawing_pad.dart`, `ghost_hand.dart`, `letter_morph.dart`, `test/features/kids_letters/drawing_widgets_test.dart`

**Interfaces:**
- Produces:
  `DrawingPad({required ValueChanged<List<InkStroke>> onStrokesChanged, LetterGuide? showGuide, bool locked = false, Color strokeColor, VoidCallback? onClear})` — a square canvas (uses `AspectRatio(1)` inside `LayoutBuilder`, never larger than the available width) that captures pointer down/move/up with `Listener`, stores points **normalised to 0..1 of the current canvas size at capture time**, emits the full stroke list after every change, draws the child's strokes and (optionally) the dotted guide under them. A tap (down+up without move) becomes a 2-point stroke of nearly zero length. `GlobalKey`-free API: a `DrawingPadController` (`clear()`, `undoLast()`, `strokes`).
  `GhostHand({required LetterGuide guide, required int strokeIndex, VoidCallback? onDone})` — animates a hand icon along `guide.strokes[strokeIndex]` in 1.2 s, then calls `onDone`.
  `LetterMorph({required String char, required String emoji, required bool showPicture})` — cross-fades and scales from the big letter to the emoji (`AnimatedSwitcher` + `ScaleTransition`, 600 ms); the emoji is inside a `FittedBox`.
- Test behaviour: a simulated drag (`TestGesture`) yields normalised points inside 0..1 and the count of strokes equals the count of gestures; a tap yields a short stroke; resizing the pad after drawing keeps the emitted points unchanged (they were normalised at capture); `locked: true` ignores input; `clear()` empties; 400 quick move events do not throw; `GhostHand` calls `onDone` once; `LetterMorph` shows the char first and the emoji after `showPicture` flips; no overflow at the six sizes and 1.5x text.
- [ ] Steps: failing widget tests -> run (FAIL) -> implement -> run (PASS) -> commit `feat(kids): drawing pad, ghost hand and letter morph`.

---

### Task 7: `KidsLessonCubit` (Meet, Trace, Magic, Recall, Words)

**Files:**
- Create: `lib/features/kids_letters/presentation/cubit/kids_lesson_state.dart`, `kids_lesson_cubit.dart`, `test/features/kids_letters/kids_lesson_cubit_test.dart`

**Interfaces:**
- Consumes: `LetterCatalog`, `StrokeChecker`, `WordCorrector`, `LeitnerScheduler`, `ProgressStore`, `InkRecognizer`, a clock `String Function() today`, and the chosen style.
- Produces: `class KidsLessonCubit extends Cubit<KidsLessonState>` with `start(String letterId)`, `advance()`, `submitTrace(List<InkStroke>)`, `submitRecall(List<InkStroke>, {required double width, required double height})`, `submitWord(String target, List<InkStroke>, {required double width, required double height})`, `retry()`. States: `LessonMeet(letter)`, `LessonTrace(letter, attempt, needsHelpStroke: int?, guidance: bool)`, `LessonMagic(letter)`, `LessonRecall(letter, recognitionReady: bool, message: String?)`, `LessonWord(target, message: String?)`, `LessonDone(letter, stars)`.
- Behaviour to implement and test:
  1. Meet -> `advance()` -> Trace with `guidance` from `needsMoreGuidance` of the stored progress.
  2. `submitTrace` passing -> Magic and records success; failing -> stays in Trace, `attempt + 1`, `needsHelpStroke` set to the result's `strokeIndex` (drives the ghost hand), records **no** failure on the first miss but records one failure after the third miss of the same letter session; never a terminal failure state.
  3. Magic -> `advance()` -> Recall. If the recogniser is not `ready`, `recognitionReady = false`, the letter completes with 1 star from tracing alone, and the message says the reading helper is still downloading; the child is never blocked.
  4. `submitRecall` uses `recognizer.recognize`; the candidates are checked with `WordCorrector.compare(letter.char, candidates)`; correct -> `LessonDone` with stars from progress; wrong -> a gentle `message()`; empty candidates -> the "جرّب مرة أخرى" message; recognizer errors (fake throws through `SafeRecognizer`) behave like empty.
  5. Words: `submitWord` compares to the target and shows `WordFeedback.message()`; success advances to Done.
  6. Progress is saved with `ProgressStore.save(style, letterId, ...)` only; a spy `LocalStorage` asserts that no saved value contains stroke coordinates (compare against the drawn points' string form) — drawings are never persisted.
- [ ] Steps: failing cubit tests using `FakeInkRecognizer` and `MemoryStorage` -> run (FAIL) -> implement -> run (PASS) -> commit `feat(kids): lesson flow cubit with never-blocking recognition`.

---

### Task 8: Screens, grown-up gate, no ads, entry point

**Files:**
- Create: `lib/features/kids_letters/kids_injection.dart`, `presentation/pages/kids_home_page.dart`, `lesson_page.dart`, `grown_up_gate.dart`, `test/features/kids_letters/kids_screens_test.dart`
- Modify: `lib/core/di/injection.dart` (call `initKidsFeature(getIt)`), `lib/router/AppRouter.dart` (`kids = '/kids'`), `lib/components/e3rbly_drawer.dart` (drawer item "تعلّم الحروف" -> opens the **grown-up gate first**, then `/kids`), `pubspec.yaml` (`flutter pub add flutter_tts`)

**Interfaces / behaviour:**
- `GrownUpGate`: a dialog with a random arithmetic question (two numbers 6-9 multiplied, answered by tapping one of four options); wrong answer closes it; it protects entering the kids' area, changing the style, and leaving to the rest of the app. The question generator takes a `Random` so tests are deterministic.
- `KidsHomePage`: the letters of the chosen style in sets of 4 with stars; first launch asks (inside the gate) for **Naskh or Ruq'ah**, saved through `ProgressStore.selectStyle`; a "recall unlocks after the reading helper downloads" banner reflects `ModelState`; nothing links outside the app.
- `LessonPage`: drives `KidsLessonCubit` with `DrawingPad`, `GhostHand`, `LetterMorph`; letter name and sound through `flutter_tts` behind a `SpeechPort` interface (fake in tests; TTS failures are swallowed).
- **No ads:** the kids' screens never touch `AdService`/`AnalysisQuotaManager`. Test: register a spy `AdService` in a fresh get_it, pump `KidsHomePage` and `LessonPage`, run a full lesson with fakes, and assert the spy recorded zero calls; also assert the kids widget tree contains no widget from `lib/features/ads`.
- Tests: gate accepts the right answer and rejects a wrong one; the drawer item opens the gate before the area; the style choice persists and changes the guides used; back navigation from a lesson returns to the kids home, and from the kids home leaving the area requires the gate; overflow matrix (six sizes x text 1.0/1.5) for home, meet, trace, magic, recall; buttons are at least 64 dp.
- [ ] Steps: failing tests -> FAIL -> implement -> PASS -> run the existing suite (`flutter test`) to confirm nothing else broke -> commit `feat(kids): screens, grown-up gate, style choice, no-ads guarantee`.

---

### Task 9: The remaining 24 letters and review hand-off

**Files:**
- Modify: `assets/kids/letters.json`, `test/features/kids_letters/letter_catalog_test.dart` (remove the `skip` from the shipped-catalog test)
- Create: `docs/KIDS_LETTER_REVIEW.md` in the mobile repo

- [ ] **Step 1:** Add letters in batches of 6 in this order (grouped by shape family so guides stay consistent): ج ح خ د ذ ر / ز س ش ص ض ط / ظ ع غ ف ق ك / ل م ن ه و ي. For each: both styles, all required forms, picture (emoji + real word starting with the letter), tts text. After each batch run `flutter test test/features/kids_letters` and open the gallery to check the shapes by eye; commit `content(kids): letters <first>..<last>`.
- [ ] **Step 2:** Remove the `skip` so `shipped catalog has all 28 letters and validates` runs; expect PASS.
- [ ] **Step 3:** Write `docs/KIDS_LETTER_REVIEW.md`: what to review (each letter x form x style in the debug gallery), the checklist for a calligrapher (stroke order and direction, proportions, dot placement, connecting forms, Ruq'ah simplifications), how to change `review_status` to `reviewed` (edit the JSON, record reviewer name and date in the backend `docs/PROGRESS.md`), and the note that the app shows "غير مراجَع" in the gallery until then.
- [ ] **Step 4: Commit** — `content(kids): all 28 letters in Naskh and Ruq'ah + review guide`.

---

### Task 10: Whole-app checks and the device checklist

- [ ] **Step 1:** `flutter test` (whole app). Expected: all pass (the 506 existing, plus daily if merged, plus the new kids tests).
- [ ] **Step 2:** `flutter analyze`. Expected: 0 errors, no growth beyond the baseline.
- [ ] **Step 3:** `flutter build apk --debug`. Expected: builds (ML Kit and TTS add native code; if the build fails on minSdk or NDK, raise the minimum in `android/app/build.gradle.kts` to what the plugin README requires and re-run; record the change).
- [ ] **Step 4:** Write the on-device checklist into `docs/KIDS_LETTER_REVIEW.md` for the owner: the reading model downloads on Wi-Fi and the banner clears; tracing works with the model missing; a child-sized finger draws smoothly at 60 fps on a mid-range phone; trace a correct letter -> Magic morph -> Recall accepts a reasonable drawing; a deliberately wrong letter gets the ghost hand, never a failure screen; dots decide ب/ت/ث; a wrong word gets the "كتبتَ ت والمطلوب ث" message; airplane mode after the model is downloaded still recognises; rotating the phone mid-letter keeps the strokes; no ad ever appears in the kids' area; the grown-up gate blocks entering, style change and leaving. **Recognition accuracy on real children's handwriting is unverified until this checklist has been run; report it that way.**
- [ ] **Step 5:** Commit, stop. Merge and release are the owner's decision.

---

## Self-review notes

- **Spec coverage (Part A):** Meet / Trace / Magic / Recall / Words flow (T7, T8); own StrokeChecker for shape, direction, order and dots (T1); ML Kit behind an interface with model states and never-blocking fallback (T5, T7); WordCorrector with the "you wrote ت, we need ث" feedback and letter-form tolerance (T2); Leitner review and extra guidance after three misses (T3, T7); Naskh/Ruq'ah as one chosen style per path with separate progress (T3, T4, T8); emoji picture slot per letter (T4); no ads / no external links / no sign-in / on-device only / drawings never stored (T7, T8); grown-up gate (T8); debug gallery and unreviewed flag for calligrapher review (T4, T9); overflow matrix (T4, T6, T8); device checklist and accuracy stated as unverified (T10).
- **Type consistency:** `InkPoint`, `InkStroke`, `LetterGuide`, `TraceResult`, `TraceIssue`, `StrokeChecker.check`, `WordFeedback`, `WordCorrector.compare`, `LetterProgress`, `LeitnerScheduler.record/dueLetters/needsMoreGuidance`, `ProgressStore`, `InkRecognizer`, `ModelState` are used identically across tasks.
- **Known limits:** the stroke data for 28 letters x forms x 2 styles is authored by hand and only a calligrapher can approve it; ML Kit accuracy on children's handwriting can only be measured on devices; the Ruq'ah differences described in Task 4 are a first approximation for review, not an authority.
