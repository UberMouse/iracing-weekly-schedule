import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "../useAppStore";

describe("useAppStore", () => {
  beforeEach(() => {
    // Reset store state between tests
    useAppStore.setState({
      favorites: [],
      weeklyPicks: {},
      filters: {
        categories: [],
        licenseClasses: [],
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
      expect(useAppStore.getState().filters.categories).toEqual([]);
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
  });
});
