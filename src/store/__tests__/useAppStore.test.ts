import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useAppStore } from "../useAppStore";
import type { Series } from "../../types";

const SEASON_ID = "2026-S2";

const multiWeekSeries: Series = {
  seriesId: 500,
  seriesName: "Multi Week",
  category: "sports_car",
  licenseClass: "C",
  setupType: "open",
  isMulticlass: false,
  totalWeeks: 3,
  raceTimeMinutes: null,
  isRepeating: true,
  cars: [{ carId: 1, carName: "Car" }],
  scheduleWeeks: [
    { weekNumber: 1, seasonWeek: 1, trackId: 1, trackName: "A", rainChance: 0, rainEnabled: false },
    { weekNumber: 2, seasonWeek: 2, trackId: 2, trackName: "B", rainChance: 0, rainEnabled: false },
    { weekNumber: 3, seasonWeek: 3, trackId: 3, trackName: "C", rainChance: 0, rainEnabled: false },
  ],
};

/** The current season's picks (defaulted) for assertions. */
const cur = () => useAppStore.getState().seasonPicks[SEASON_ID] ?? { weeklyPicks: {}, weeklyMaybes: {} };

describe("useAppStore", () => {
  beforeEach(() => {
    useAppStore.setState({
      status: "ready",
      currentSeasonId: SEASON_ID,
      viewingSeasonId: SEASON_ID,
      availableSeasons: [{ id: SEASON_ID, name: "2026 Season 2", startDate: "2026-03-17T00:00:00.000Z" }],
      seasonCache: {
        [SEASON_ID]: {
          seasonId: SEASON_ID,
          seasonName: "2026 Season 2",
          seasonStartDate: "2026-03-17T00:00:00.000Z",
          series: [multiWeekSeries],
        },
      },
      seasonPicks: {},
      favorites: [],
      modalShowAllSeries: true,
      filters: {
        categories: ["oval", "dirt_oval", "dirt_road", "sports_car", "formula"],
        licenseClasses: ["R", "D", "C", "B", "A"],
        setupType: null,
        searchText: "",
        favoritesOnly: false,
      },
    });
  });

  describe("favorites", () => {
    it("toggles a favorite on", () => {
      useAppStore.getState().toggleFavorite(123);
      expect(useAppStore.getState().favorites).toContain(123);
    });

    it("toggles a favorite off", () => {
      useAppStore.setState({ favorites: [123] });
      useAppStore.getState().toggleFavorite(123);
      expect(useAppStore.getState().favorites).not.toContain(123);
    });
  });

  describe("weeklyPicks (current season)", () => {
    it("adds a pick to a week", () => {
      useAppStore.getState().addWeeklyPick(1, 100);
      expect(cur().weeklyPicks[1]).toContain(100);
    });

    it("does not add duplicate pick", () => {
      useAppStore.getState().addWeeklyPick(1, 100);
      useAppStore.getState().addWeeklyPick(1, 100);
      expect(cur().weeklyPicks[1]).toEqual([100]);
    });

    it("removes a pick from a week", () => {
      useAppStore.setState({ seasonPicks: { [SEASON_ID]: { weeklyPicks: { 1: [100, 200] }, weeklyMaybes: {} } } });
      useAppStore.getState().removeWeeklyPick(1, 100);
      expect(cur().weeklyPicks[1]).toEqual([200]);
    });

    it("does not write picks when no current season is set", () => {
      useAppStore.setState({ currentSeasonId: null, seasonPicks: {} });
      useAppStore.getState().addWeeklyPick(1, 100);
      expect(useAppStore.getState().seasonPicks).toEqual({});
    });
  });

  describe("filters", () => {
    it("sets partial filters", () => {
      useAppStore.getState().setFilters({ searchText: "mazda" });
      expect(useAppStore.getState().filters.searchText).toBe("mazda");
      expect(useAppStore.getState().filters.categories).toEqual(["oval", "dirt_oval", "dirt_road", "sports_car", "formula"]);
    });
  });

  describe("modalShowAllSeries", () => {
    it("defaults to true", () => {
      expect(useAppStore.getState().modalShowAllSeries).toBe(true);
    });

    it("updates via setModalShowAllSeries", () => {
      useAppStore.getState().setModalShowAllSeries(false);
      expect(useAppStore.getState().modalShowAllSeries).toBe(false);
    });
  });

  describe("export/import", () => {
    it("exports and imports per-season picks", () => {
      useAppStore.setState({
        favorites: [1, 2],
        seasonPicks: { [SEASON_ID]: { weeklyPicks: { 1: [1] }, weeklyMaybes: {} } },
      });
      const json = useAppStore.getState().exportData();
      useAppStore.setState({ favorites: [], seasonPicks: {} });
      useAppStore.getState().importData(json);
      expect(useAppStore.getState().favorites).toEqual([1, 2]);
      expect(cur().weeklyPicks).toEqual({ 1: [1] });
    });

    it("exports and imports maybes", () => {
      useAppStore.setState({
        favorites: [1],
        seasonPicks: { [SEASON_ID]: { weeklyPicks: {}, weeklyMaybes: { 2: [1] } } },
      });
      const json = useAppStore.getState().exportData();
      useAppStore.setState({ seasonPicks: {} });
      useAppStore.getState().importData(json);
      expect(cur().weeklyMaybes).toEqual({ 2: [1] });
    });

    it("imports legacy flat format into the current season", () => {
      const oldJson = JSON.stringify({ favorites: [1], weeklyPicks: { 1: [1] } });
      useAppStore.getState().importData(oldJson);
      expect(useAppStore.getState().favorites).toEqual([1]);
      expect(cur().weeklyPicks).toEqual({ 1: [1] });
      expect(cur().weeklyMaybes).toEqual({});
    });
  });

  describe("addSeriesToAllWeeks", () => {
    it("adds series to all weeks it races in", () => {
      useAppStore.getState().addSeriesToAllWeeks(multiWeekSeries.seriesId);
      const picks = cur().weeklyPicks;
      for (const sw of multiWeekSeries.scheduleWeeks) {
        expect(picks[sw.seasonWeek]).toContain(multiWeekSeries.seriesId);
      }
    });

    it("does not duplicate if already picked in some weeks", () => {
      const firstWeek = multiWeekSeries.scheduleWeeks[0].seasonWeek;
      useAppStore.getState().addWeeklyPick(firstWeek, multiWeekSeries.seriesId);
      useAppStore.getState().addSeriesToAllWeeks(multiWeekSeries.seriesId);
      const count = cur().weeklyPicks[firstWeek]!.filter((id) => id === multiWeekSeries.seriesId).length;
      expect(count).toBe(1);
    });

    it("no-ops for unknown series ID", () => {
      useAppStore.getState().addSeriesToAllWeeks(999999);
      expect(cur().weeklyPicks).toEqual({});
    });
  });

  describe("loadSeasons", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("fetches current-season.json and becomes ready", async () => {
      const file = {
        currentSeasonId: "2026-S3",
        availableSeasons: [
          { id: "2026-S2", name: "2026 Season 2", startDate: "2026-03-17T00:00:00.000Z" },
          { id: "2026-S3", name: "2026 Season 3", startDate: "2026-06-09T00:00:00.000Z" },
        ],
        season: {
          seasonId: "2026-S3",
          seasonName: "2026 Season 3",
          seasonStartDate: "2026-06-09T00:00:00.000Z",
          series: [],
        },
      };
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => file });
      vi.stubGlobal("fetch", fetchMock);

      useAppStore.setState({ status: "idle", currentSeasonId: null, viewingSeasonId: null, seasonCache: {} });
      await useAppStore.getState().loadSeasons();

      const s = useAppStore.getState();
      expect(s.status).toBe("ready");
      expect(s.currentSeasonId).toBe("2026-S3");
      expect(s.viewingSeasonId).toBe("2026-S3");
      expect(s.availableSeasons).toHaveLength(2);
      expect(s.seasonCache["2026-S3"].seasonName).toBe("2026 Season 3");
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("sets error status when the fetch fails", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
      useAppStore.setState({ status: "idle" });
      await useAppStore.getState().loadSeasons();
      expect(useAppStore.getState().status).toBe("error");
    });
  });

  describe("weeklyMaybes (current season)", () => {
    it("toggleMaybe moves a pick to maybes", () => {
      useAppStore.setState({ seasonPicks: { [SEASON_ID]: { weeklyPicks: { 1: [100, 200] }, weeklyMaybes: {} } } });
      useAppStore.getState().toggleMaybe(1, 100);
      expect(cur().weeklyPicks[1]).toEqual([200]);
      expect(cur().weeklyMaybes[1]).toEqual([100]);
    });

    it("toggleMaybe moves a maybe back to picks", () => {
      useAppStore.setState({ seasonPicks: { [SEASON_ID]: { weeklyPicks: { 1: [200] }, weeklyMaybes: { 1: [100] } } } });
      useAppStore.getState().toggleMaybe(1, 100);
      expect(cur().weeklyMaybes[1]).toEqual([]);
      expect(cur().weeklyPicks[1]).toEqual([200, 100]);
    });

    it("toggleMaybe no-ops if series is in neither list", () => {
      useAppStore.setState({ seasonPicks: { [SEASON_ID]: { weeklyPicks: { 1: [200] }, weeklyMaybes: { 1: [300] } } } });
      useAppStore.getState().toggleMaybe(1, 999);
      expect(cur().weeklyPicks[1]).toEqual([200]);
      expect(cur().weeklyMaybes[1]).toEqual([300]);
    });

    it("removeWeeklyMaybe removes from maybes", () => {
      useAppStore.setState({ seasonPicks: { [SEASON_ID]: { weeklyPicks: {}, weeklyMaybes: { 1: [100, 200] } } } });
      useAppStore.getState().removeWeeklyMaybe(1, 100);
      expect(cur().weeklyMaybes[1]).toEqual([200]);
    });
  });
});
