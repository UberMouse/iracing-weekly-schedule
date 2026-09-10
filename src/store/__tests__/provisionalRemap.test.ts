import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useAppStore } from "../useAppStore";

const SEASON_ID = "2026-S4";

/**
 * The current-season blob as served after `fetch-data` has replaced a
 * provisional (PDF-derived) import with official data.
 */
function currentSeasonFile(seriesIdRemap?: Record<string, number>) {
  return {
    currentSeasonId: SEASON_ID,
    availableSeasons: [
      { id: SEASON_ID, name: "2026 Season 4", startDate: "2026-09-15T00:00:00.000Z" },
    ],
    season: {
      seasonId: SEASON_ID,
      seasonName: "2026 Season 4",
      seasonStartDate: "2026-09-15T00:00:00.000Z",
      series: [],
      ...(seriesIdRemap ? { seriesIdRemap } : {}),
    },
  };
}

const load = async (file: unknown) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => file }));
  useAppStore.setState({ status: "idle" });
  await useAppStore.getState().loadSeasons();
};

describe("provisional -> official series id remap", () => {
  beforeEach(() => {
    useAppStore.setState({
      status: "idle",
      currentSeasonId: null,
      viewingSeasonId: null,
      seasonCache: {},
      availableSeasons: [],
      appliedSeriesRemaps: [],
      favorites: [],
      seasonPicks: {
        [SEASON_ID]: {
          weeklyPicks: { 1: [-42, 519], 2: [-42] },
          weeklyMaybes: { 1: [-7] },
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("moves picks made before the season opened onto the official ids", async () => {
    await load(currentSeasonFile({ "-42": 612, "-7": 700 }));

    const picks = useAppStore.getState().seasonPicks[SEASON_ID];
    expect(picks.weeklyPicks).toEqual({ 1: [612, 519], 2: [612] });
    expect(picks.weeklyMaybes).toEqual({ 1: [700] });
  });

  it("moves favourites that can only have come from the import", async () => {
    // Negative ids are synthetic, so they are unambiguously provisional.
    useAppStore.setState({ favorites: [-42, 519] });
    await load(currentSeasonFile({ "-42": 612, "519": 640 }));

    // 519 is a real id that may have been favourited in an earlier season, so
    // it is left alone even though this season's schedule moved it.
    expect(useAppStore.getState().favorites).toEqual([612, 519]);
  });

  it("does not collapse a week's picks when two ids remap onto one", async () => {
    useAppStore.setState({
      seasonPicks: { [SEASON_ID]: { weeklyPicks: { 1: [-42, 612] }, weeklyMaybes: {} } },
    });
    await load(currentSeasonFile({ "-42": 612 }));

    expect(useAppStore.getState().seasonPicks[SEASON_ID].weeklyPicks[1]).toEqual([612]);
  });

  it("replays a remap only once, even across reloads", async () => {
    await load(currentSeasonFile({ "-42": 612 }));
    expect(useAppStore.getState().appliedSeriesRemaps).toEqual([SEASON_ID]);

    // A second load must not re-apply it: 612 could itself be a remap source
    // for a different series in some other season.
    await load(currentSeasonFile({ "612": 999 }));
    expect(useAppStore.getState().seasonPicks[SEASON_ID].weeklyPicks[1]).toEqual([612, 519]);
  });

  it("leaves picks untouched when the season carries no remap", async () => {
    await load(currentSeasonFile());

    expect(useAppStore.getState().seasonPicks[SEASON_ID].weeklyPicks).toEqual({
      1: [-42, 519],
      2: [-42],
    });
    expect(useAppStore.getState().appliedSeriesRemaps).toEqual([]);
  });
});

describe("provisional season flag", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is exposed on availableSeasons for the season switcher", async () => {
    await load({
      currentSeasonId: SEASON_ID,
      availableSeasons: [
        { id: "2026-S3", name: "2026 Season 3", startDate: "2026-06-16T00:00:00.000Z" },
        {
          id: SEASON_ID,
          name: "2026 Season 4",
          startDate: "2026-09-15T00:00:00.000Z",
          provisional: true,
        },
      ],
      season: {
        seasonId: SEASON_ID,
        seasonName: "2026 Season 4",
        seasonStartDate: "2026-09-15T00:00:00.000Z",
        series: [],
        provisional: true,
      },
    });

    const state = useAppStore.getState();
    expect(state.availableSeasons.find((s) => s.id === SEASON_ID)?.provisional).toBe(true);
    expect(state.availableSeasons.find((s) => s.id === "2026-S3")?.provisional).toBeUndefined();
  });
});
