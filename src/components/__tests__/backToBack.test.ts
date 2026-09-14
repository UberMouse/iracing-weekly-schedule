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
  const format = (from: Series, to: Series, timeZone: string) =>
    formatBackToBackMatches(findBackToBacks([from, to], 1).pairs.find((p) => p.from === from)!.matches, { timeZone });

  it("collapses hourly patterns to minutes past the hour", () => {
    const a = makeSeries(1, "A", { 1: repeating("00:30", 60, 15) });
    const b = makeSeries(2, "B", { 1: repeating("00:45", 60, 15) });
    expect(format(a, b, "UTC")).toEqual([":30 → :45 · hourly"]);
    expect(format(a, b, "Asia/Kolkata")).toEqual([":00 → :15 · hourly"]);
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
});
