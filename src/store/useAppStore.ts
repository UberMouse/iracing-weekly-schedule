import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Series, FilterState } from "../types";
import seasonData from "../data/season.json";

interface AppStore {
  series: Series[];
  favorites: number[];
  toggleFavorite: (seriesId: number) => void;
  weeklyPicks: Record<number, number[]>;
  addWeeklyPick: (week: number, seriesId: number) => void;
  removeWeeklyPick: (week: number, seriesId: number) => void;
  addSeriesToAllWeeks: (seriesId: number) => void;
  weeklyMaybes: Record<number, number[]>;
  toggleMaybe: (week: number, seriesId: number) => void;
  removeWeeklyMaybe: (week: number, seriesId: number) => void;
  filters: FilterState;
  setFilters: (filters: Partial<FilterState>) => void;
  modalShowAllSeries: boolean;
  setModalShowAllSeries: (value: boolean) => void;
  exportData: () => string;
  importData: (json: string) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      series: seasonData as Series[],
      favorites: [],
      toggleFavorite: (seriesId) =>
        set((state) => ({
          favorites: state.favorites.includes(seriesId)
            ? state.favorites.filter((id) => id !== seriesId)
            : [...state.favorites, seriesId],
        })),
      weeklyPicks: {},
      addWeeklyPick: (week, seriesId) =>
        set((state) => {
          const current = state.weeklyPicks[week] ?? [];
          if (current.includes(seriesId)) return state;
          return {
            weeklyPicks: { ...state.weeklyPicks, [week]: [...current, seriesId] },
          };
        }),
      removeWeeklyPick: (week, seriesId) =>
        set((state) => ({
          weeklyPicks: {
            ...state.weeklyPicks,
            [week]: (state.weeklyPicks[week] ?? []).filter((id) => id !== seriesId),
          },
        })),
      addSeriesToAllWeeks: (seriesId) =>
        set((state) => {
          const s = state.series.find((s) => s.seriesId === seriesId);
          if (!s) return state;
          const newPicks = { ...state.weeklyPicks };
          for (const sw of s.scheduleWeeks) {
            const current = newPicks[sw.seasonWeek] ?? [];
            if (!current.includes(seriesId)) {
              newPicks[sw.seasonWeek] = [...current, seriesId];
            }
          }
          return { weeklyPicks: newPicks };
        }),
      weeklyMaybes: {},
      toggleMaybe: (week, seriesId) =>
        set((state) => {
          const picks = state.weeklyPicks[week] ?? [];
          const maybes = state.weeklyMaybes[week] ?? [];
          if (picks.includes(seriesId)) {
            return {
              weeklyPicks: { ...state.weeklyPicks, [week]: picks.filter((id) => id !== seriesId) },
              weeklyMaybes: { ...state.weeklyMaybes, [week]: [...maybes, seriesId] },
            };
          }
          if (maybes.includes(seriesId)) {
            return {
              weeklyMaybes: { ...state.weeklyMaybes, [week]: maybes.filter((id) => id !== seriesId) },
              weeklyPicks: { ...state.weeklyPicks, [week]: [...picks, seriesId] },
            };
          }
          return state;
        }),
      removeWeeklyMaybe: (week, seriesId) =>
        set((state) => ({
          weeklyMaybes: {
            ...state.weeklyMaybes,
            [week]: (state.weeklyMaybes[week] ?? []).filter((id) => id !== seriesId),
          },
        })),
      filters: {
        categories: ["oval", "dirt_oval", "dirt_road", "sports_car", "formula"],
        licenseClasses: ["R", "D", "C", "B", "A"],
        setupType: null,
        searchText: "",
        favoritesOnly: false,
      },
      setFilters: (filters) =>
        set((state) => ({
          filters: { ...state.filters, ...filters },
        })),
      modalShowAllSeries: true,
      setModalShowAllSeries: (value) => set({ modalShowAllSeries: value }),
      exportData: () => {
        const { favorites, weeklyPicks, weeklyMaybes } = get();
        return JSON.stringify({ favorites, weeklyPicks, weeklyMaybes });
      },
      importData: (json) => {
        const data = JSON.parse(json);
        set({ favorites: data.favorites, weeklyPicks: data.weeklyPicks, weeklyMaybes: data.weeklyMaybes ?? {} });
      },
    }),
    {
      name: "iracing-schedule-storage",
      partialize: (state) => ({
        favorites: state.favorites,
        weeklyPicks: state.weeklyPicks,
        weeklyMaybes: state.weeklyMaybes,
        modalShowAllSeries: state.modalShowAllSeries,
        filters: state.filters,
      }),
    }
  )
);
