import { describe, it, expect } from "vitest";
import {
  WINDOW_AFTER_END_MINUTES,
  WINDOW_BEFORE_END_MINUTES,
  findBackToBackLoops,
  findBackToBacks,
  formatBackToBackLoop,
  formatBackToBackMatches,
} from "../ScheduleBuilder/backToBack";
import type { RaceTimes, Series } from "../../types";

function makeSeries(seriesId: number, seriesName: string, weeks: Record<number, RaceTimes | undefined>): Series {
  return {
    seriesId,
    seriesName,
    category: "sports_car",
    licenseClass: "C",
    setupType: "open",
    isMulticlass: false,
    totalWeeks: 12,
    raceTimeMinutes: null,
    isRepeating: true,
    cars: [],
    scheduleWeeks: Object.entries(weeks).map(([week, raceTimes]) => ({
      weekNumber: Number(week),
      seasonWeek: Number(week),
      trackId: 1,
      trackName: "Spa",
      rainChance: 0,
      rainEnabled: false,
      raceTimes,
    })),
  };
}

const repeating = (firstSessionTime: string, repeatMinutes: number, sessionMinutes: number | null): RaceTimes => ({
  kind: "repeating",
  firstSessionTime,
  repeatMinutes,
  sessionMinutes,
});

const scheduled = (sessionTimes: string[], sessionMinutes: number | null): RaceTimes => ({
  kind: "scheduled",
  sessionTimes,
  sessionMinutes,
});

const names = (pairs: { from: Series; to: Series }[]) => pairs.map((p) => `${p.from.seriesName} → ${p.to.seriesName}`);

describe("findBackToBacks", () => {
  // A: once a day at 10:00 for 30 min, so it ends at 10:30.
  const a = makeSeries(1, "A", { 1: repeating("10:00", 1440, 30) });

  it.each([
    ["10:24", false], // end − 6
    ["10:25", true], // end − 5
    ["10:30", true],
    ["10:45", true], // end + 15
    ["10:46", false], // end + 16
  ])("B starting at %s qualifies: %s", (bStart, qualifies) => {
    const b = makeSeries(2, "B", { 1: repeating(bStart, 1440, 30) });
    const aToB = findBackToBacks([a, b], 1).pairs.filter((p) => p.from === a);
    expect(aToB.length).toBe(qualifies ? 1 : 0);
  });

  it("is directional: A → B can qualify while B → A doesn't", () => {
    const b = makeSeries(2, "B", { 1: repeating("10:30", 1440, 45) });
    const { pairs } = findBackToBacks([b, a], 1);
    expect(names(pairs)).toEqual(["A → B"]);
    expect(pairs[0].matches).toEqual({ kind: "daily", occurrences: [{ fromMinute: 600, toMinute: 630 }] });
    // The pair carries A's session length, not B's.
    expect(pairs[0].sessionMinutes).toBe(30);
  });

  it("wraps windows past midnight for repeating series", () => {
    const late = makeSeries(1, "Late", { 1: repeating("23:45", 1440, 20) });
    const early = makeSeries(2, "Early", { 1: repeating("00:05", 1440, 20) });
    const { pairs } = findBackToBacks([late, early], 1);
    expect(names(pairs)).toEqual(["Late → Early"]);
    expect(pairs[0].matches).toEqual({ kind: "daily", occurrences: [{ fromMinute: 1425, toMinute: 1445 }] });
  });

  it("returns every daily occurrence on the around-the-clock grid", () => {
    const hourlyA = makeSeries(1, "A", { 1: repeating("00:30", 60, 15) });
    const hourlyB = makeSeries(2, "B", { 1: repeating("00:45", 60, 15) });
    const [pair] = findBackToBacks([hourlyA, hourlyB], 1).pairs;
    expect(pair.matches.kind).toBe("daily");
    expect(pair.matches.occurrences).toHaveLength(24);
    expect(pair.matches.occurrences[0]).toEqual({ fromMinute: 30, toMinute: 45 });
  });

  it("checks a repeating grid around scheduled instants, in both directions", () => {
    // Scheduled: 17:00–18:00 UTC. Repeating: :10 and :40 every hour, 20 min.
    const special = makeSeries(1, "Special", { 1: scheduled(["2026-02-14T17:00:00Z"], 60) });
    const sprint = makeSeries(2, "Sprint", { 1: repeating("00:10", 30, 20) });
    const { pairs } = findBackToBacks([special, sprint], 1);
    expect(names(pairs)).toEqual(["Special → Sprint", "Sprint → Special"]);
    expect(pairs[0].matches).toEqual({
      kind: "dated",
      occurrences: [{ fromStart: Date.parse("2026-02-14T17:00:00Z"), toStart: Date.parse("2026-02-14T18:10:00Z") }],
    });
    // Sprint 16:40 ends at 17:00, exactly when Special starts.
    expect(pairs[1].matches).toEqual({
      kind: "dated",
      occurrences: [{ fromStart: Date.parse("2026-02-14T16:40:00Z"), toStart: Date.parse("2026-02-14T17:00:00Z") }],
    });
  });

  it("compares scheduled instants against each other and deduplicates", () => {
    const first = makeSeries(1, "First", {
      1: scheduled(["2026-02-14T17:00:00Z", "2026-02-14T17:00:00Z", "2026-02-15T17:00:00Z"], 60),
    });
    // 18:10 on the 14th is in window; 19:00 on the 15th is 60 min late.
    const second = makeSeries(2, "Second", { 1: scheduled(["2026-02-14T18:10:00Z", "2026-02-15T19:00:00Z"], 60) });
    const { pairs } = findBackToBacks([first, second], 1);
    expect(names(pairs)).toEqual(["First → Second"]);
    expect(pairs[0].matches.occurrences).toEqual([
      { fromStart: Date.parse("2026-02-14T17:00:00Z"), toStart: Date.parse("2026-02-14T18:10:00Z") },
    ]);
  });

  it("matches a scheduled instant to a repeating grid across UTC midnight", () => {
    // Scheduled 23:50–00:10 UTC; the hourly grid's 00:10 next day qualifies.
    const late = makeSeries(1, "Late", { 1: scheduled(["2026-02-14T23:50:00Z"], 20) });
    const grid = makeSeries(2, "Grid", { 1: repeating("00:10", 60, 20) });
    const { pairs } = findBackToBacks([late, grid], 1);
    expect(names(pairs)).toEqual(["Late → Grid"]);
    expect(pairs[0].matches).toEqual({
      kind: "dated",
      occurrences: [{ fromStart: Date.parse("2026-02-14T23:50:00Z"), toStart: Date.parse("2026-02-15T00:10:00Z") }],
    });
    expect(formatBackToBackMatches(pairs[0].matches, pairs[0].sessionMinutes, { timeZone: "UTC" })).toEqual([
      "Sat 23:50 → ends Sun 00:10 → 00:10 (0 min gap)",
    ]);
  });

  it("excludes and reports series without usable start data", () => {
    const b = makeSeries(2, "B", { 1: repeating("10:30", 1440, 30) });
    const noTimes = makeSeries(3, "No times", { 1: undefined });
    const noLength = makeSeries(4, "No length", { 1: repeating("10:30", 1440, null) });
    const { pairs, missingStartTimes } = findBackToBacks([a, noTimes, b, noLength], 1);
    expect(names(pairs)).toEqual(["A → B"]);
    expect(missingStartTimes.map((s) => s.seriesName)).toEqual(["No times", "No length"]);
  });

  it("uses the schedule week whose seasonWeek matches", () => {
    const b = makeSeries(2, "B", { 1: repeating("10:30", 1440, 30), 2: repeating("18:00", 1440, 30) });
    const aBothWeeks = makeSeries(1, "A", { 1: repeating("10:00", 1440, 30), 2: repeating("10:00", 1440, 30) });
    expect(names(findBackToBacks([aBothWeeks, b], 1).pairs)).toEqual(["A → B"]);
    expect(findBackToBacks([aBothWeeks, b], 2).pairs).toEqual([]);
    // `a` has no week 2 entry at all.
    expect(findBackToBacks([a, b], 2).missingStartTimes).toEqual([a]);
  });
});

describe("formatBackToBackMatches", () => {
  const format = (from: Series, to: Series, timeZone: string, referenceDate?: Date) => {
    const pair = findBackToBacks([from, to], 1).pairs.find((p) => p.from === from)!;
    return formatBackToBackMatches(pair.matches, pair.sessionMinutes, { timeZone, referenceDate });
  };

  it("collapses hourly patterns to minutes past the hour, with A's end and the gap", () => {
    const a = makeSeries(1, "A", { 1: repeating("00:30", 60, 15) });
    const b = makeSeries(2, "B", { 1: repeating("00:45", 60, 15) });
    expect(format(a, b, "UTC")).toEqual([":30 → ends :45 → :45 (0 min gap) · hourly"]);
    expect(format(a, b, "Asia/Kolkata")).toEqual([":00 → ends :15 → :15 (0 min gap) · hourly"]);
  });

  it("wraps an end past the hour without a suffix when it is under an hour after A's start", () => {
    // A 25 min from :45 ends at :10; B at :15 starts 5 min later.
    const a = makeSeries(1, "A", { 1: repeating("00:45", 60, 25) });
    const b = makeSeries(2, "B", { 1: repeating("00:15", 60, 10) });
    expect(format(a, b, "UTC")).toEqual([":45 → ends :10 → :15 (5 min gap) · hourly"]);
    // A 50 min from :00 ends at :50; B at :55 starts 55 min after A.
    const c = makeSeries(3, "C", { 1: repeating("00:00", 60, 50) });
    const d = makeSeries(4, "D", { 1: repeating("00:55", 60, 10) });
    expect(format(c, d, "UTC")).toEqual([":00 → ends :50 → :55 (5 min gap) · hourly"]);
  });

  it("marks whole hours hidden by minutes-past-the-hour times on B's start", () => {
    // A 53 min from :30 ends at :23 (53 min later); B at :30 the next hour starts 60 min after A.
    const a = makeSeries(1, "A", { 1: repeating("00:30", 60, 53) });
    const b = makeSeries(2, "B", { 1: repeating("00:30", 60, 10) });
    expect(format(a, b, "UTC")).toEqual([":30 → ends :23 → :30 (+1h) (7 min gap) · hourly"]);
    // A at :10/:40 for 55 min ends at :05; B every 15 min starts 50 or 65 min after A.
    const halfHourly = makeSeries(3, "Half-hourly", { 1: repeating("00:10", 30, 55) });
    const quarterly = makeSeries(4, "Quarterly", { 1: repeating("00:00", 15, 10) });
    expect(format(halfHourly, quarterly, "UTC")).toEqual([
      ":10 → ends :05 → :00 (5 min overlap) · every 30 min",
      ":10 → ends :05 → :15 (+1h) (10 min gap) · every 30 min",
    ]);
  });

  it("marks whole hours on A's end too, in whole-hour and half-hour offset zones", () => {
    // A 65 min from :30 ends at :35 an hour on; B on :30 and :45 starts 60 or 75 min after A.
    const a = makeSeries(1, "A", { 1: repeating("00:30", 60, 65) });
    const b = makeSeries(2, "B", { 1: repeating("00:00", 15, 10) });
    expect(format(a, b, "UTC")).toEqual([
      ":30 → ends :35 (+1h) → :30 (+1h) (5 min overlap) · hourly",
      ":30 → ends :35 (+1h) → :45 (+1h) (10 min gap) · hourly",
    ]);
    expect(format(a, b, "Asia/Kolkata")).toEqual([
      ":00 → ends :05 (+1h) → :00 (+1h) (5 min overlap) · hourly",
      ":00 → ends :05 (+1h) → :15 (+1h) (10 min gap) · hourly",
    ]);
  });

  it("shows daily patterns with the offset in force at the reference date", () => {
    const a = makeSeries(1, "A", { 1: repeating("10:00", 1440, 30) });
    const b = makeSeries(2, "B", { 1: repeating("10:30", 1440, 30) });
    // UK clocks go back on 2026-10-25: BST (+1) before, GMT after.
    expect(format(a, b, "Europe/London", new Date("2026-10-19T00:00:00Z"))).toEqual([
      "11:00 → ends 11:30 → 11:30 (0 min gap) · daily",
    ]);
    expect(format(a, b, "Europe/London", new Date("2026-10-26T00:00:00Z"))).toEqual([
      "10:00 → ends 10:30 → 10:30 (0 min gap) · daily",
    ]);
  });

  it("shows multi-hour cadences from the first occurrence after local midnight", () => {
    // A every 2 h from 01:45 for 65 min ends at 02:50; B on the hour starts 10 min later.
    const a = makeSeries(1, "A", { 1: repeating("01:45", 120, 65) });
    const b = makeSeries(2, "B", { 1: repeating("00:00", 60, 30) });
    expect(format(a, b, "UTC")).toEqual(["01:45 → ends 02:50 → 03:00 (10 min gap) · every 2 h"]);
    // +05:30: 01:45 UTC is 07:15 local, whose first 2-hourly slot after midnight is 01:15.
    expect(format(a, b, "Asia/Kolkata")).toEqual(["01:15 → ends 02:20 → 02:30 (10 min gap) · every 2 h"]);
  });

  it("lists each distinct gap once for sub-hour cadences", () => {
    const a = makeSeries(1, "A", { 1: repeating("00:00", 30, 20) });
    const b = makeSeries(2, "B", { 1: repeating("00:15", 15, 20) });
    expect(format(a, b, "UTC")).toEqual([
      ":00 → ends :20 → :15 (5 min overlap) · every 30 min",
      ":00 → ends :20 → :30 (10 min gap) · every 30 min",
    ]);
  });

  it("shows once-a-day patterns as daily across midnight", () => {
    const late = makeSeries(1, "Late", { 1: repeating("23:45", 1440, 20) });
    const early = makeSeries(2, "Early", { 1: repeating("00:05", 1440, 20) });
    expect(format(late, early, "UTC")).toEqual(["23:45 → ends 00:05 → 00:05 (0 min gap) · daily"]);
    expect(format(late, early, "Asia/Kolkata")).toEqual(["05:15 → ends 05:35 → 05:35 (0 min gap) · daily"]);
  });

  it("lists scheduled occurrences with weekday and local time", () => {
    const special = makeSeries(1, "Special", {
      1: scheduled(["2026-02-14T17:00:00Z", "2026-02-14T18:00:00Z"], 60),
    });
    const sprint = makeSeries(2, "Sprint", { 1: repeating("00:15", 60, 20) });
    expect(format(special, sprint, "UTC")).toEqual([
      "Sat 17:00 → ends 18:00 → 18:15 (15 min gap)",
      "Sat 18:00 → ends 19:00 → 19:15 (15 min gap)",
    ]);
    // In +05:30 the second race's end crosses midnight, so the end gets the weekday.
    expect(format(special, sprint, "Asia/Kolkata")).toEqual([
      "Sat 22:30 → ends 23:30 → 23:45 (15 min gap)",
      "Sat 23:30 → ends Sun 00:30 → 00:45 (15 min gap)",
    ]);
  });

  it("groups every B start after the same scheduled A start onto one line", () => {
    // Sat 19:00 for 70 min ends at 20:10; both scheduled B starts qualify.
    const evening = makeSeries(1, "Evening", { 1: scheduled(["2026-02-14T19:00:00Z"], 70) });
    const pairOfStarts = makeSeries(2, "Pair", {
      1: scheduled(["2026-02-14T20:15:00Z", "2026-02-14T20:25:00Z", "2026-02-14T20:30:00Z"], 30),
    });
    expect(format(evening, pairOfStarts, "UTC")).toEqual(["Sat 19:00 → ends 20:10 → 20:15 (5 min gap), 20:25 (15 min gap)"]);
    // Tue 00:00 for 60 min ends at 01:00; the 15-min grid's 01:00 and 01:15 both qualify.
    const special = makeSeries(3, "Special", { 1: scheduled(["2026-02-17T00:00:00Z"], 60) });
    const grid = makeSeries(4, "Grid", { 1: repeating("00:00", 15, 20) });
    expect(format(special, grid, "UTC")).toEqual(["Tue 00:00 → ends 01:00 → 01:00 (0 min gap), 01:15 (15 min gap)"]);
    // Ends at 23:50: 23:45 and Sun 00:00 qualify, the weekday added once the day changes.
    const late = makeSeries(5, "Late", { 1: scheduled(["2026-02-14T23:30:00Z"], 20) });
    expect(format(late, grid, "UTC")).toEqual(["Sat 23:30 → ends 23:50 → 23:45 (5 min overlap), Sun 00:00 (10 min gap)"]);
  });

  it("adds a weekday whenever the day differs from the time before it", () => {
    // Sat 23:30 for 32 min ends Sun 00:02; B at Sat 23:58 overlaps, then Sun 00:15 follows.
    const late = makeSeries(1, "Late", { 1: scheduled(["2026-02-14T23:30:00Z"], 32) });
    const b = makeSeries(2, "B", { 1: scheduled(["2026-02-14T23:58:00Z", "2026-02-15T00:15:00Z"], 30) });
    expect(format(late, b, "UTC")).toEqual([
      "Sat 23:30 → ends Sun 00:02 → Sat 23:58 (4 min overlap), Sun 00:15 (13 min gap)",
    ]);
  });

  it("groups scheduled B starts by the repeating A start they follow", () => {
    // A every 15 min for 50: 00:00 (ends 00:50) reaches 01:00; 00:15 (ends 01:05) reaches both 01:00 and 01:10.
    const grid = makeSeries(1, "Grid", { 1: repeating("00:00", 15, 50) });
    const special = makeSeries(2, "Special", {
      1: scheduled(["2026-02-17T01:00:00Z", "2026-02-17T01:10:00Z"], 60),
    });
    expect(format(grid, special, "UTC")).toEqual([
      "Tue 00:00 → ends 00:50 → 01:00 (10 min gap)",
      "Tue 00:15 → ends 01:05 → 01:00 (5 min overlap), 01:10 (5 min gap)",
    ]);
  });

  it("prints exactly the real B-start-minus-A-end differences, always within the window", () => {
    const diffLabel = /\((\d+) min (gap|overlap)\)/g;
    const printedDiffs = (lines: string[]) =>
      lines.flatMap((line) =>
        [...line.matchAll(diffLabel)].map(([, n, kind]) => (kind === "gap" ? Number(n) : -Number(n))),
      );
    let checked = 0;
    const zones = ["UTC", "Asia/Kolkata", "America/St_Johns"];
    const grids = [15, 30, 60, 120, 1440];
    for (const repeatA of grids) {
      for (const repeatB of grids) {
        for (const sessionMinutes of [7, 20, 53, 65, 118]) {
          for (const firstB of ["00:00", "00:07", "00:44"]) {
            const a = makeSeries(1, "A", { 1: repeating("00:30", repeatA, sessionMinutes) });
            const b = makeSeries(2, "B", { 1: repeating(firstB, repeatB, 10) });
            const dated = makeSeries(3, "Dated", {
              1: scheduled(["2026-02-14T23:40:00Z", "2026-02-15T11:12:00Z"], sessionMinutes),
            });
            for (const [from, to] of [[a, b], [dated, b], [a, dated]]) {
              const pair = findBackToBacks([from, to], 1).pairs.find((p) => p.from === from);
              if (!pair) continue;
              const expected =
                pair.matches.kind === "daily"
                  ? pair.matches.occurrences.map((o) => o.toMinute - o.fromMinute - pair.sessionMinutes)
                  : pair.matches.occurrences.map(
                      (o) => (o.toStart - o.fromStart) / 60_000 - pair.sessionMinutes,
                    );
              const lines = formatBackToBackMatches(pair.matches, pair.sessionMinutes, {
                timeZone: zones[checked % zones.length],
                referenceDate: new Date("2026-02-16T00:00:00Z"),
              });
              const printed = printedDiffs(lines);
              for (const diff of printed) {
                expect(diff).toBeGreaterThanOrEqual(-WINDOW_BEFORE_END_MINUTES);
                expect(diff).toBeLessThanOrEqual(WINDOW_AFTER_END_MINUTES);
              }
              // Daily patterns collapse repeats, so compare distinct values; dated lines list every occurrence.
              if (pair.matches.kind === "daily") {
                expect(new Set(printed)).toEqual(new Set(expected));
              } else {
                expect(printed.sort((x, y) => x - y)).toEqual(expected.sort((x, y) => x - y));
              }
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe("findBackToBackLoops", () => {
  // Real 2026-S4 week 1: Mini Stock at :15/:45 for ~20 min, ARCA hourly at :45 for ~31 min.
  const mini = makeSeries(564, "Mini Stock", { 1: repeating("00:15", 30, 20) });
  const arca = makeSeries(167, "ARCA", { 1: repeating("00:45", 60, 31) });
  const loopNames = (loops: { series: Series[] }[]) => loops.map((l) => l.series.map((s) => s.seriesName).join(" → "));
  const utcLines = (series: Series[]) =>
    findBackToBackLoops(series, 1).loops.map((loop) => formatBackToBackLoop(loop, { timeZone: "UTC" }));

  it("finds the real Mini Stock ⇄ ARCA loop, once, whichever series comes first", () => {
    const loops = findBackToBackLoops([mini, arca], 1).loops;
    expect(loops).toEqual([
      {
        series: [mini, arca],
        sessionMinutes: [20, 31],
        gridMinutes: 60,
        // Mini :15 ends :35 → ARCA :45 ends :16 → Mini :15; Mini :45 can't reach ARCA.
        variants: [{ starts: [15, 45], repeatMinutes: 60 }],
      },
    ]);
    expect(formatBackToBackLoop(loops[0], { timeZone: "UTC" })).toEqual([
      ":15 → ends :35 → :45 (10 min gap) → ends :16 (+1h) → :15 (+1h) (1 min overlap) · repeats every 1 h",
    ]);
    // Listing ARCA first anchors the same loop on ARCA instead.
    expect(utcLines([arca, mini])).toEqual([
      [":45 → ends :16 → :15 (1 min overlap) → ends :35 → :45 (+1h) (10 min gap) · repeats every 1 h"],
    ]);
  });

  it("finds no loop when the return hop misses the window", () => {
    // ARCA for 40 min ends at :25: Mini's :15 is 10 min early and :45 20 min late.
    const longArca = makeSeries(167, "ARCA", { 1: repeating("00:45", 60, 40) });
    expect(findBackToBacks([mini, longArca], 1).pairs).toHaveLength(1);
    expect(findBackToBackLoops([mini, longArca], 1).loops).toEqual([]);
  });

  it("finds a 3-series loop in the only direction that works, listed once for all rotations", () => {
    // A :00 ends :20 → B :30 ends :40 → C :45 ends :57 → A :00. No hop runs the other way round.
    const a = makeSeries(1, "A", { 1: repeating("00:00", 60, 20) });
    const b = makeSeries(2, "B", { 1: repeating("00:30", 60, 10) });
    const c = makeSeries(3, "C", { 1: repeating("00:45", 60, 12) });
    const loops = findBackToBackLoops([a, b, c], 1).loops;
    expect(loopNames(loops)).toEqual(["A → B → C"]);
    expect(loops[0].variants).toEqual([{ starts: [0, 30, 45], repeatMinutes: 60 }]);
    // The loop starts from whichever of its series is listed first.
    expect(loopNames(findBackToBackLoops([b, c, a], 1).loops)).toEqual(["B → C → A"]);
    expect(loopNames(findBackToBackLoops([c, a, b], 1).loops)).toEqual(["C → A → B"]);
  });

  it("lists both directions of a 3-series loop separately when both work", () => {
    // Every hop: 25 min then 5 min to the next half hour, so any order loops.
    const [a, b, c] = ["A", "B", "C"].map((name, i) => makeSeries(i + 1, name, { 1: repeating("00:00", 30, 25) }));
    const loops = findBackToBackLoops([a, b, c], 1).loops;
    expect(loopNames(loops)).toEqual(["A → B", "A → C", "B → C", "A → B → C", "A → C → B"]);
    expect(loops[3].variants).toEqual([{ starts: [0, 30, 60], repeatMinutes: 90 }]);
    expect(formatBackToBackLoop(loops[3], { timeZone: "UTC" })).toEqual([
      ":00 → ends :25 → :30 (5 min gap) → ends :55 → :00 (+1h) (5 min gap) → ends :25 (+1h) → :30 (+1h) (5 min gap) · repeats every 1 h 30 min · starts every 30 min",
    ]);
  });

  it("says how often a loop can be joined when every grid repeats within the cycle", () => {
    // Both every 30 min for 25: the :00 → :30 → :00 cycle takes an hour but works from :30 too.
    const a = makeSeries(1, "A", { 1: repeating("00:00", 30, 25) });
    const b = makeSeries(2, "B", { 1: repeating("00:00", 30, 25) });
    const [loop] = findBackToBackLoops([a, b], 1).loops;
    expect(loop.gridMinutes).toBe(30);
    // Starting at :30 is the same cycle shifted by the grid, not a second line.
    expect(loop.variants).toEqual([{ starts: [0, 30], repeatMinutes: 60 }]);
    expect(formatBackToBackLoop(loop, { timeZone: "UTC" })).toEqual([
      ":00 → ends :25 → :30 (5 min gap) → ends :55 → :00 (+1h) (5 min gap) · repeats every 1 h · starts every 30 min",
    ]);
  });

  it("doesn't say how often a loop can be joined when only once per cycle or per day", () => {
    // Mini Stock's 30-min grid alone doesn't count: shifting by 30 breaks ARCA's hourly hop.
    expect(utcLines([mini, arca])).toEqual([
      [":15 → ends :35 → :45 (10 min gap) → ends :16 (+1h) → :15 (+1h) (1 min overlap) · repeats every 1 h"],
    ]);
    // Daily grids: A 00:00 for 1435 ends 23:55 → B 00:00 for 24 h → A 00:00, a two-day cycle.
    const a = makeSeries(1, "A", { 1: repeating("00:00", 1440, 1435) });
    const b = makeSeries(2, "B", { 1: repeating("00:00", 1440, 1440) });
    const [loop] = findBackToBackLoops([a, b], 1).loops;
    expect(loop.gridMinutes).toBe(1440);
    expect(loop.variants).toEqual([{ starts: [0, 1440], repeatMinutes: 2880 }]);
    expect(formatBackToBackLoop(loop, { timeZone: "UTC" })).toEqual([
      "00:00 → ends 23:55 → 00:00 (5 min gap) → ends 00:00 → 00:00 (0 min gap) · repeats every 48 h",
    ]);
  });

  it("groups distinct cycles of one series order under one loop, by start", () => {
    // B every 20 min for 40: A :00 → B :20 → A :00 next hour, and A :30 → B :40 → A :30 next hour.
    const a = makeSeries(1, "A", { 1: repeating("00:00", 30, 12) });
    const b = makeSeries(2, "B", { 1: repeating("00:00", 20, 40) });
    const loops = findBackToBackLoops([a, b], 1).loops;
    expect(loops).toHaveLength(1);
    expect(loops[0].gridMinutes).toBe(60);
    expect(loops[0].variants).toEqual([
      { starts: [0, 20], repeatMinutes: 60 },
      { starts: [30, 40], repeatMinutes: 60 },
    ]);
    expect(formatBackToBackLoop(loops[0], { timeZone: "UTC" })).toEqual([
      ":00 → ends :12 → :20 (8 min gap) → ends :00 (+1h) → :00 (+1h) (0 min gap) · repeats every 1 h",
      ":30 → ends :42 → :40 (2 min overlap) → ends :20 → :30 (+1h) (10 min gap) · repeats every 1 h",
    ]);
  });

  it("follows a cycle whose laps differ in timing until it realigns", () => {
    // B every 20 min for 15: A :00 → B :20 → A :30 → B :40 → A :00, a gap one lap and an overlap the next.
    const a = makeSeries(1, "A", { 1: repeating("00:00", 30, 12) });
    const b = makeSeries(2, "B", { 1: repeating("00:00", 20, 15) });
    const [loop] = findBackToBackLoops([a, b], 1).loops;
    expect(loop.variants).toEqual([{ starts: [0, 20, 30, 40], repeatMinutes: 60 }]);
    expect(formatBackToBackLoop(loop, { timeZone: "UTC" })).toEqual([
      ":00 → ends :12 → :20 (8 min gap) → ends :35 → :30 (5 min overlap) → ends :42 → :40 (2 min overlap) → ends :55 → :00 (+1h) (5 min gap) · repeats every 1 h",
    ]);
    // +05:30 puts the second lap on the hour, so the chain starts there.
    expect(formatBackToBackLoop(loop, { timeZone: "Asia/Kolkata" })).toEqual([
      ":00 → ends :12 → :10 (2 min overlap) → ends :25 → :30 (5 min gap) → ends :42 → :50 (8 min gap) → ends :05 (+1h) → :00 (+1h) (5 min overlap) · repeats every 1 h",
    ]);
  });

  it("wraps hops past midnight", () => {
    // Daily: A 23:30 for 700 min ends 11:10 → B 11:20 for 725 min ends 23:25 → A 23:30.
    const a = makeSeries(1, "A", { 1: repeating("23:30", 1440, 700) });
    const b = makeSeries(2, "B", { 1: repeating("11:20", 1440, 725) });
    const [loop] = findBackToBackLoops([a, b], 1).loops;
    expect(loop.gridMinutes).toBe(1440);
    expect(loop.variants).toEqual([{ starts: [1410, 2120], repeatMinutes: 1440 }]);
    expect(formatBackToBackLoop(loop, { timeZone: "UTC" })).toEqual([
      "23:30 → ends 11:10 → 11:20 (10 min gap) → ends 23:25 → 23:30 (5 min gap) · repeats every 24 h",
    ]);
  });

  it("aligns mixed 60/120-min grids on a 2-hour period, shown in local clock time", () => {
    // A on odd hours ends :50 → B :55 ends :55 an hour on → A on the next odd hour.
    const a = makeSeries(1, "A", { 1: repeating("05:00", 120, 50) });
    const b = makeSeries(2, "B", { 1: repeating("00:55", 60, 60) });
    const [loop] = findBackToBackLoops([a, b], 1).loops;
    expect(loop.gridMinutes).toBe(120);
    expect(loop.variants).toEqual([{ starts: [60, 115], repeatMinutes: 120 }]);
    expect(formatBackToBackLoop(loop, { timeZone: "UTC" })).toEqual([
      "01:00 → ends 01:50 → 01:55 (5 min gap) → ends 02:55 → 03:00 (5 min gap) · repeats every 2 h",
    ]);
    // +05:30: 01:00 UTC is 06:30 local, whose first 2-hourly slot after midnight is 00:30.
    expect(formatBackToBackLoop(loop, { timeZone: "Asia/Kolkata" })).toEqual([
      "00:30 → ends 01:20 → 01:25 (5 min gap) → ends 02:25 → 02:30 (5 min gap) · repeats every 2 h",
    ]);
  });

  it("shows sub-hour loops in minutes past the local hour in a half-hour offset zone", () => {
    const [loop] = findBackToBackLoops([mini, arca], 1).loops;
    expect(formatBackToBackLoop(loop, { timeZone: "Asia/Kolkata" })).toEqual([
      ":45 → ends :05 → :15 (10 min gap) → ends :46 (+1h) → :45 (+1h) (1 min overlap) · repeats every 1 h",
    ]);
  });

  it("leaves out scheduled series and series without a session length", () => {
    // Race-for-race the same as ARCA's week, but at fixed instants.
    const scheduledArca = makeSeries(167, "ARCA", {
      1: scheduled(
        Array.from({ length: 24 }, (_, h) => `2026-02-14T${String(h).padStart(2, "0")}:45:00Z`),
        31,
      ),
    });
    expect(findBackToBacks([mini, scheduledArca], 1).pairs).toHaveLength(2);
    expect(findBackToBackLoops([mini, scheduledArca], 1).loops).toEqual([]);
    const noLength = makeSeries(167, "ARCA", { 1: repeating("00:45", 60, null) });
    expect(findBackToBackLoops([mini, noLength], 1).loops).toEqual([]);
  });

  it("leaves out series whose repeat doesn't divide a day, quickly, while still pairing them", () => {
    // A 35-min grid has an irregular gap at midnight; with 15-min grids it once took seconds to search.
    const a = makeSeries(1, "A", { 1: repeating("00:00", 15, 10) });
    const odd = makeSeries(2, "Odd", { 1: repeating("00:00", 35, 10) });
    const c = makeSeries(3, "C", { 1: repeating("00:00", 15, 10) });
    expect(names(findBackToBacks([a, odd, c], 1).pairs)).toEqual(["A → Odd", "A → C", "Odd → A", "Odd → C", "C → A", "C → Odd"]);
    const started = performance.now();
    const { loops, truncated } = findBackToBackLoops([a, odd, c], 1);
    const elapsed = performance.now() - started;
    expect(loopNames(loops)).toEqual(["A → C"]);
    expect(truncated).toBe(false);
    expect(elapsed).toBeLessThan(200);
  });

  it("stops searching a series order once its step budget runs out, keeping the loops found", () => {
    // 15- and 16-min grids align only every 4 h, so this order has hundreds of cycles.
    const a = makeSeries(1, "A", { 1: repeating("00:00", 15, 5) });
    const b = makeSeries(2, "B", { 1: repeating("00:00", 16, 10) });
    const full = findBackToBackLoops([a, b], 1);
    expect(full.truncated).toBe(false);
    const started = performance.now();
    const cut = findBackToBackLoops([a, b], 1, 100);
    const elapsed = performance.now() - started;
    expect(cut.truncated).toBe(true);
    expect(cut.loops).toHaveLength(1);
    const found = cut.loops[0].variants;
    expect(found.length).toBeGreaterThan(0);
    // The first cycles found, still in order.
    expect(found.length).toBeLessThan(full.loops[0].variants.length);
    expect(found).toEqual(full.loops[0].variants.slice(0, found.length));
    expect(elapsed).toBeLessThan(200);
  });

  it("stays fast with 15 series on 15/30/60-min grids", () => {
    const grids = [15, 30, 60];
    const series = Array.from({ length: 15 }, (_, i) =>
      makeSeries(i + 1, `S${i + 1}`, {
        1: repeating(`00:${String((i * 7) % 60).padStart(2, "0")}`, grids[i % 3], 12 + ((i * 11) % 40)),
      }),
    );
    const started = performance.now();
    const loops = findBackToBackLoops(series, 1).loops;
    const elapsed = performance.now() - started;
    expect(loops.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(200);
  });

  it("finds exactly the cycles a brute-force search finds, on random small inputs", () => {
    // Seeded LCG, so any failure reproduces.
    let seed = 20260914;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const choose = <T,>(items: T[]) => items[Math.floor(random() * items.length)];
    const mod = (n: number, m: number) => ((n % m) + m) % m;
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    type Spec = { first: number; repeat: number; session: number };
    // Only repeats that divide a day can loop, and their grid is simply the first time modulo the repeat.
    const canLoop = (spec: Spec) => 1440 % spec.repeat === 0;
    const startsAt = (spec: Spec, minute: number) => mod(minute - spec.first, spec.repeat) === 0;

    /**
     * Cycles of one ordered tuple of spec indices, by naive DFS over absolute
     * minutes. A cycle is simple in the first series' races (mod the period),
     * so the tuple must start with its earliest series, as loops do.
     */
    const bruteForce = (specs: Spec[], tuple: number[], found: Set<string>) => {
      const k = tuple.length;
      if (!tuple.every((i) => canLoop(specs[i]))) return;
      // Smallest day-dividing shift that leaves every grid in the tuple unchanged (a day always does).
      let period = 1;
      while (period < 1440 && (1440 % period !== 0 || tuple.some((i) => period % specs[i].repeat !== 0))) period++;
      const record = (chain: number[], duration: number) => {
        // Rotate to whichever lap starts first mod the period, then shift into the first period.
        let best = chain;
        for (let j = k; j < chain.length; j += k) {
          const rotated = [...chain.slice(j), ...chain.slice(0, j).map((m) => m + duration)];
          if (mod(rotated[0], period) < mod(best[0], period)) best = rotated;
        }
        const base = best[0] - mod(best[0], period);
        found.add(JSON.stringify([tuple.map((i) => i + 1), best.map((m) => m - base), duration]));
      };
      for (let origin = 0; origin < period; origin++) {
        if (!startsAt(specs[tuple[0]], origin)) continue;
        const visited = new Set([origin]);
        // `chain` holds every start so far; the last is where the current race begins.
        const race = (chain: number[]) => {
          const position = (chain.length - 1) % k;
          const end = chain.at(-1)! + specs[tuple[position]].session;
          const next = tuple[(position + 1) % k];
          for (let u = end - 5; u <= end + 15; u++) {
            if (!startsAt(specs[next], u)) continue;
            if (position < k - 1) {
              race([...chain, u]);
            } else if (mod(u, period) === origin) {
              if (u > origin) record(chain, u - origin);
            } else if (!visited.has(mod(u, period))) {
              visited.add(mod(u, period));
              race([...chain, u]);
              visited.delete(mod(u, period));
            }
          }
        };
        race([origin]);
      }
    };

    let cycles = 0;
    let excluded = 0;
    for (let trial = 0; trial < 400; trial++) {
      const specs: Spec[] = Array.from({ length: 2 + Math.floor(random() * 2) }, () => ({
        first: 5 * Math.floor(random() * 288),
        // 35 and 50 don't divide a day, so those series never loop.
        repeat: choose([15, 20, 30, 35, 45, 50, 60, 90, 120]),
        session: 5 + Math.floor(random() * 96),
      }));
      const series = specs.map((spec, i) =>
        makeSeries(i + 1, `S${i + 1}`, { 1: repeating(hhmm(spec.first), spec.repeat, spec.session) }),
      );
      const expected = new Set<string>();
      // Every ordered tuple of 2 or 3 distinct series led by its earliest one.
      const indices = specs.map((_, i) => i);
      for (const i of indices) {
        for (const j of indices) {
          if (j <= i) continue;
          bruteForce(specs, [i, j], expected);
          for (const l of indices) if (l > i && l !== j) bruteForce(specs, [i, j, l], expected);
        }
      }
      const { loops, truncated } = findBackToBackLoops(series, 1);
      expect(truncated).toBe(false);
      const actual = loops.flatMap((loop) =>
        loop.variants.map((v) => JSON.stringify([loop.series.map((s) => s.seriesId), v.starts, v.repeatMinutes])),
      );
      expect({ trial, specs, cycles: actual.sort() }).toEqual({ trial, specs, cycles: [...expected].sort() });
      cycles += actual.length;
      excluded += specs.filter((spec) => !canLoop(spec)).length;
    }
    // Guard against a generator that never produces loops, or never a series that can't.
    expect(cycles).toBeGreaterThan(200);
    expect(excluded).toBeGreaterThan(20);
  });
});
