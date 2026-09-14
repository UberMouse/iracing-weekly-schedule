import { describe, it, expect } from "vitest";
import { findBackToBacks, formatBackToBackMatches } from "../ScheduleBuilder/backToBack";
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
    const b = makeSeries(2, "B", { 1: repeating("10:30", 1440, 30) });
    const { pairs } = findBackToBacks([b, a], 1);
    expect(names(pairs)).toEqual(["A → B"]);
    expect(pairs[0].matches).toEqual({ kind: "daily", occurrences: [{ fromMinute: 600, toMinute: 630 }] });
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
    expect(formatBackToBackMatches(pairs[0].matches, { timeZone: "UTC" })).toEqual(["Sat 23:50 → Sun 00:10"]);
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
  const format = (from: Series, to: Series, timeZone: string, referenceDate?: Date) =>
    formatBackToBackMatches(findBackToBacks([from, to], 1).pairs.find((p) => p.from === from)!.matches, {
      timeZone,
      referenceDate,
    });

  it("collapses hourly patterns to minutes past the hour", () => {
    const a = makeSeries(1, "A", { 1: repeating("00:30", 60, 15) });
    const b = makeSeries(2, "B", { 1: repeating("00:45", 60, 15) });
    expect(format(a, b, "UTC")).toEqual([":30 → :45 · hourly"]);
    expect(format(a, b, "Asia/Kolkata")).toEqual([":00 → :15 · hourly"]);
  });

  it("leaves sub-hour gaps between starts as plain minutes", () => {
    // A 50 min from :00 ends at :50; B at :55 starts 55 min after A.
    const a = makeSeries(1, "A", { 1: repeating("00:00", 60, 50) });
    const b = makeSeries(2, "B", { 1: repeating("00:55", 60, 10) });
    expect(format(a, b, "UTC")).toEqual([":00 → :55 · hourly"]);
  });

  it("marks whole hours hidden by minutes-past-the-hour times", () => {
    // A 53 min from :30 ends at :23; B at :30 the next hour starts 60 min after A.
    const a = makeSeries(1, "A", { 1: repeating("00:30", 60, 53) });
    const b = makeSeries(2, "B", { 1: repeating("00:30", 60, 10) });
    expect(format(a, b, "UTC")).toEqual([":30 → :30 (+1h) · hourly"]);
    // A at :10/:40 for 55 min; B every 15 min starts 50 or 65 min later.
    const halfHourly = makeSeries(3, "Half-hourly", { 1: repeating("00:10", 30, 55) });
    const quarterly = makeSeries(4, "Quarterly", { 1: repeating("00:00", 15, 10) });
    expect(format(halfHourly, quarterly, "UTC")).toEqual([
      ":10 → :00 · every 30 min",
      ":10 → :15 (+1h) · every 30 min",
    ]);
  });

  it("shows daily patterns with the offset in force at the reference date", () => {
    const a = makeSeries(1, "A", { 1: repeating("10:00", 1440, 30) });
    const b = makeSeries(2, "B", { 1: repeating("10:30", 1440, 30) });
    // UK clocks go back on 2026-10-25: BST (+1) before, GMT after.
    expect(format(a, b, "Europe/London", new Date("2026-10-19T00:00:00Z"))).toEqual(["11:00 → 11:30 · daily"]);
    expect(format(a, b, "Europe/London", new Date("2026-10-26T00:00:00Z"))).toEqual(["10:00 → 10:30 · daily"]);
  });

  it("shows multi-hour cadences from the first occurrence after local midnight", () => {
    // A every 2 h from 01:45 for 60 min ends at :45; B on the hour starts 15 min later.
    const a = makeSeries(1, "A", { 1: repeating("01:45", 120, 60) });
    const b = makeSeries(2, "B", { 1: repeating("00:00", 60, 30) });
    expect(format(a, b, "UTC")).toEqual(["01:45 → 03:00 · every 2 h"]);
    // +05:30: 01:45 UTC is 07:15 local, whose first 2-hourly slot after midnight is 01:15.
    expect(format(a, b, "Asia/Kolkata")).toEqual(["01:15 → 02:30 · every 2 h"]);
  });

  it("lists each distinct gap once for sub-hour cadences", () => {
    const a = makeSeries(1, "A", { 1: repeating("00:00", 30, 20) });
    const b = makeSeries(2, "B", { 1: repeating("00:15", 15, 20) });
    expect(format(a, b, "UTC")).toEqual([":00 → :15 · every 30 min", ":00 → :30 · every 30 min"]);
  });

  it("shows once-a-day patterns as daily across midnight", () => {
    const late = makeSeries(1, "Late", { 1: repeating("23:45", 1440, 20) });
    const early = makeSeries(2, "Early", { 1: repeating("00:05", 1440, 20) });
    expect(format(late, early, "UTC")).toEqual(["23:45 → 00:05 · daily"]);
    expect(format(late, early, "Asia/Kolkata")).toEqual(["05:15 → 05:35 · daily"]);
  });

  it("lists scheduled occurrences with weekday and local time", () => {
    const special = makeSeries(1, "Special", {
      1: scheduled(["2026-02-14T17:00:00Z", "2026-02-14T18:00:00Z"], 60),
    });
    const sprint = makeSeries(2, "Sprint", { 1: repeating("00:15", 60, 20) });
    expect(format(special, sprint, "UTC")).toEqual(["Sat 17:00 → 18:15", "Sat 18:00 → 19:15"]);
    expect(format(special, sprint, "Asia/Kolkata")).toEqual(["Sat 22:30 → 23:45", "Sat 23:30 → Sun 00:45"]);
  });

  it("groups every B start after the same scheduled A start onto one line", () => {
    // Tue 00:00 for 60 min ends at 01:00; the 15-min grid's 01:00 and 01:15 both qualify.
    const special = makeSeries(1, "Special", { 1: scheduled(["2026-02-17T00:00:00Z"], 60) });
    const grid = makeSeries(2, "Grid", { 1: repeating("00:00", 15, 20) });
    expect(format(special, grid, "UTC")).toEqual(["Tue 00:00 → 01:00, 01:15"]);
    // Ends at 23:50: 23:45 and Sun 00:00 qualify, the weekday added once the day changes.
    const late = makeSeries(3, "Late", { 1: scheduled(["2026-02-14T23:30:00Z"], 20) });
    expect(format(late, grid, "UTC")).toEqual(["Sat 23:30 → 23:45, Sun 00:00"]);
  });

  it("groups scheduled B starts by the repeating A start they follow", () => {
    // A every 15 min for 50: 00:00 reaches 01:00; 00:15 (ends 01:05) reaches both 01:00 and 01:10.
    const grid = makeSeries(1, "Grid", { 1: repeating("00:00", 15, 50) });
    const special = makeSeries(2, "Special", {
      1: scheduled(["2026-02-17T01:00:00Z", "2026-02-17T01:10:00Z"], 60),
    });
    expect(format(grid, special, "UTC")).toEqual(["Tue 00:00 → 01:00", "Tue 00:15 → 01:00, 01:10"]);
  });
});
