import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeTrackUsage, buildTrackUsageFile, type SeasonUsageInput } from "../track-usage";
import { writeSeasonFiles, type SeasonFile } from "../season-files";
import type { TrackCategoryCatalogue } from "../track-categories";
import type { Series, WeekSchedule } from "../../src/types";

const week = (overrides: Partial<WeekSchedule> = {}): WeekSchedule => ({
  weekNumber: 1,
  seasonWeek: 1,
  trackId: 1,
  trackName: "Charlotte Motor Speedway",
  rainChance: 0,
  rainEnabled: false,
  ...overrides,
});

const series = (overrides: Partial<Series> = {}): Series => ({
  seriesId: 1,
  seriesName: "Test Series",
  category: "oval",
  licenseClass: "R",
  setupType: "fixed",
  isMulticlass: false,
  totalWeeks: 1,
  raceTimeMinutes: 20,
  isRepeating: true,
  cars: [],
  scheduleWeeks: [week()],
  ...overrides,
});

const season = (overrides: Partial<SeasonUsageInput> = {}): SeasonUsageInput => ({
  id: "2026-S2",
  name: "2026 Season 2",
  startDate: "2026-03-17T00:00:00.000Z",
  series: [series()],
  ...overrides,
});

const catalogue: TrackCategoryCatalogue = {
  "1": { category: "oval", name: "Charlotte Motor Speedway" },
  "2": { category: "road", name: "Some Road Course" },
};

describe("computeTrackUsage", () => {
  it("groups by trackName.trim() only — trailing whitespace merges, other spellings don't", () => {
    const usage = computeTrackUsage(
      [
        season({
          series: [
            series({ scheduleWeeks: [week({ trackName: "Charlotte Motor Speedway " })] }),
            series({
              seriesId: 2,
              scheduleWeeks: [week({ trackName: "[Legacy] Phoenix Raceway - 2008", trackId: 3 })],
            }),
          ],
        }),
      ],
      catalogue,
    );

    const names = usage.tracks.map((t) => t.trackName).sort();
    expect(names).toEqual(["Charlotte Motor Speedway", "[Legacy] Phoenix Raceway - 2008"]);
    // The trimmed and untrimmed spellings merged into a single row.
    expect(usage.tracks.find((t) => t.trackName === "Charlotte Motor Speedway")?.counts.oval).toEqual(
      { "2026-S2": 1 },
    );
  });

  it("counts series-weeks: each scheduleWeeks entry at a track counts 1", () => {
    const usage = computeTrackUsage(
      [
        season({
          series: [
            series({ scheduleWeeks: [week(), week({ weekNumber: 5, seasonWeek: 5 })] }),
            series({ seriesId: 2, scheduleWeeks: [week()] }),
          ],
        }),
      ],
      catalogue,
    );

    const track = usage.tracks.find((t) => t.trackName === "Charlotte Motor Speedway");
    // Two weeks from series 1 plus one from series 2 = 3 series-weeks.
    expect(track?.counts.oval).toEqual({ "2026-S2": 3 });
  });

  it("splits counts per season, broken down by layout category", () => {
    const usage = computeTrackUsage(
      [
        season({
          id: "2026-S2",
          startDate: "2026-03-17T00:00:00.000Z",
          series: [series({ scheduleWeeks: [week({ trackId: 1 })] })],
        }),
        season({
          id: "2026-S3",
          startDate: "2026-06-16T00:00:00.000Z",
          series: [
            series({
              scheduleWeeks: [
                week({ trackId: 1 }),
                week({ trackId: 2, trackName: "Some Road Course" }),
              ],
            }),
          ],
        }),
      ],
      catalogue,
    );

    const oval = usage.tracks.find((t) => t.trackName === "Charlotte Motor Speedway");
    expect(oval?.counts).toEqual({ oval: { "2026-S2": 1, "2026-S3": 1 } });

    const road = usage.tracks.find((t) => t.trackName === "Some Road Course");
    expect(road?.counts).toEqual({ road: { "2026-S3": 1 } });
  });

  it("counts a trackId missing from the catalogue as unknown and reports it once per id", () => {
    const onUnknownTrack = vi.fn();
    const usage = computeTrackUsage(
      [
        season({
          series: [
            series({
              scheduleWeeks: [
                week({ trackId: 999, trackName: "Mystery Track" }),
                week({ trackId: 999, trackName: "Mystery Track" }),
              ],
            }),
          ],
        }),
      ],
      catalogue,
      onUnknownTrack,
    );

    const mystery = usage.tracks.find((t) => t.trackName === "Mystery Track");
    expect(mystery?.counts).toEqual({ unknown: { "2026-S2": 2 } });
    expect(onUnknownTrack).toHaveBeenCalledTimes(2);
    expect(onUnknownTrack).toHaveBeenCalledWith(999, "Mystery Track");
  });

  it("never throws for an uncatalogued track id", () => {
    expect(() =>
      computeTrackUsage(
        [season({ series: [series({ scheduleWeeks: [week({ trackId: 12345 })] })] })],
        {},
      ),
    ).not.toThrow();
  });

  it("carries the provisional flag through to the season list", () => {
    const usage = computeTrackUsage(
      [season({ id: "2026-S4", provisional: true }), season({ id: "2026-S3" })],
      catalogue,
    );

    expect(usage.seasons.find((s) => s.id === "2026-S4")?.provisional).toBe(true);
    expect(usage.seasons.find((s) => s.id === "2026-S3")?.provisional).toBeUndefined();
  });

  it("orders seasons chronologically by startDate regardless of input order", () => {
    const usage = computeTrackUsage(
      [
        season({ id: "2026-S3", startDate: "2026-06-16T00:00:00.000Z" }),
        season({ id: "2026-S2", startDate: "2026-03-17T00:00:00.000Z" }),
        season({ id: "2026-S4", startDate: "2026-09-15T00:00:00.000Z" }),
      ],
      catalogue,
    );

    expect(usage.seasons.map((s) => s.id)).toEqual(["2026-S2", "2026-S3", "2026-S4"]);
  });
});

describe("computeTrackUsage free flag", () => {
  const freeCatalogue: TrackCategoryCatalogue = {
    "10": { category: "oval", name: "All Free Track", free: true },
    "11": { category: "oval", name: "All Free Track", config: "Layout 2", free: true },
    "20": { category: "road", name: "Mixed Track", free: true },
    "21": { category: "road", name: "Mixed Track", config: "Layout 2", free: false },
    "30": { category: "road", name: "Legacy Track" }, // no `free` field at all
  };

  it("is true when every layout id the track used is catalogued and free", () => {
    const usage = computeTrackUsage(
      [
        season({
          series: [
            series({
              scheduleWeeks: [
                week({ trackId: 10, trackName: "All Free Track" }),
                week({ trackId: 11, trackName: "All Free Track", weekNumber: 2, seasonWeek: 2 }),
              ],
            }),
          ],
        }),
      ],
      freeCatalogue,
    );
    expect(usage.tracks.find((t) => t.trackName === "All Free Track")?.free).toBe(true);
  });

  it("is false if even one layout the track used is paid", () => {
    const usage = computeTrackUsage(
      [
        season({
          series: [
            series({
              scheduleWeeks: [
                week({ trackId: 20, trackName: "Mixed Track" }),
                week({ trackId: 21, trackName: "Mixed Track", weekNumber: 2, seasonWeek: 2 }),
              ],
            }),
          ],
        }),
      ],
      freeCatalogue,
    );
    expect(usage.tracks.find((t) => t.trackName === "Mixed Track")?.free).toBe(false);
  });

  it("is false for a layout id missing from the catalogue entirely", () => {
    const usage = computeTrackUsage(
      [season({ series: [series({ scheduleWeeks: [week({ trackId: 999, trackName: "Unknown Track" })] })] })],
      freeCatalogue,
    );
    expect(usage.tracks.find((t) => t.trackName === "Unknown Track")?.free).toBe(false);
  });

  it("is false for a legacy catalogue entry with no free field", () => {
    const usage = computeTrackUsage(
      [season({ series: [series({ scheduleWeeks: [week({ trackId: 30, trackName: "Legacy Track" })] })] })],
      freeCatalogue,
    );
    expect(usage.tracks.find((t) => t.trackName === "Legacy Track")?.free).toBe(false);
  });
});

describe("buildTrackUsageFile", () => {
  const seasonFile = (overrides: Partial<SeasonFile> = {}): SeasonFile => ({
    seasonId: "2026-S2",
    seasonName: "2026 Season 2",
    seasonStartDate: "2026-03-17T00:00:00.000Z",
    series: [series()],
    ...overrides,
  });

  let seasonsDir: string;
  let catalogueFile: string;

  beforeEach(() => {
    seasonsDir = mkdtempSync(join(tmpdir(), "seasons-"));
    catalogueFile = join(mkdtempSync(join(tmpdir(), "catalogue-")), "track-categories.json");
    writeFileSync(catalogueFile, JSON.stringify(catalogue));
  });
  afterEach(() => {
    rmSync(seasonsDir, { recursive: true, force: true });
  });

  it("does not count current-season.json as its own season", () => {
    // writeSeasonFiles always derives current-season.json alongside the archive.
    writeSeasonFiles(seasonsDir, seasonFile());

    const usage = buildTrackUsageFile(seasonsDir, catalogueFile);
    expect(usage.seasons).toEqual([{ id: "2026-S2", name: "2026 Season 2" }]);
  });

  it("skips a malformed or missing-field archive rather than failing the build", () => {
    writeSeasonFiles(seasonsDir, seasonFile());
    writeFileSync(join(seasonsDir, "broken.json"), "{ not valid json");
    writeFileSync(
      join(seasonsDir, "incomplete.json"),
      JSON.stringify({ seasonId: "2026-S3", seasonName: "2026 Season 3" }),
    );

    const usage = buildTrackUsageFile(seasonsDir, catalogueFile);
    expect(usage.seasons.map((s) => s.id)).toEqual(["2026-S2"]);
  });

  it("warns once per uncatalogued track id and buckets it under unknown", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    writeSeasonFiles(
      seasonsDir,
      seasonFile({
        series: [
          series({
            scheduleWeeks: [
              week({ trackId: 999, trackName: "Mystery Track" }),
              week({ trackId: 999, trackName: "Mystery Track", weekNumber: 2, seasonWeek: 2 }),
            ],
          }),
        ],
      }),
    );

    const usage = buildTrackUsageFile(seasonsDir, catalogueFile);

    const mystery = usage.tracks.find((t) => t.trackName === "Mystery Track");
    expect(mystery?.counts).toEqual({ unknown: { "2026-S2": 2 } });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/999/);

    warn.mockRestore();
  });
});
