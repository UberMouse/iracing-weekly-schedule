import { describe, it, expect } from "vitest";
import { aggregateTrackUsage } from "../TrackUsage/aggregate";
import type { TrackUsageFile } from "../../types";

const file: TrackUsageFile = {
  seasons: [
    { id: "2026-S2", name: "2026 Season 2" },
    { id: "2026-S3", name: "2026 Season 3" },
    { id: "2026-S4", name: "2026 Season 4", provisional: true },
  ],
  tracks: [
    {
      trackName: "Charlotte Motor Speedway",
      counts: {
        oval: { "2026-S2": 4, "2026-S3": 6 },
        road: { "2026-S4": 2 },
      },
    },
    {
      trackName: "Lanier National Speedway",
      counts: {
        dirt_oval: { "2026-S2": 10, "2026-S3": 10 },
      },
    },
    {
      trackName: "Daytona International Speedway",
      counts: {
        oval: { "2026-S2": 1 },
        road: { "2026-S3": 3 },
      },
    },
    {
      trackName: "Mystery Track",
      counts: {
        unknown: { "2026-S2": 5 },
      },
    },
    {
      trackName: "Tie A",
      counts: { oval: { "2026-S2": 3 } },
    },
    {
      trackName: "Tie B",
      counts: { oval: { "2026-S2": 3 } },
    },
  ],
};

describe("aggregateTrackUsage", () => {
  it("passes seasons through unchanged, in file order", () => {
    const { seasons } = aggregateTrackUsage(file, "all");
    expect(seasons.map((s) => s.id)).toEqual(["2026-S2", "2026-S3", "2026-S4"]);
  });

  it("sums every bucket (including unknown) for the 'all' filter", () => {
    const { rows } = aggregateTrackUsage(file, "all");
    const mystery = rows.find((r) => r.trackName === "Mystery Track");
    expect(mystery?.total).toBe(5);
    expect(mystery?.perSeason["2026-S2"]).toBe(5);

    const charlotte = rows.find((r) => r.trackName === "Charlotte Motor Speedway");
    // oval 4+6 + road 2 = 12
    expect(charlotte?.total).toBe(12);
    expect(charlotte?.perSeason["2026-S2"]).toBe(4);
    expect(charlotte?.perSeason["2026-S3"]).toBe(6);
    expect(charlotte?.perSeason["2026-S4"]).toBe(2);
  });

  it("fills seasons with no usage as 0, not undefined", () => {
    const { rows } = aggregateTrackUsage(file, "all");
    const lanier = rows.find((r) => r.trackName === "Lanier National Speedway");
    expect(lanier?.perSeason["2026-S4"]).toBe(0);
  });

  it("sorts rows by total descending", () => {
    const { rows } = aggregateTrackUsage(file, "all");
    const totals = rows.map((r) => r.total);
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
    expect(rows[0].trackName).toBe("Lanier National Speedway"); // 20
  });

  it("breaks ties by track name ascending", () => {
    const { rows } = aggregateTrackUsage(file, "all");
    const tieIndex = rows.findIndex((r) => r.trackName === "Tie A");
    expect(rows[tieIndex + 1].trackName).toBe("Tie B");
    expect(rows[tieIndex].total).toBe(rows[tieIndex + 1].total);
  });

  it("counts only the matching bucket for a single-category filter", () => {
    const { rows } = aggregateTrackUsage(file, "road");
    const charlotte = rows.find((r) => r.trackName === "Charlotte Motor Speedway");
    expect(charlotte?.total).toBe(2);
    expect(charlotte?.perSeason["2026-S2"]).toBe(0);
    expect(charlotte?.perSeason["2026-S4"]).toBe(2);
  });

  it("hides tracks whose filtered total is 0", () => {
    const { rows } = aggregateTrackUsage(file, "road");
    expect(rows.find((r) => r.trackName === "Lanier National Speedway")).toBeUndefined();
    expect(rows.find((r) => r.trackName === "Mystery Track")).toBeUndefined();
  });

  it("re-sorts by the filtered total, not the all-bucket total", () => {
    const { rows } = aggregateTrackUsage(file, "road");
    // Daytona: 3 road weeks vs Charlotte: 2 road weeks — order flips vs "all".
    expect(rows.map((r) => r.trackName)).toEqual(["Daytona International Speedway", "Charlotte Motor Speedway"]);
  });

  it("excludes unknown from a single-category filter", () => {
    const { rows } = aggregateTrackUsage(file, "oval");
    expect(rows.find((r) => r.trackName === "Mystery Track")).toBeUndefined();
  });
});
