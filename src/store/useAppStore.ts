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
  filters: FilterState;
  setFilters: (filters: Partial<FilterState>) => void;
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
      filters: {
        categories: [],
        licenseClasses: [],
        setupType: null,
        searchText: "",
        favoritesOnly: false,
      },
      setFilters: (filters) =>
        set((state) => ({
          filters: { ...state.filters, ...filters },
        })),
      exportData: () => {
        const { favorites, weeklyPicks } = get();
        return JSON.stringify({ favorites, weeklyPicks });
      },
      importData: (json) => {
        const data = JSON.parse(json);
        set({ favorites: data.favorites, weeklyPicks: data.weeklyPicks });
      },
    }),
    {
      name: "iracing-schedule-storage",
      partialize: (state) => ({
        favorites: state.favorites,
        weeklyPicks: state.weeklyPicks,
      }),
    }
  )
);
