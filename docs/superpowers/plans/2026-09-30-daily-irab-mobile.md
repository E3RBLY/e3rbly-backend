# Daily I'rab Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the "إعراب اليوم" daily puzzle to the Flutter app: fetch today's puzzle, answer 3 words, keep a streak with a growing tree, share a spoiler-free result, and optionally get a daily reminder.

**Architecture:** New feature `lib/features/daily` (domain / data / presentation) in the style of `lib/features/quran`: get_it registration in `daily_injection.dart`, `ApiClient` data source, `LocalStorage` (SharedPreferences) for progress, a `DailyCubit` with sealed states. Streak, tree and share text are pure Dart so they are unit tested without Flutter. Progress is local-only (no accounts).

**Tech Stack:** Flutter, flutter_bloc + equatable (already used), get_it, shared_preferences (already used), `share_plus`, `flutter_local_notifications` + `timezone` + `flutter_timezone` (new, Task 7).

**Spec:** `docs/superpowers/specs/2026-09-30-kids-letters-and-daily-irab-design.md` (Part B, mobile). Backend contract: `docs/ENDPOINTS.md` "Daily I'rab" (`GET /v1/daily/today`, live in production). Repo for this plan: `H:\Projects\e3rbly\e3rbly-mobile`. Plan 3 (Kids' Letter Magic) follows.

## Global Constraints

- Arabic UI, RTL; every tappable target at least 48 dp; no overflow at 320x568 and 1.5x text scale (matrix from `test/features/quran/quran_widgets_test.dart`: `Size(320,568) (360,640) (412,915) (844,390) (768,1024) (1280,800)`).
- Errors shown to users are friendly Arabic via `ApiErrorHandler.getErrorMessage`; raw exceptions never reach the UI.
- The server's `notice` is always shown while `reviewStatus` is `unreviewed`.
- Streak days use the server's `date` (UTC+3 calendar day); offline, the device clock is converted to UTC+3 the same way. No streak credit for a date earlier than the last completed one (clock manipulation gives nothing back).
- No accounts, no leaderboards, no purchases; streak freezes are earned only.
- Analyzer must stay at the baseline (0 errors; the existing 193 infos/warnings do not grow); all existing tests keep passing (506 at last run).
- Nothing is pushed to `main` and no APK is published without the owner's go. Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Deviations from the spec (rulings, made explicit)

1. **Streak freeze is earned by a 7-day milestone, not by a bonus round.** A bonus round needs extra content and an endpoint that do not exist yet. Cap: 2 freezes. Cost if the owner wants the bonus round: a new backend route and one cubit action; the engine already takes freezes as data.
2. **Share is text with emoji squares** (like Wordle), not an image card. It works in every chat app with no rendering code. The image card is a follow-up task if the owner wants it.

## Review Focus

- Device clock moved backwards or forwards must not create or extend a streak (Task 2).
- Year end and leap day boundaries in streak arithmetic (Task 2).
- Offline with yesterday's cached puzzle after midnight must show the "connect to load today's puzzle" state, never yesterday's puzzle as today's (Task 3).
- Leaving the app after answering 1-2 words and coming back must keep those answers locked, so there is no retry advantage (Task 5).
- Finishing the puzzle twice (double tap, reopen a completed day) must count the streak once (Tasks 2 and 5).
- Long Arabic option texts (about 50 characters) at 320 px wide and 1.5x text scale must not overflow (Task 6).

---

## File structure

| File | Responsibility |
|---|---|
| `lib/features/daily/domain/entities/daily_puzzle.dart` | `DailyPuzzle`, `PuzzleTarget` + JSON |
| `lib/features/daily/domain/streak/streak_state.dart`, `streak_engine.dart` | streak rules (pure) |
| `lib/features/daily/domain/streak/tree_stage.dart` | streak -> tree stage (pure) |
| `lib/features/daily/domain/share_text.dart` | spoiler-free share text (pure) |
| `lib/features/daily/domain/local_day.dart` | UTC+3 day string from a clock (pure) |
| `lib/features/daily/data/daily_remote_data_source.dart` | `ApiClient` -> `DailyPuzzle` |
| `lib/features/daily/data/daily_store.dart` | `LocalStorage`: cached puzzle, answers per date, streak |
| `lib/features/daily/data/daily_repository.dart` | fetch + cache + offline rule |
| `lib/features/daily/presentation/cubit/daily_cubit.dart`, `daily_state.dart` | flow |
| `lib/features/daily/presentation/pages/daily_page.dart` | screen |
| `lib/features/daily/presentation/widgets/{question_card,streak_tree,daily_entry_card,result_summary}.dart` | UI parts |
| `lib/features/daily/reminder/reminder_scheduler.dart` | interface + plugin implementation |
| `lib/features/daily/daily_injection.dart` | get_it |
| modify `lib/core/di/injection.dart`, `lib/router/AppRouter.dart`, `lib/components/e3rbly_drawer.dart`, `lib/features/home/presentation/widgets/home_page_content.dart` | wiring |
| `test/features/daily/**` | tests |

---

### Task 1: Puzzle entities and JSON

**Files:**
- Create: `lib/features/daily/domain/entities/daily_puzzle.dart`, `test/features/daily/daily_puzzle_test.dart`

**Interfaces:**
- Produces:
  `class PuzzleTarget extends Equatable { final String word; final List<String> options; final int correctIndex; final String explanation; }`
  `class DailyPuzzle extends Equatable { final int dayNumber; final String date; final String expiresAt; final String reviewStatus; final String? notice; final String id; final String sentence; final List<PuzzleTarget> targets; bool get isUnreviewed; factory DailyPuzzle.fromJson(Map<String,dynamic>); Map<String,dynamic> toJson(); }`
  `fromJson` reads the exact response of `GET /v1/daily/today` and throws `FormatException` on a malformed body (missing keys, not 3 targets, not 4 options, correctIndex out of range).

- [ ] **Step 1: Write the failing test**

```dart
import 'package:e3rbly/features/daily/domain/entities/daily_puzzle.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> body({List<dynamic>? targets}) => {
  'dayNumber': 12,
  'date': '2026-10-12',
  'expiresAt': '2026-10-12T21:00:00.000Z',
  'reviewStatus': 'unreviewed',
  'notice': 'أسئلة اليوم قيد المراجعة اللغوية وقد تحتوي على أخطاء.',
  'puzzle': {
    'id': 'd-012',
    'sentence': 'قرأ الطالب الدرس',
    'targets': targets ??
        List.generate(3, (i) => {
          'word': 'كلمة$i',
          'options': ['أ', 'ب', 'ج', 'د'],
          'correctIndex': i,
          'explanation': 'لأن',
        }),
  },
};

void main() {
  test('parses the backend contract', () {
    final p = DailyPuzzle.fromJson(body());
    expect(p.dayNumber, 12);
    expect(p.date, '2026-10-12');
    expect(p.isUnreviewed, isTrue);
    expect(p.notice, contains('مراجعة'));
    expect(p.id, 'd-012');
    expect(p.targets, hasLength(3));
    expect(p.targets[1].correctIndex, 1);
  });

  test('toJson round-trips (used for the offline cache)', () {
    final p = DailyPuzzle.fromJson(body());
    expect(DailyPuzzle.fromJson(p.toJson()), p);
  });

  test('a reviewed puzzle has no notice', () {
    final json = body()..['reviewStatus'] = 'reviewed';
    json.remove('notice');
    final p = DailyPuzzle.fromJson(json);
    expect(p.isUnreviewed, isFalse);
    expect(p.notice, isNull);
  });

  test('rejects malformed bodies with FormatException', () {
    expect(() => DailyPuzzle.fromJson({}), throwsFormatException);
    expect(() => DailyPuzzle.fromJson(body(targets: [])), throwsFormatException);
    final threeOptions = List.generate(3, (i) => {'word': 'w', 'options': ['a', 'b', 'c'], 'correctIndex': 0, 'explanation': 'x'});
    expect(() => DailyPuzzle.fromJson(body(targets: threeOptions)), throwsFormatException);
    final badIndex = List.generate(3, (i) => {'word': 'w', 'options': ['a', 'b', 'c', 'd'], 'correctIndex': 4, 'explanation': 'x'});
    expect(() => DailyPuzzle.fromJson(body(targets: badIndex)), throwsFormatException);
  });
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `flutter test test/features/daily/daily_puzzle_test.dart`
Expected: FAIL, `Target of URI doesn't exist: 'package:e3rbly/features/daily/domain/entities/daily_puzzle.dart'`.

- [ ] **Step 3: Implement**

```dart
import 'package:equatable/equatable.dart';

class PuzzleTarget extends Equatable {
  const PuzzleTarget({
    required this.word,
    required this.options,
    required this.correctIndex,
    required this.explanation,
  });

  final String word;
  final List<String> options;
  final int correctIndex;
  final String explanation;

  factory PuzzleTarget.fromJson(Object? raw) {
    if (raw is! Map<String, dynamic>) throw const FormatException('target must be an object');
    final options = raw['options'];
    final correct = raw['correctIndex'];
    if (raw['word'] is! String || raw['explanation'] is! String) throw const FormatException('target text missing');
    if (options is! List || options.length != 4 || options.any((o) => o is! String)) throw const FormatException('target needs 4 options');
    if (correct is! int || correct < 0 || correct > 3) throw const FormatException('correctIndex out of range');
    return PuzzleTarget(
      word: raw['word'] as String,
      options: List<String>.unmodifiable(options.cast<String>()),
      correctIndex: correct,
      explanation: raw['explanation'] as String,
    );
  }

  Map<String, dynamic> toJson() => {'word': word, 'options': options, 'correctIndex': correctIndex, 'explanation': explanation};

  @override
  List<Object?> get props => [word, options, correctIndex, explanation];
}

class DailyPuzzle extends Equatable {
  const DailyPuzzle({
    required this.dayNumber,
    required this.date,
    required this.expiresAt,
    required this.reviewStatus,
    required this.notice,
    required this.id,
    required this.sentence,
    required this.targets,
  });

  final int dayNumber;
  final String date;
  final String expiresAt;
  final String reviewStatus;
  final String? notice;
  final String id;
  final String sentence;
  final List<PuzzleTarget> targets;

  bool get isUnreviewed => reviewStatus == 'unreviewed';

  factory DailyPuzzle.fromJson(Map<String, dynamic> json) {
    final puzzle = json['puzzle'];
    if (puzzle is! Map<String, dynamic>) throw const FormatException('puzzle missing');
    final targets = puzzle['targets'];
    if (targets is! List || targets.length != 3) throw const FormatException('puzzle needs 3 targets');
    if (json['dayNumber'] is! int || json['date'] is! String || json['expiresAt'] is! String || json['reviewStatus'] is! String) {
      throw const FormatException('puzzle header missing');
    }
    if (puzzle['id'] is! String || puzzle['sentence'] is! String) throw const FormatException('puzzle id/sentence missing');
    return DailyPuzzle(
      dayNumber: json['dayNumber'] as int,
      date: json['date'] as String,
      expiresAt: json['expiresAt'] as String,
      reviewStatus: json['reviewStatus'] as String,
      notice: json['notice'] as String?,
      id: puzzle['id'] as String,
      sentence: puzzle['sentence'] as String,
      targets: List<PuzzleTarget>.unmodifiable(targets.map(PuzzleTarget.fromJson)),
    );
  }

  Map<String, dynamic> toJson() => {
    'dayNumber': dayNumber,
    'date': date,
    'expiresAt': expiresAt,
    'reviewStatus': reviewStatus,
    if (notice != null) 'notice': notice,
    'puzzle': {'id': id, 'sentence': sentence, 'targets': targets.map((t) => t.toJson()).toList()},
  };

  @override
  List<Object?> get props => [dayNumber, date, expiresAt, reviewStatus, notice, id, sentence, targets];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `flutter test test/features/daily/daily_puzzle_test.dart`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/features/daily test/features/daily
git commit -m "feat(daily): puzzle entities and JSON parsing

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Streak engine, tree stages, UTC+3 day, share text (pure Dart)

**Files:**
- Create: `lib/features/daily/domain/streak/streak_state.dart`, `lib/features/daily/domain/streak/streak_engine.dart`, `lib/features/daily/domain/streak/tree_stage.dart`, `lib/features/daily/domain/local_day.dart`, `lib/features/daily/domain/share_text.dart`, `test/features/daily/streak_engine_test.dart`, `test/features/daily/tree_share_day_test.dart`

**Interfaces:**
- Produces:
  `class StreakState extends Equatable { const StreakState({this.current = 0, this.best = 0, this.lastCompleted, this.freezes = 0}); final int current, best; final String? lastCompleted; final int freezes; Map<String,dynamic> toJson(); factory StreakState.fromJson(Map<String,dynamic>); }` (`fromJson` tolerates missing or wrong-typed fields by using defaults).
  `class StreakEngine { const StreakEngine(); static const int maxFreezes = 2; static const int milestone = 7; static int daysBetween(String from, String to); StreakState complete(StreakState s, String today); int shownStreak(StreakState s, String today); }`
  `int treeStage(int streak)` (0..7) and `String treeStageName(int stage)` (Arabic).
  `String localDayString(DateTime now)`: the UTC+3 calendar day `yyyy-MM-dd` of the instant `now` (any timezone).
  `String buildShareText({required int dayNumber, required List<bool> results, required int streak})`.

- [ ] **Step 1: Write the failing tests**

`test/features/daily/streak_engine_test.dart`:

```dart
import 'package:e3rbly/features/daily/domain/streak/streak_engine.dart';
import 'package:e3rbly/features/daily/domain/streak/streak_state.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const engine = StreakEngine();
  StreakState run(List<String> days, {StreakState start = const StreakState()}) =>
      days.fold(start, (s, d) => engine.complete(s, d));

  test('first completion starts a streak of 1', () {
    final s = run(['2026-10-01']);
    expect(s.current, 1);
    expect(s.best, 1);
    expect(s.lastCompleted, '2026-10-01');
  });

  test('consecutive days extend the streak', () {
    expect(run(['2026-10-01', '2026-10-02', '2026-10-03']).current, 3);
  });

  test('completing the same day twice counts once', () {
    final s = run(['2026-10-01', '2026-10-01', '2026-10-01']);
    expect(s.current, 1);
  });

  test('a missed day without a freeze resets to 1 but keeps the best', () {
    final s = run(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05']);
    expect(s.current, 1);
    expect(s.best, 3);
  });

  test('a freeze covers exactly one missed day and is consumed', () {
    final s = engine.complete(const StreakState(current: 5, best: 5, lastCompleted: '2026-10-01', freezes: 1), '2026-10-03');
    expect(s.current, 6);
    expect(s.freezes, 0);
  });

  test('one freeze does not cover two missed days', () {
    final s = engine.complete(const StreakState(current: 5, best: 5, lastCompleted: '2026-10-01', freezes: 1), '2026-10-04');
    expect(s.current, 1);
    expect(s.freezes, 1);
  });

  test('two freezes cover two missed days', () {
    final s = engine.complete(const StreakState(current: 5, best: 5, lastCompleted: '2026-10-01', freezes: 2), '2026-10-04');
    expect(s.current, 6);
    expect(s.freezes, 0);
  });

  test('the 7th consecutive day earns a freeze, capped at 2', () {
    final week = List.generate(7, (i) => '2026-10-${(i + 1).toString().padLeft(2, '0')}');
    expect(run(week).freezes, 1);
    final full = engine.complete(const StreakState(current: 13, best: 13, lastCompleted: '2026-10-13', freezes: 2), '2026-10-14');
    expect(full.current, 14);
    expect(full.freezes, 2);
  });

  test('device clock moved backwards gives nothing back', () {
    final before = const StreakState(current: 4, best: 4, lastCompleted: '2026-10-10');
    expect(engine.complete(before, '2026-10-05'), before);
    expect(engine.shownStreak(before, '2026-10-05'), 4);
  });

  test('device clock jumped far forward resets (no freeze), never inflates', () {
    final s = engine.complete(const StreakState(current: 4, best: 4, lastCompleted: '2026-10-10'), '2027-10-10');
    expect(s.current, 1);
  });

  test('year end and leap day arithmetic', () {
    expect(StreakEngine.daysBetween('2026-12-31', '2027-01-01'), 1);
    expect(StreakEngine.daysBetween('2028-02-28', '2028-03-01'), 2); // 2028 is a leap year
    expect(StreakEngine.daysBetween('2027-02-28', '2027-03-01'), 1);
    expect(run(['2026-12-31', '2027-01-01']).current, 2);
  });

  test('shownStreak: alive today and yesterday, dead after a miss unless frozen', () {
    const s = StreakState(current: 6, best: 6, lastCompleted: '2026-10-10');
    expect(engine.shownStreak(s, '2026-10-10'), 6);
    expect(engine.shownStreak(s, '2026-10-11'), 6); // still saveable today
    expect(engine.shownStreak(s, '2026-10-12'), 0); // missed 10-11, no freeze
    expect(engine.shownStreak(const StreakState(current: 6, best: 6, lastCompleted: '2026-10-10', freezes: 1), '2026-10-12'), 6);
    expect(engine.shownStreak(const StreakState(), '2026-10-12'), 0);
  });

  test('StreakState JSON round-trips and tolerates garbage', () {
    const s = StreakState(current: 3, best: 9, lastCompleted: '2026-10-10', freezes: 1);
    expect(StreakState.fromJson(s.toJson()), s);
    expect(StreakState.fromJson({'current': 'x', 'best': null}), const StreakState());
  });
}
```

`test/features/daily/tree_share_day_test.dart`:

```dart
import 'package:e3rbly/features/daily/domain/local_day.dart';
import 'package:e3rbly/features/daily/domain/share_text.dart';
import 'package:e3rbly/features/daily/domain/streak/tree_stage.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('tree stage thresholds', () {
    expect([0, 1, 2, 3, 6, 7, 13, 14, 29, 30, 59, 60, 99, 100, 5000].map(treeStage).toList(), [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7]);
    expect(treeStage(-4), 0);
    for (var s = 0; s <= 7; s++) expect(treeStageName(s), isNotEmpty);
  });

  test('localDayString is the UTC+3 day of the instant, whatever the timezone', () {
    expect(localDayString(DateTime.utc(2026, 9, 30, 20, 59, 59)), '2026-09-30');
    expect(localDayString(DateTime.utc(2026, 9, 30, 21, 0, 0)), '2026-10-01');
    expect(localDayString(DateTime.utc(2026, 12, 31, 21, 0, 0)), '2027-01-01');
    // a local (non-UTC) DateTime for the same instant gives the same answer
    expect(localDayString(DateTime.utc(2026, 9, 30, 21, 0, 0).toLocal()), '2026-10-01');
  });

  test('share text has squares, day number and streak but no words or answers', () {
    final text = buildShareText(dayNumber: 12, results: [true, false, true], streak: 5);
    expect(text, contains('#12'));
    expect(text, contains('🟩🟥🟩'));
    expect(text, contains('5'));
    expect(text, contains('إعراب اليوم'));
    expect(buildShareText(dayNumber: 1, results: [true, true, true], streak: 0), isNot(contains('🔥')));
  });
}
```

- [ ] **Step 2: Run to verify failure**

Run: `flutter test test/features/daily/streak_engine_test.dart test/features/daily/tree_share_day_test.dart`
Expected: FAIL, missing imports.

- [ ] **Step 3: Implement**

`streak_state.dart`:

```dart
import 'package:equatable/equatable.dart';

class StreakState extends Equatable {
  const StreakState({this.current = 0, this.best = 0, this.lastCompleted, this.freezes = 0});

  final int current;
  final int best;
  final String? lastCompleted;
  final int freezes;

  Map<String, dynamic> toJson() => {'current': current, 'best': best, 'last': lastCompleted, 'freezes': freezes};

  factory StreakState.fromJson(Map<String, dynamic> json) {
    int n(Object? v) => v is int && v >= 0 ? v : 0;
    return StreakState(
      current: n(json['current']),
      best: n(json['best']),
      lastCompleted: json['last'] is String ? json['last'] as String : null,
      freezes: n(json['freezes']),
    );
  }

  @override
  List<Object?> get props => [current, best, lastCompleted, freezes];
}
```

`streak_engine.dart`:

```dart
import 'dart:math';

import 'streak_state.dart';

/// Streak rules. Days are `yyyy-MM-dd` strings (UTC+3 calendar days); arithmetic is done in UTC so it never
/// depends on the device timezone or daylight saving.
class StreakEngine {
  const StreakEngine();

  static const int maxFreezes = 2;
  static const int milestone = 7;

  static DateTime _parse(String day) {
    final p = day.split('-');
    return DateTime.utc(int.parse(p[0]), int.parse(p[1]), int.parse(p[2]));
  }

  static int daysBetween(String from, String to) => _parse(to).difference(_parse(from)).inDays;

  StreakState complete(StreakState s, String today) {
    final last = s.lastCompleted;
    if (last == null) return _advance(s, today, 1, s.freezes);
    final gap = daysBetween(last, today);
    if (gap <= 0) return s; // same day again, or the clock went backwards: no credit
    if (gap == 1) return _advance(s, today, s.current + 1, s.freezes);
    final missed = gap - 1;
    if (s.current > 0 && s.freezes >= missed) return _advance(s, today, s.current + 1, s.freezes - missed);
    return _advance(s, today, 1, s.freezes);
  }

  StreakState _advance(StreakState s, String today, int current, int freezes) {
    final earned = current % milestone == 0 && freezes < maxFreezes ? 1 : 0;
    return StreakState(current: current, best: max(s.best, current), lastCompleted: today, freezes: freezes + earned);
  }

  /// The number to display today: alive if completed today or yesterday, or if freezes cover the gap.
  int shownStreak(StreakState s, String today) {
    final last = s.lastCompleted;
    if (last == null) return 0;
    final gap = daysBetween(last, today);
    if (gap <= 1) return s.current;
    return s.freezes >= gap - 1 ? s.current : 0;
  }
}
```

`tree_stage.dart`:

```dart
const List<int> _thresholds = [0, 1, 3, 7, 14, 30, 60, 100];
const List<String> _names = ['بذرة', 'برعم', 'شتلة', 'شجرة صغيرة', 'شجرة', 'شجرة مثمرة', 'شجرة عظيمة', 'غابة'];

/// 0 (seed) to 7 (forest) for a streak length.
int treeStage(int streak) {
  var stage = 0;
  for (var i = 0; i < _thresholds.length; i++) {
    if (streak >= _thresholds[i]) stage = i;
  }
  return stage;
}

String treeStageName(int stage) => _names[stage.clamp(0, _names.length - 1)];
```

Check against test: streak 0 -> stage 0, 1,2 -> 1, 3..6 -> 2, 7..13 -> 3, 14..29 -> 4, 30..59 -> 5, 60..99 -> 6, 100+ -> 7. ✓ (the test list maps accordingly.)

`local_day.dart`:

```dart
/// The UTC+3 calendar day (`yyyy-MM-dd`) of an instant; must match the backend's day boundary.
String localDayString(DateTime now) {
  final shifted = now.toUtc().add(const Duration(hours: 3));
  String two(int n) => n.toString().padLeft(2, '0');
  return '${shifted.year.toString().padLeft(4, '0')}-${two(shifted.month)}-${two(shifted.day)}';
}
```

`share_text.dart`:

```dart
String buildShareText({required int dayNumber, required List<bool> results, required int streak}) {
  final squares = results.map((ok) => ok ? '🟩' : '🟥').join();
  final lines = <String>['إعراب اليوم #$dayNumber', squares];
  if (streak > 0) lines.add('🔥 $streak يوم متتالي');
  lines.add('e3rbly');
  return lines.join('\n');
}
```

- [ ] **Step 4: Run to verify pass**

Run: `flutter test test/features/daily`
Expected: all PASS (Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/features/daily test/features/daily
git commit -m "feat(daily): streak engine with freezes, tree stages, UTC+3 day, share text

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Store, remote data source, repository (with the offline rule)

**Files:**
- Create: `lib/features/daily/data/daily_store.dart`, `lib/features/daily/data/daily_remote_data_source.dart`, `lib/features/daily/data/daily_repository.dart`, `test/features/daily/fakes/memory_storage.dart`, `test/features/daily/daily_repository_test.dart`

**Interfaces:**
- Consumes: `DailyPuzzle` (Task 1), `StreakState` (Task 2), `localDayString` (Task 2), `LocalStorage` (`lib/core/storage/c.dart`), `ApiClient.get` (returns `dynamic`).
- Produces:
  `class DailyStore { DailyStore(LocalStorage storage); DailyPuzzle? cachedPuzzle(); Future<void> saveCachedPuzzle(DailyPuzzle p); List<int?> answers(String date); Future<void> saveAnswers(String date, List<int?> answers); StreakState streak(); Future<void> saveStreak(StreakState s); }`. Answers for the last 30 dates are kept, older are dropped. Corrupt stored JSON reads as empty/default, never throws.
  `abstract class DailyRemoteDataSource { Future<DailyPuzzle> fetchToday(); }` + `DailyRemoteDataSourceImpl(ApiClient)`.
  `abstract class DailyRepository { Future<DailyPuzzle> today(); }` + `DailyRepositoryImpl(DailyRemoteDataSource, DailyStore, {DateTime Function() now})`. `today()` returns the fetched puzzle (and caches it). On any failure it returns the cached puzzle **only if `cached.date == localDayString(now())`**, otherwise rethrows the original error.

- [ ] **Step 1: Test helpers and failing tests**

`test/features/daily/fakes/memory_storage.dart`:

```dart
import 'package:e3rbly/core/storage/c.dart';

class MemoryStorage implements LocalStorage {
  final Map<String, String> data = {};
  @override
  Future<void> clearAll() async => data.clear();
  @override
  String? getData(String key) => data[key];
  @override
  Future<void> removeData(String key) async => data.remove(key);
  @override
  Future<void> saveData(String key, String value) async => data[key] = value;
}
```

`test/features/daily/daily_repository_test.dart`:

```dart
import 'package:e3rbly/core/errors/exceptions.dart';
import 'package:e3rbly/features/daily/data/daily_remote_data_source.dart';
import 'package:e3rbly/features/daily/data/daily_repository.dart';
import 'package:e3rbly/features/daily/data/daily_store.dart';
import 'package:e3rbly/features/daily/domain/entities/daily_puzzle.dart';
import 'package:e3rbly/features/daily/domain/streak/streak_state.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes/memory_storage.dart';

DailyPuzzle puzzle(String date, {int day = 1}) => DailyPuzzle.fromJson({
  'dayNumber': day,
  'date': date,
  'expiresAt': '${date}T21:00:00.000Z',
  'reviewStatus': 'unreviewed',
  'notice': 'n',
  'puzzle': {
    'id': 'd-$day',
    'sentence': 'قرأ الطالب الدرس',
    'targets': List.generate(3, (i) => {'word': 'w$i', 'options': ['a', 'b', 'c', 'd'], 'correctIndex': 0, 'explanation': 'e'}),
  },
});

class FakeRemote implements DailyRemoteDataSource {
  FakeRemote({this.result, this.error});
  DailyPuzzle? result;
  Object? error;
  int calls = 0;
  @override
  Future<DailyPuzzle> fetchToday() async {
    calls++;
    if (error != null) throw error!;
    return result!;
  }
}

void main() {
  group('DailyStore', () {
    test('answers default to three nulls and persist per date', () async {
      final store = DailyStore(MemoryStorage());
      expect(store.answers('2026-10-01'), [null, null, null]);
      await store.saveAnswers('2026-10-01', [2, null, 1]);
      expect(store.answers('2026-10-01'), [2, null, 1]);
      expect(store.answers('2026-10-02'), [null, null, null]);
    });

    test('keeps only the last 30 dates', () async {
      final store = DailyStore(MemoryStorage());
      for (var d = 1; d <= 35; d++) {
        await store.saveAnswers('2026-11-${d.toString().padLeft(2, '0')}', [0, 0, 0]);
      }
      expect(store.answers('2026-11-01'), [null, null, null]);
      expect(store.answers('2026-11-35'), [0, 0, 0]);
    });

    test('streak and puzzle cache round-trip; corrupt data reads as default', () async {
      final storage = MemoryStorage();
      final store = DailyStore(storage);
      await store.saveStreak(const StreakState(current: 3, best: 3, lastCompleted: '2026-10-01'));
      await store.saveCachedPuzzle(puzzle('2026-10-01'));
      expect(store.streak().current, 3);
      expect(store.cachedPuzzle()!.date, '2026-10-01');
      storage.data.updateAll((_, __) => '{not json');
      expect(store.streak(), const StreakState());
      expect(store.cachedPuzzle(), isNull);
      expect(store.answers('2026-10-01'), [null, null, null]);
    });
  });

  group('DailyRepositoryImpl', () {
    test('returns the fetched puzzle and caches it', () async {
      final store = DailyStore(MemoryStorage());
      final repo = DailyRepositoryImpl(FakeRemote(result: puzzle('2026-10-01')), store, now: () => DateTime.utc(2026, 10, 1, 9));
      expect((await repo.today()).date, '2026-10-01');
      expect(store.cachedPuzzle()!.date, '2026-10-01');
    });

    test('offline with today\'s cached puzzle serves the cache', () async {
      final store = DailyStore(MemoryStorage());
      await store.saveCachedPuzzle(puzzle('2026-10-01'));
      final repo = DailyRepositoryImpl(FakeRemote(error: NetworkException(message: 'offline')), store, now: () => DateTime.utc(2026, 10, 1, 20, 59));
      expect((await repo.today()).date, '2026-10-01');
    });

    test('offline after local midnight (UTC+3) never serves yesterday\'s puzzle as today\'s', () async {
      final store = DailyStore(MemoryStorage());
      await store.saveCachedPuzzle(puzzle('2026-10-01'));
      final repo = DailyRepositoryImpl(FakeRemote(error: NetworkException(message: 'offline')), store, now: () => DateTime.utc(2026, 10, 1, 21, 0));
      expect(repo.today(), throwsA(isA<NetworkException>()));
    });

    test('offline with no cache rethrows the original error', () async {
      final repo = DailyRepositoryImpl(FakeRemote(error: NetworkException(message: 'offline')), DailyStore(MemoryStorage()), now: () => DateTime.utc(2026, 10, 1));
      expect(repo.today(), throwsA(isA<NetworkException>()));
    });

    test('a malformed server body counts as a failure and falls back to the cache', () async {
      final store = DailyStore(MemoryStorage());
      await store.saveCachedPuzzle(puzzle('2026-10-01'));
      final repo = DailyRepositoryImpl(FakeRemote(error: const FormatException('bad')), store, now: () => DateTime.utc(2026, 10, 1, 9));
      expect((await repo.today()).date, '2026-10-01');
    });
  });
}
```

- [ ] **Step 2: Run to verify failure**

Run: `flutter test test/features/daily/daily_repository_test.dart`
Expected: FAIL, missing imports.

- [ ] **Step 3: Implement**

`daily_store.dart`:

```dart
import 'dart:convert';

import 'package:e3rbly/core/storage/c.dart';
import 'package:e3rbly/features/daily/domain/entities/daily_puzzle.dart';
import 'package:e3rbly/features/daily/domain/streak/streak_state.dart';

/// Local-only progress: the last fetched puzzle (offline), answers per date, and the streak.
class DailyStore {
  DailyStore(this._storage);

  final LocalStorage _storage;

  static const _puzzleKey = 'daily.puzzle';
  static const _answersKey = 'daily.answers';
  static const _streakKey = 'daily.streak';
  static const _keepDates = 30;

  Map<String, dynamic>? _readMap(String key) {
    try {
      final raw = _storage.getData(key);
      if (raw == null) return null;
      final decoded = jsonDecode(raw);
      return decoded is Map<String, dynamic> ? decoded : null;
    } catch (_) {
      return null;
    }
  }

  DailyPuzzle? cachedPuzzle() {
    final map = _readMap(_puzzleKey);
    if (map == null) return null;
    try {
      return DailyPuzzle.fromJson(map);
    } catch (_) {
      return null;
    }
  }

  Future<void> saveCachedPuzzle(DailyPuzzle puzzle) => _storage.saveData(_puzzleKey, jsonEncode(puzzle.toJson()));

  List<int?> answers(String date) {
    final raw = _readMap(_answersKey)?[date];
    if (raw is List && raw.length == 3) {
      return raw.map<int?>((v) => v is int && v >= 0 && v <= 3 ? v : null).toList();
    }
    return [null, null, null];
  }

  Future<void> saveAnswers(String date, List<int?> answers) async {
    final all = _readMap(_answersKey) ?? <String, dynamic>{};
    all[date] = answers;
    final dates = all.keys.toList()..sort();
    for (final old in dates.take(dates.length > _keepDates ? dates.length - _keepDates : 0)) {
      all.remove(old);
    }
    await _storage.saveData(_answersKey, jsonEncode(all));
  }

  StreakState streak() {
    final map = _readMap(_streakKey);
    return map == null ? const StreakState() : StreakState.fromJson(map);
  }

  Future<void> saveStreak(StreakState state) => _storage.saveData(_streakKey, jsonEncode(state.toJson()));
}
```

`daily_remote_data_source.dart`:

```dart
import 'package:e3rbly/core/network/api_client.dart';
import 'package:e3rbly/features/daily/domain/entities/daily_puzzle.dart';

abstract class DailyRemoteDataSource {
  Future<DailyPuzzle> fetchToday();
}

/// Talks to the public, read-only `/v1/daily/today` route (no auth, no AI).
class DailyRemoteDataSourceImpl implements DailyRemoteDataSource {
  DailyRemoteDataSourceImpl(this._client);

  final ApiClient _client;

  @override
  Future<DailyPuzzle> fetchToday() async {
    final json = await _client.get('/v1/daily/today');
    if (json is! Map<String, dynamic>) throw const FormatException('unexpected body');
    return DailyPuzzle.fromJson(json);
  }
}
```

`daily_repository.dart`:

```dart
import 'package:e3rbly/features/daily/data/daily_remote_data_source.dart';
import 'package:e3rbly/features/daily/data/daily_store.dart';
import 'package:e3rbly/features/daily/domain/entities/daily_puzzle.dart';
import 'package:e3rbly/features/daily/domain/local_day.dart';

abstract class DailyRepository {
  Future<DailyPuzzle> today();
}

class DailyRepositoryImpl implements DailyRepository {
  DailyRepositoryImpl(this._remote, this._store, {DateTime Function()? now}) : _now = now ?? DateTime.now;

  final DailyRemoteDataSource _remote;
  final DailyStore _store;
  final DateTime Function() _now;

  @override
  Future<DailyPuzzle> today() async {
    try {
      final puzzle = await _remote.fetchToday();
      await _store.saveCachedPuzzle(puzzle);
      return puzzle;
    } catch (_) {
      final cached = _store.cachedPuzzle();
      // Only today's own puzzle may be served offline; yesterday's would let the same puzzle be replayed for credit.
      if (cached != null && cached.date == localDayString(_now())) return cached;
      rethrow;
    }
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `flutter test test/features/daily`
Expected: all PASS. (If `NetworkException`'s constructor differs, match `lib/core/errors/exceptions.dart`; the Quran cubit tests build it as `NetworkException(message: '...')`.)

- [ ] **Step 5: Commit**

```bash
git add lib/features/daily test/features/daily
git commit -m "feat(daily): local store, remote data source and repository with offline rule

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: DailyCubit

**Files:**
- Create: `lib/features/daily/presentation/cubit/daily_state.dart`, `lib/features/daily/presentation/cubit/daily_cubit.dart`, `test/features/daily/daily_cubit_test.dart`

**Interfaces:**
- Consumes: `DailyRepository`, `DailyStore`, `StreakEngine`, `buildShareText`, `treeStage`.
- Produces:
  `sealed class DailyState`: `DailyLoading`, `DailyFailure(String message)`, `DailyReady({required DailyPuzzle puzzle, required List<int?> answers, required StreakState streak, required int shownStreak})`.
  `DailyReady` getters: `bool get completed` (all three answered), `List<bool> get results` (only meaningful when answered; unanswered = false), `int? get nextTarget` (first unanswered index or null), `String get shareText`, `int get treeStageIndex`.
  `class DailyCubit extends Cubit<DailyState> { DailyCubit(DailyRepository, DailyStore, {StreakEngine engine = const StreakEngine(), DateTime Function()? now}); Future<void> load(); Future<void> answer(int target, int option); }`
  `answer` ignores: a non-Ready state, an already answered target, out-of-range indices. It persists the answers after every tap; when the third answer lands it applies `StreakEngine.complete(store.streak(), puzzle.date)`, saves the streak, and emits Ready with the new streak.

- [ ] **Step 1: Write the failing tests**

`test/features/daily/daily_cubit_test.dart`:

```dart
import 'package:e3rbly/core/errors/exceptions.dart';
import 'package:e3rbly/features/daily/data/daily_repository.dart';
import 'package:e3rbly/features/daily/data/daily_store.dart';
import 'package:e3rbly/features/daily/domain/entities/daily_puzzle.dart';
import 'package:e3rbly/features/daily/domain/streak/streak_state.dart';
import 'package:e3rbly/features/daily/presentation/cubit/daily_cubit.dart';
import 'package:e3rbly/features/daily/presentation/cubit/daily_state.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes/memory_storage.dart';

DailyPuzzle puzzle(String date) => DailyPuzzle.fromJson({
  'dayNumber': 12,
  'date': date,
  'expiresAt': '${date}T21:00:00.000Z',
  'reviewStatus': 'unreviewed',
  'notice': 'n',
  'puzzle': {
    'id': 'd-12',
    'sentence': 'قرأ الطالب الدرس',
    // correct answers: target0 -> 0, target1 -> 1, target2 -> 2
    'targets': List.generate(3, (i) => {'word': 'w$i', 'options': ['a', 'b', 'c', 'd'], 'correctIndex': i, 'explanation': 'e'}),
  },
});

class FakeRepo implements DailyRepository {
  FakeRepo(this.result);
  Object result;
  @override
  Future<DailyPuzzle> today() async {
    final r = result;
    if (r is DailyPuzzle) return r;
    throw r;
  }
}

void main() {
  test('load shows the puzzle with empty answers and the stored streak', () async {
    final store = DailyStore(MemoryStorage());
    await store.saveStreak(const StreakState(current: 4, best: 4, lastCompleted: '2026-10-11'));
    final cubit = DailyCubit(FakeRepo(puzzle('2026-10-12')), store);
    await cubit.load();
    final s = cubit.state as DailyReady;
    expect(s.answers, [null, null, null]);
    expect(s.completed, isFalse);
    expect(s.nextTarget, 0);
    expect(s.shownStreak, 4);
  });

  test('a failure shows a friendly Arabic message, not the raw exception', () async {
    final cubit = DailyCubit(FakeRepo(NetworkException(message: 'SocketException: Failed host lookup')), DailyStore(MemoryStorage()));
    await cubit.load();
    final m = (cubit.state as DailyFailure).message;
    expect(m, isNot(contains('Socket')));
    expect(m, matches(RegExp(r'[؀-ۿ]')));
  });

  test('answering all three completes once and extends the streak', () async {
    final store = DailyStore(MemoryStorage());
    await store.saveStreak(const StreakState(current: 4, best: 4, lastCompleted: '2026-10-11'));
    final cubit = DailyCubit(FakeRepo(puzzle('2026-10-12')), store);
    await cubit.load();
    await cubit.answer(0, 0);
    await cubit.answer(1, 3);
    expect((cubit.state as DailyReady).completed, isFalse);
    await cubit.answer(2, 2);
    final s = cubit.state as DailyReady;
    expect(s.completed, isTrue);
    expect(s.results, [true, false, true]);
    expect(s.streak.current, 5);
    expect(store.streak().current, 5);
    expect(s.shareText, contains('🟩🟥🟩'));
  });

  test('an answered target cannot be changed (no retry advantage)', () async {
    final cubit = DailyCubit(FakeRepo(puzzle('2026-10-12')), DailyStore(MemoryStorage()));
    await cubit.load();
    await cubit.answer(0, 3); // wrong
    await cubit.answer(0, 0); // try to change to the right one
    expect((cubit.state as DailyReady).answers[0], 3);
  });

  test('answers survive leaving the app and reopening', () async {
    final store = DailyStore(MemoryStorage());
    final first = DailyCubit(FakeRepo(puzzle('2026-10-12')), store);
    await first.load();
    await first.answer(0, 2);
    final second = DailyCubit(FakeRepo(puzzle('2026-10-12')), store);
    await second.load();
    expect((second.state as DailyReady).answers, [2, null, null]);
    await second.answer(0, 0); // still locked
    expect((second.state as DailyReady).answers[0], 2);
  });

  test('reopening a completed day and tapping again counts the streak once', () async {
    final store = DailyStore(MemoryStorage());
    final cubit = DailyCubit(FakeRepo(puzzle('2026-10-12')), store);
    await cubit.load();
    for (var i = 0; i < 3; i++) await cubit.answer(i, i);
    expect(store.streak().current, 1);
    final again = DailyCubit(FakeRepo(puzzle('2026-10-12')), store);
    await again.load();
    for (var i = 0; i < 3; i++) await again.answer(i, 0);
    expect(store.streak().current, 1);
    expect((again.state as DailyReady).completed, isTrue);
  });

  test('out-of-range taps are ignored', () async {
    final cubit = DailyCubit(FakeRepo(puzzle('2026-10-12')), DailyStore(MemoryStorage()));
    await cubit.load();
    await cubit.answer(5, 0);
    await cubit.answer(0, 9);
    await cubit.answer(-1, 0);
    expect((cubit.state as DailyReady).answers, [null, null, null]);
  });
}
```

- [ ] **Step 2: Run to verify failure**

Run: `flutter test test/features/daily/daily_cubit_test.dart`
Expected: FAIL, missing imports.

- [ ] **Step 3: Implement**

`daily_state.dart`:

```dart
import 'package:e3rbly/features/daily/domain/entities/daily_puzzle.dart';
import 'package:e3rbly/features/daily/domain/share_text.dart';
import 'package:e3rbly/features/daily/domain/streak/streak_state.dart';
import 'package:e3rbly/features/daily/domain/streak/tree_stage.dart';
import 'package:equatable/equatable.dart';

sealed class DailyState extends Equatable {
  const DailyState();
  @override
  List<Object?> get props => [];
}

class DailyLoading extends DailyState {
  const DailyLoading();
}

class DailyFailure extends DailyState {
  const DailyFailure(this.message);

  /// Friendly Arabic text; the technical error stays out of the UI.
  final String message;

  @override
  List<Object?> get props => [message];
}

class DailyReady extends DailyState {
  const DailyReady({required this.puzzle, required this.answers, required this.streak, required this.shownStreak});

  final DailyPuzzle puzzle;
  final List<int?> answers;
  final StreakState streak;
  final int shownStreak;

  bool get completed => answers.every((a) => a != null);

  int? get nextTarget {
    final i = answers.indexWhere((a) => a == null);
    return i < 0 ? null : i;
  }

  List<bool> get results => [for (var i = 0; i < puzzle.targets.length; i++) answers[i] == puzzle.targets[i].correctIndex];

  int get treeStageIndex => treeStage(completed ? streak.current : shownStreak);

  String get shareText => buildShareText(dayNumber: puzzle.dayNumber, results: results, streak: streak.current);

  @override
  List<Object?> get props => [puzzle, answers, streak, shownStreak];
}
```

All later tasks use `treeStageIndex` (it calls the pure function `treeStage(int)` from Task 2).

`daily_cubit.dart`:

```dart
import 'package:e3rbly/features/daily/data/daily_repository.dart';
import 'package:e3rbly/features/daily/data/daily_store.dart';
import 'package:e3rbly/features/daily/domain/streak/streak_engine.dart';
import 'package:e3rbly/features/daily/presentation/cubit/daily_state.dart';
import 'package:e3rbly/utils/handlers/api_error_handler.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

class DailyCubit extends Cubit<DailyState> {
  DailyCubit(this._repository, this._store, {StreakEngine engine = const StreakEngine()}) : _engine = engine, super(const DailyLoading());

  final DailyRepository _repository;
  final DailyStore _store;
  final StreakEngine _engine;

  Future<void> load() async {
    emit(const DailyLoading());
    try {
      final puzzle = await _repository.today();
      final streak = _store.streak();
      emit(DailyReady(puzzle: puzzle, answers: _store.answers(puzzle.date), streak: streak, shownStreak: _engine.shownStreak(streak, puzzle.date)));
    } catch (e) {
      if (kDebugMode) debugPrint('Daily puzzle failed: $e');
      emit(DailyFailure(ApiErrorHandler.getErrorMessage(e)));
    }
  }

  Future<void> answer(int target, int option) async {
    final s = state;
    if (s is! DailyReady) return;
    if (target < 0 || target >= s.puzzle.targets.length) return;
    if (option < 0 || option >= s.puzzle.targets[target].options.length) return;
    if (s.answers[target] != null) return; // one try per word

    final answers = [...s.answers]..[target] = option;
    await _store.saveAnswers(s.puzzle.date, answers);

    var streak = s.streak;
    if (answers.every((a) => a != null)) {
      streak = _engine.complete(streak, s.puzzle.date); // idempotent for a date already counted
      await _store.saveStreak(streak);
    }
    emit(DailyReady(puzzle: s.puzzle, answers: answers, streak: streak, shownStreak: _engine.shownStreak(streak, s.puzzle.date)));
  }
}
```

Streak days come from `puzzle.date`, so the cubit takes no clock.

- [ ] **Step 4: Run to verify pass**

Run: `flutter test test/features/daily`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/features/daily test/features/daily
git commit -m "feat(daily): DailyCubit with one-try answers, persistence and idempotent streak

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Dependency injection, route, entry points

**Files:**
- Create: `lib/features/daily/daily_injection.dart`, `test/features/daily/daily_wiring_test.dart`
- Modify: `lib/core/di/injection.dart` (add `import '../../features/daily/daily_injection.dart';` next to the Quran import and call `initDailyFeature(getIt);` next to `initQuranFeature(getIt);`), `lib/router/AppRouter.dart` (add `static const String daily = '/daily';` and `daily: (context) => const DailyPage(),`)

**Interfaces:**
- Consumes: `ApiClient`, `LocalStorage` registered in `injection.dart`.
- Produces: `void initDailyFeature(GetIt getIt)` registering `DailyRemoteDataSource`, `DailyStore`, `DailyRepository` (lazy singletons) and `DailyCubit` (factory). `AppRouter.daily == '/daily'`. `DailyPage` is created in Task 6 (this task adds a temporary `DailyPage` stub returning `SizedBox.shrink()` so the route compiles; Task 6 replaces it).

- [ ] **Step 1: Write the failing test**

```dart
import 'package:e3rbly/core/network/api_client.dart';
import 'package:e3rbly/core/storage/c.dart';
import 'package:e3rbly/features/daily/daily_injection.dart';
import 'package:e3rbly/features/daily/data/daily_repository.dart';
import 'package:e3rbly/features/daily/presentation/cubit/daily_cubit.dart';
import 'package:e3rbly/router/AppRouter.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get_it/get_it.dart';
import 'package:http/http.dart' as http;

import 'fakes/memory_storage.dart';

void main() {
  test('initDailyFeature registers the repository and a fresh cubit per request', () {
    final getIt = GetIt.asNewInstance();
    getIt.registerLazySingleton<ApiClient>(() => ApiClient(httpClient: http.Client()));
    getIt.registerLazySingleton<LocalStorage>(() => MemoryStorage());
    initDailyFeature(getIt);
    expect(getIt<DailyRepository>(), isNotNull);
    expect(identical(getIt<DailyCubit>(), getIt<DailyCubit>()), isFalse);
  });

  test('the /daily route exists', () {
    expect(AppRouter.daily, '/daily');
    expect(AppRouter.routes.containsKey(AppRouter.daily), isTrue);
  });
}
```
(If `AppRouter` exposes its route map under another name than `routes`, use that name; read `lib/router/AppRouter.dart` line 40-55 first.)

- [ ] **Step 2: Run to verify failure** — `flutter test test/features/daily/daily_wiring_test.dart` -> FAIL (missing file/symbol).

- [ ] **Step 3: Implement**

`daily_injection.dart`:

```dart
import 'package:e3rbly/core/network/api_client.dart';
import 'package:e3rbly/core/storage/c.dart';
import 'package:e3rbly/features/daily/data/daily_remote_data_source.dart';
import 'package:e3rbly/features/daily/data/daily_repository.dart';
import 'package:e3rbly/features/daily/data/daily_store.dart';
import 'package:e3rbly/features/daily/presentation/cubit/daily_cubit.dart';
import 'package:get_it/get_it.dart';

void initDailyFeature(GetIt getIt) {
  getIt.registerLazySingleton<DailyRemoteDataSource>(() => DailyRemoteDataSourceImpl(getIt<ApiClient>()));
  getIt.registerLazySingleton<DailyStore>(() => DailyStore(getIt<LocalStorage>()));
  getIt.registerLazySingleton<DailyRepository>(() => DailyRepositoryImpl(getIt<DailyRemoteDataSource>(), getIt<DailyStore>()));
  getIt.registerFactory<DailyCubit>(() => DailyCubit(getIt<DailyRepository>(), getIt<DailyStore>()));
}
```

Stub `lib/features/daily/presentation/pages/daily_page.dart`:

```dart
import 'package:flutter/widgets.dart';

class DailyPage extends StatelessWidget {
  const DailyPage({super.key});
  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
```

Add the route and DI call as described in Files.

- [ ] **Step 4: Run to verify pass** — `flutter test test/features/daily` -> PASS; `flutter analyze` -> no new issues beyond baseline.

- [ ] **Step 5: Commit**

```bash
git add lib test
git commit -m "feat(daily): dependency injection and /daily route

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The screen, entry card and overflow matrix

**Files:**
- Create: `lib/features/daily/presentation/pages/daily_page.dart` (replaces the stub), `lib/features/daily/presentation/widgets/question_card.dart`, `streak_tree.dart`, `result_summary.dart`, `daily_entry_card.dart`, `test/features/daily/daily_widgets_test.dart`
- Modify: `pubspec.yaml` (`flutter pub add share_plus`), `lib/components/e3rbly_drawer.dart` (drawer item "إعراب اليوم" next to the Quran item at line ~185, `Navigator.pushNamed(context, AppRouter.daily)`), `lib/features/home/presentation/widgets/home_page_content.dart` (place `DailyEntryCard` above the input area)

**Interfaces:**
- Consumes: `DailyCubit`/`DailyState` (Task 4), `AppTheme`, `AppTextStyles` (as in `tanzil_attribution.dart`), `share_plus` (`SharePlus.instance.share(ShareParams(text: ...))` on current versions; use the API of the installed version).
- Produces: `DailyPage` (creates `BlocProvider(create: (_) => getIt<DailyCubit>()..load())`) wrapping `DailyView`; `DailyView` renders `DailyLoading` (spinner), `DailyFailure` (message + retry button calling `load()`), `DailyReady`:
  - header: "إعراب اليوم" + `#dayNumber`; `StreakTree` (flame + number, tree stage name, freezes);
  - the server `notice` in a visible banner while `puzzle.isUnreviewed`;
  - the sentence, with the current target word highlighted;
  - one `QuestionCard` at a time for `nextTarget`: "ما إعراب كلمة «word»؟" + 4 option buttons (min 48 dp); after tapping, the card shows correct/incorrect colouring and the explanation and a "التالي" button;
  - when `completed`: `ResultSummary` (squares, every explanation, share button, streak and tree, tomorrow hint).
  `DailyEntryCard` is a compact card for the home screen: streak, "اليوم: تم / لم يُحل بعد", tap opens `/daily`; it reads state through a small `DailyEntryCubit`-free path: `getIt<DailyStore>()` and `StreakEngine` directly in a `StatelessWidget` (no network call on the home screen).

- [ ] **Step 1: Write the failing widget tests**

`test/features/daily/daily_widgets_test.dart` (reuse the harness idea from `test/features/quran/quran_widgets_test.dart`):

```dart
import 'package:e3rbly/features/daily/data/daily_repository.dart';
import 'package:e3rbly/features/daily/data/daily_store.dart';
import 'package:e3rbly/features/daily/domain/entities/daily_puzzle.dart';
import 'package:e3rbly/features/daily/presentation/cubit/daily_cubit.dart';
import 'package:e3rbly/features/daily/presentation/pages/daily_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes/memory_storage.dart';

const longOption = 'فاعل مرفوع وعلامة رفعه الواو لأنه جمع مذكر سالم وهو مضاف إلى ما بعده';

DailyPuzzle puzzle({String status = 'unreviewed'}) => DailyPuzzle.fromJson({
  'dayNumber': 12,
  'date': '2026-10-12',
  'expiresAt': '2026-10-12T21:00:00.000Z',
  'reviewStatus': status,
  if (status == 'unreviewed') 'notice': 'أسئلة اليوم قيد المراجعة اللغوية وقد تحتوي على أخطاء.',
  'puzzle': {
    'id': 'd-12',
    'sentence': 'كتب المعلمون الدرس في الصباح الباكر',
    'targets': List.generate(3, (i) => {'word': 'كلمة$i', 'options': [longOption, 'مفعول به منصوب وعلامة نصبه الفتحة', 'ب', 'ج'], 'correctIndex': i == 0 ? 0 : 1, 'explanation': 'شرح مطول لسبب الإعراب يمتد على أكثر من سطر ليختبر تمدد البطاقة عند تكبير الخط'}),
  },
});

class FakeRepo implements DailyRepository {
  FakeRepo(this.p);
  final DailyPuzzle p;
  @override
  Future<DailyPuzzle> today() async => p;
}

Widget wrap(Widget child, {double textScale = 1.0}) => MaterialApp(
  locale: const Locale('ar'),
  builder: (context, app) => MediaQuery(
    data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale)),
    child: Directionality(textDirection: TextDirection.rtl, child: app!),
  ),
  home: child,
);

Widget screen(DailyPuzzle p) => BlocProvider(create: (_) => DailyCubit(FakeRepo(p), DailyStore(MemoryStorage()))..load(), child: const DailyView());

const sizes = [Size(320, 568), Size(360, 640), Size(412, 915), Size(844, 390), Size(768, 1024), Size(1280, 800)];

void main() {
  testWidgets('shows the review notice while unreviewed and hides it when reviewed', (t) async {
    await t.pumpWidget(wrap(screen(puzzle())));
    await t.pumpAndSettle();
    expect(find.textContaining('قيد المراجعة'), findsOneWidget);
    await t.pumpWidget(wrap(screen(puzzle(status: 'reviewed'))));
    await t.pumpAndSettle();
    expect(find.textContaining('قيد المراجعة'), findsNothing);
  });

  testWidgets('answer, see the explanation, continue, finish, see the result and share', (t) async {
    await t.pumpWidget(wrap(screen(puzzle())));
    await t.pumpAndSettle();
    expect(find.textContaining('كلمة0'), findsWidgets);
    for (var i = 0; i < 3; i++) {
      await t.tap(find.text(i == 0 ? longOption : 'مفعول به منصوب وعلامة نصبه الفتحة').first);
      await t.pumpAndSettle();
      expect(find.textContaining('شرح مطول'), findsOneWidget);
      await t.tap(find.text(i == 2 ? 'النتيجة' : 'التالي'));
      await t.pumpAndSettle();
    }
    expect(find.text('مشاركة'), findsOneWidget);
    expect(find.textContaining('🟩'), findsWidgets);
  });

  for (final size in sizes) {
    for (final scale in [1.0, 1.5]) {
      testWidgets('no overflow at ${size.width.toInt()}x${size.height.toInt()} text x$scale (question and result)', (t) async {
        t.view.physicalSize = size;
        t.view.devicePixelRatio = 1;
        addTearDown(t.view.reset);
        await t.pumpWidget(wrap(screen(puzzle()), textScale: scale));
        await t.pumpAndSettle();
        expect(t.takeException(), isNull);
        for (var i = 0; i < 3; i++) {
          await t.tap(find.text('مفعول به منصوب وعلامة نصبه الفتحة').first);
          await t.pumpAndSettle();
          expect(t.takeException(), isNull);
          await t.tap(find.text(i == 2 ? 'النتيجة' : 'التالي'));
          await t.pumpAndSettle();
        }
        expect(t.takeException(), isNull);
      });
    }
  }
}
```
(The overflow test must load the app font like the Quran matrix does so Ahem does not create false overflows; copy that setup from `test/features/quran/quran_widgets_test.dart` if it has a font-loading step.)

- [ ] **Step 2: Run to verify failure** — `flutter test test/features/daily/daily_widgets_test.dart` -> FAIL (`DailyView` undefined).

- [ ] **Step 3: Implement the widgets**

Write `DailyPage`/`DailyView`, `QuestionCard`, `StreakTree`, `ResultSummary`, `DailyEntryCard` per the Interfaces block. Rules the code must follow (they are what the tests check): options are full-width `InkWell` buttons with `ConstrainedBox(constraints: BoxConstraints(minHeight: 48))` and wrapping `Text` (never a fixed height); the body is a `SingleChildScrollView` inside `SafeArea` with a max content width of 640 centred; the explanation and the next button appear only after the tap; the last card's button reads "النتيجة", the others "التالي"; the share button is labelled "مشاركة" and calls `SharePlus.instance.share(ShareParams(text: state.shareText))`; the tree is drawn with an `Icon` per stage (`Icons.grass`, `Icons.eco`, `Icons.park`, `Icons.forest`, ...) inside a circle, plus `treeStageName(stage)`, so no image assets are needed; colours come from `AppTheme()` like `tanzil_attribution.dart`, correct = green, wrong = red, always with an icon as well (never colour alone).

- [ ] **Step 4: Run to verify pass** — `flutter test test/features/daily` -> all PASS including the 24 matrix tests. Fix layout, never the tests' thresholds.

- [ ] **Step 5: Wire the entry points and commit**

Add the drawer item and the home `DailyEntryCard` (both call `Navigator.pushNamed(context, AppRouter.daily)`), then run the existing drawer and home tests (`flutter test test/components test/features`) to confirm nothing else broke.

```bash
git add pubspec.yaml pubspec.lock lib test
git commit -m "feat(daily): daily puzzle screen, streak tree, result share, home and drawer entry

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Daily reminder

**Files:**
- Create: `lib/features/daily/reminder/reminder_scheduler.dart`, `test/features/daily/reminder_test.dart`
- Modify: `pubspec.yaml` (`flutter pub add flutter_local_notifications timezone flutter_timezone`), `android/app/src/main/AndroidManifest.xml` (permission and receivers exactly as the installed `flutter_local_notifications` README lists for scheduled notifications: `POST_NOTIFICATIONS`, the two receivers, and no exact-alarm permission), `lib/features/daily/daily_injection.dart` (register `ReminderScheduler`), `lib/features/daily/presentation/widgets/result_summary.dart` and the ready view (a "ذكّرني يوميا" switch + time picker row)

**Interfaces:**
- Produces: `abstract class ReminderScheduler { Future<bool> enable({required int hour, required int minute}); Future<void> disable(); bool get isEnabled; int get hour; int get minute; }` plus `LocalNotificationsReminder` (real) storing the choice in `LocalStorage` (`daily.reminder`), scheduling one repeating daily notification (`matchDateTimeComponents: DateTimeComponents.time`, inexact scheduling so no exact-alarm permission is needed). `enable` returns `false` (and stays disabled) when the user refuses the notification permission; permission is requested only inside `enable`, never at app start. The notification text is fixed Arabic ("إعراب اليوم جاهز، ٣ كلمات فقط!") and never contains puzzle content.
- The "skip if today's puzzle is done" rule of the spec is implemented by cancelling today's pending notification when the puzzle is completed and re-arming the repeating one for the next day: `DailyCubit` calls `reminder.onCompleted()` (add `Future<void> onCompleted()` to the interface: disable-then-enable for tomorrow when enabled).

- [ ] **Step 1: Write the failing test** with a `FakeReminder` implementing the interface and `MemoryStorage`: enabling stores hour/minute and `isEnabled == true`; refusing permission leaves it disabled and returns false; `disable` clears it; `onCompleted` when enabled keeps it enabled and reschedules (assert via a call counter on the fake plugin wrapper); `DailyCubit` calls `onCompleted` exactly once when the third answer lands and never on the first two.
- [ ] **Step 2: Run to verify failure** — `flutter test test/features/daily/reminder_test.dart` -> FAIL.
- [ ] **Step 3: Implement** the interface, the plugin wrapper behind a small `NotificationsPort` (so tests never touch the plugin), the cubit hook (optional constructor argument `ReminderScheduler? reminder`), and the UI switch. Initialise `tz` data and the local timezone (`flutter_timezone`) inside `LocalNotificationsReminder.enable` (lazy), not in `main()`.
- [ ] **Step 4: Run to verify pass** — `flutter test test/features/daily` -> PASS; `flutter analyze` -> baseline.
- [ ] **Step 5: Commit**

```bash
git add pubspec.yaml pubspec.lock android lib test
git commit -m "feat(daily): opt-in daily reminder with no exact-alarm permission

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Whole-app checks, docs, debug build

**Files:**
- Modify: `docs/` in the mobile repo if it has one, otherwise `README.md` (a short "Daily I'rab" section); backend `docs/PROGRESS.md` (one row)

- [ ] **Step 1:** `flutter test` (whole app). Expected: every test passes (506 existing + the new daily tests).
- [ ] **Step 2:** `flutter analyze`. Expected: 0 errors and no more issues than the recorded baseline of 193.
- [ ] **Step 3:** Build the debug APK: `flutter build apk --debug`. Expected: builds (the debug manifest already allows cleartext; the release build is not touched).
- [ ] **Step 4:** Write the on-device checklist into the README section, for the owner to run: today's puzzle loads; answering locks a word; killing the app mid-puzzle keeps answers; airplane mode after loading still shows today's puzzle, and tomorrow (after 00:00 UTC+3) without internet shows the friendly error, never yesterday's puzzle; the share text has no answers; reminder permission dialog appears only after switching the reminder on; the notice is visible.
- [ ] **Step 5: Commit** and stop. Merge to `main` and building a release are the owner's decision.

```bash
git add -A
git commit -m "docs(daily): README section and on-device checklist

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage (Part B mobile):** fetch and cache with offline behaviour (T3), 3-word puzzle with options/explanations (T6), streak with freezes and timezone-safe day math (T2, T4), tree (T2, T6), spoiler-free share (T2, T6; text form, see Deviations), reminder opt-in and skip-when-done (T7), home and drawer entry (T6), unreviewed notice always shown (T6), local-only progress (T3).
- **Type consistency:** `DailyPuzzle`, `PuzzleTarget`, `StreakState`, `StreakEngine.complete/shownStreak`, `treeStage`, `treeStageIndex`, `buildShareText`, `localDayString`, `DailyStore` method names, `DailyRepository.today`, and `DailyCubit.answer/load` are used identically across tasks.
- **Known limits:** a determined user can change the device clock to replay or fake dates only within the rules above (no credit for earlier dates, a far-forward jump resets); leaderboards would need accounts. Notifications and on-device behaviour cannot be verified without a phone; the checklist in Task 8 covers it.
