import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "../useAppStore";

describe("useAppStore", () => {
  beforeEach(() => {
    // Reset store state between tests
    useAppStore.setState({
      favorites: [],
      weeklyPicks: {},
      weeklyMaybes: {},
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

  describe("weeklyPicks", () => {
    it("adds a pick to a week", () => {
      useAppStore.getState().addWeeklyPick(1, 100);
      expect(useAppStore.getState().weeklyPicks[1]).toContain(100);
    });

    it("does not add duplicate pick", () => {
      useAppStore.getState().addWeeklyPick(1, 100);
      useAppStore.getState().addWeeklyPick(1, 100);
      expect(useAppStore.getState().weeklyPicks[1]).toEqual([100]);
    });

    it("removes a pick from a week", () => {
      useAppStore.setState({ weeklyPicks: { 1: [100, 200] } });
      useAppStore.getState().removeWeeklyPick(1, 100);
      expect(useAppStore.getState().weeklyPicks[1]).toEqual([200]);
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
    it("exports and imports user data", () => {
      useAppStore.setState({ favorites: [1, 2], weeklyPicks: { 1: [1] } });
      const json = useAppStore.getState().exportData();
      useAppStore.setState({ favorites: [], weeklyPicks: {} });
      useAppStore.getState().importData(json);
      expect(useAppStore.getState().favorites).toEqual([1, 2]);
      expect(useAppStore.getState().weeklyPicks).toEqual({ 1: [1] });
    });

    it("exports and imports weeklyMaybes", () => {
      useAppStore.setState({ favorites: [1], weeklyPicks: {}, weeklyMaybes: { 2: [1] } });
      const json = useAppStore.getState().exportData();
      useAppStore.setState({ weeklyMaybes: {} });
      useAppStore.getState().importData(json);
      expect(useAppStore.getState().weeklyMaybes).toEqual({ 2: [1] });
    });

    it("imports old format without weeklyMaybes gracefully", () => {
      const oldJson = JSON.stringify({ favorites: [1], weeklyPicks: { 1: [1] } });
      useAppStore.getState().importData(oldJson);
      expect(useAppStore.getState().weeklyMaybes).toEqual({});
    });
  });

  describe("addSeriesToAllWeeks", () => {
    it("adds series to all weeks it races in", () => {
      const series = useAppStore.getState().series;
      const multiWeekSeries = series.find((s) => s.scheduleWeeks.length > 1);
      if (!multiWeekSeries) return;
      useAppStore.getState().addSeriesToAllWeeks(multiWeekSeries.seriesId);
      const picks = useAppStore.getState().weeklyPicks;
      for (const sw of multiWeekSeries.scheduleWeeks) {
        expect(picks[sw.seasonWeek]).toContain(multiWeekSeries.seriesId);
      }
    });

    it("does not duplicate if already picked in some weeks", () => {
      const series = useAppStore.getState().series;
      const multiWeekSeries = series.find((s) => s.scheduleWeeks.length > 1);
      if (!multiWeekSeries) return;
      const firstWeek = multiWeekSeries.scheduleWeeks[0].seasonWeek;
      useAppStore.getState().addWeeklyPick(firstWeek, multiWeekSeries.seriesId);
      useAppStore.getState().addSeriesToAllWeeks(multiWeekSeries.seriesId);
      const picks = useAppStore.getState().weeklyPicks;
      const count = picks[firstWeek]!.filter((id) => id === multiWeekSeries.seriesId).length;
      expect(count).toBe(1);
    });

    it("no-ops for unknown series ID", () => {
      useAppStore.getState().addSeriesToAllWeeks(999999);
      expect(useAppStore.getState().weeklyPicks).toEqual({});
    });
  });

  describe("weeklyMaybes", () => {
    it("toggleMaybe moves a pick to maybes", () => {
      useAppStore.setState({ weeklyPicks: { 1: [100, 200] } });
      useAppStore.getState().toggleMaybe(1, 100);
      expect(useAppStore.getState().weeklyPicks[1]).toEqual([200]);
      expect(useAppStore.getState().weeklyMaybes[1]).toEqual([100]);
    });

    it("toggleMaybe moves a maybe back to picks", () => {
      useAppStore.setState({ weeklyPicks: { 1: [200] }, weeklyMaybes: { 1: [100] } });
      useAppStore.getState().toggleMaybe(1, 100);
      expect(useAppStore.getState().weeklyMaybes[1]).toEqual([]);
      expect(useAppStore.getState().weeklyPicks[1]).toEqual([200, 100]);
    });

    it("toggleMaybe no-ops if series is in neither list", () => {
      useAppStore.setState({ weeklyPicks: { 1: [200] }, weeklyMaybes: { 1: [300] } });
      useAppStore.getState().toggleMaybe(1, 999);
      expect(useAppStore.getState().weeklyPicks[1]).toEqual([200]);
      expect(useAppStore.getState().weeklyMaybes[1]).toEqual([300]);
    });

    it("removeWeeklyMaybe removes from maybes", () => {
      useAppStore.setState({ weeklyMaybes: { 1: [100, 200] } });
      useAppStore.getState().removeWeeklyMaybe(1, 100);
      expect(useAppStore.getState().weeklyMaybes[1]).toEqual([200]);
    });
  });
});
