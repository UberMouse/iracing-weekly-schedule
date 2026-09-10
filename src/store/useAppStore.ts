import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Series, FilterState } from "../types";

/** Lightweight descriptor used to populate the season switcher. */
export interface SeasonMeta {
  id: string;
  name: string;
  startDate: string;
  /** Scraped from iRacing's preliminary schedule PDF, not the Data API. */
  provisional?: boolean;
}

/** A single season's full data, as served from public/seasons/<id>.json */
export interface SeasonData {
  seasonId: string;
  seasonName: string;
  seasonStartDate: string;
  series: Series[];
  /** Scraped from iRacing's preliminary schedule PDF, not the Data API. */
  provisional?: boolean;
  /**
   * Present on the season that has just replaced a provisional import: maps the
   * provisional series ids onto the official ones. Replayed once per season.
   */
  seriesIdRemap?: Record<string, number>;
}

/** The entry-point blob fetched on app load. */
interface CurrentSeasonFile {
  currentSeasonId: string;
  availableSeasons: SeasonMeta[];
  season: SeasonData;
}

/** Per-season weekly picks. Keyed by season id so history is never destroyed. */
export interface SeasonPicks {
  weeklyPicks: Record<number, number[]>;
  weeklyMaybes: Record<number, number[]>;
}

type LoadStatus = "idle" | "loading" | "ready" | "error";

// The currently-committed data (start 2026-03-17) is iRacing's 2026 Season 2.
// Legacy flat picks from before the per-season model are attributed to it.
const LEGACY_SEASON_ID = "2026-S2";

const EMPTY_SERIES: Series[] = [];
const EMPTY_PICKS: SeasonPicks = { weeklyPicks: {}, weeklyMaybes: {} };

const SEASONS_URL = `${import.meta.env.BASE_URL}seasons`;

interface AppStore {
  // Season loading / selection
  status: LoadStatus;
  error: string | null;
  currentSeasonId: string | null;
  availableSeasons: SeasonMeta[];
  viewingSeasonId: string | null;
  seasonCache: Record<string, SeasonData>;
  loadingSeasonIds: string[];
  loadSeasons: () => Promise<void>;
  loadSeason: (id: string) => Promise<void>;
  setViewingSeason: (id: string) => void;

  // Per-season picks (persisted) + global favorites/filters
  seasonPicks: Record<string, SeasonPicks>;
  favorites: number[];
  /** Season ids whose provisional->official series id remap has been replayed. */
  appliedSeriesRemaps: string[];
  filters: FilterState;
  modalShowAllSeries: boolean;

  toggleFavorite: (seriesId: number) => void;
  addWeeklyPick: (week: number, seriesId: number) => void;
  removeWeeklyPick: (week: number, seriesId: number) => void;
  addSeriesToAllWeeks: (seriesId: number) => void;
  toggleMaybe: (week: number, seriesId: number) => void;
  removeWeeklyMaybe: (week: number, seriesId: number) => void;

  setFilters: (filters: Partial<FilterState>) => void;
  setModalShowAllSeries: (value: boolean) => void;
  exportData: () => string;
  importData: (json: string) => void;
}

/**
 * Rewrite picks (and provisional-only favourites) after official data replaces
 * a PDF import, so selections made before the season opened survive.
 *
 * Picks are remapped in full: they are scoped to this season, so every id in
 * them came from the provisional archive. Favourites are global and long-lived,
 * so only synthetic ids — always negative, and impossible to have favourited in
 * an earlier season — are moved. A real id there may predate the import.
 */
function applySeriesIdRemap(
  seasonPicks: Record<string, SeasonPicks>,
  favorites: number[],
  seasonId: string,
  remap: Record<string, number>,
): { seasonPicks: Record<string, SeasonPicks>; favorites: number[] } {
  const remapId = (id: number): number => remap[String(id)] ?? id;
  const remapWeeks = (weeks: Record<number, number[]>): Record<number, number[]> =>
    Object.fromEntries(
      Object.entries(weeks).map(([week, ids]) => [week, [...new Set(ids.map(remapId))]]),
    );

  const picks = seasonPicks[seasonId];
  const nextPicks = picks
    ? {
        ...seasonPicks,
        [seasonId]: {
          weeklyPicks: remapWeeks(picks.weeklyPicks),
          weeklyMaybes: remapWeeks(picks.weeklyMaybes),
        },
      }
    : seasonPicks;

  const nextFavorites = [...new Set(favorites.map((id) => (id < 0 ? remapId(id) : id)))];

  return { seasonPicks: nextPicks, favorites: nextFavorites };
}

/** Apply a transform to the *current* season's picks (edits only ever target it). */
function updateCurrentPicks(
  state: AppStore,
  fn: (picks: SeasonPicks) => SeasonPicks,
): Partial<AppStore> {
  const id = state.currentSeasonId;
  if (!id) return {};
  const cur = state.seasonPicks[id] ?? EMPTY_PICKS;
  return { seasonPicks: { ...state.seasonPicks, [id]: fn(cur) } };
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      status: "idle",
      error: null,
      currentSeasonId: null,
      availableSeasons: [],
      viewingSeasonId: null,
      seasonCache: {},
      loadingSeasonIds: [],

      loadSeasons: async () => {
        if (get().status === "loading") return;
        set({ status: "loading", error: null });
        try {
          const res = await fetch(`${SEASONS_URL}/current-season.json?v=${__BUILD_VERSION__}`, {
            cache: "no-store",
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as CurrentSeasonFile;
          set((state) => {
            const { seasonId, seriesIdRemap } = data.season;
            // Replay a provisional->official id remap at most once per season;
            // re-applying could move ids that are legitimate targets.
            const shouldRemap =
              !!seriesIdRemap && !state.appliedSeriesRemaps.includes(seasonId);
            const remapped = shouldRemap
              ? applySeriesIdRemap(state.seasonPicks, state.favorites, seasonId, seriesIdRemap)
              : null;

            return {
              status: "ready",
              currentSeasonId: data.currentSeasonId,
              availableSeasons: data.availableSeasons,
              seasonCache: { ...state.seasonCache, [seasonId]: data.season },
              // Always reset the viewed season to current on load.
              viewingSeasonId: data.currentSeasonId,
              ...(remapped ?? {}),
              ...(shouldRemap
                ? { appliedSeriesRemaps: [...state.appliedSeriesRemaps, seasonId] }
                : {}),
            };
          });
        } catch (e) {
          set({
            status: "error",
            error: e instanceof Error ? e.message : "Failed to load season data",
          });
        }
      },

      loadSeason: async (id) => {
        const state = get();
        if (state.seasonCache[id] || state.loadingSeasonIds.includes(id)) return;
        set((s) => ({ loadingSeasonIds: [...s.loadingSeasonIds, id] }));
        try {
          // Past-season archives are immutable, so no cache-bust needed.
          const res = await fetch(`${SEASONS_URL}/${id}.json`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as SeasonData;
          set((s) => ({
            seasonCache: { ...s.seasonCache, [id]: data },
            loadingSeasonIds: s.loadingSeasonIds.filter((x) => x !== id),
          }));
        } catch {
          set((s) => ({ loadingSeasonIds: s.loadingSeasonIds.filter((x) => x !== id) }));
        }
      },

      setViewingSeason: (id) => {
        set({ viewingSeasonId: id });
        if (!get().seasonCache[id]) void get().loadSeason(id);
      },

      seasonPicks: {},
      favorites: [],
      appliedSeriesRemaps: [],

      toggleFavorite: (seriesId) =>
        set((state) => ({
          favorites: state.favorites.includes(seriesId)
            ? state.favorites.filter((id) => id !== seriesId)
            : [...state.favorites, seriesId],
        })),

      addWeeklyPick: (week, seriesId) =>
        set((state) =>
          updateCurrentPicks(state, (cur) => {
            const current = cur.weeklyPicks[week] ?? [];
            if (current.includes(seriesId)) return cur;
            return {
              ...cur,
              weeklyPicks: { ...cur.weeklyPicks, [week]: [...current, seriesId] },
            };
          }),
        ),

      removeWeeklyPick: (week, seriesId) =>
        set((state) =>
          updateCurrentPicks(state, (cur) => ({
            ...cur,
            weeklyPicks: {
              ...cur.weeklyPicks,
              [week]: (cur.weeklyPicks[week] ?? []).filter((id) => id !== seriesId),
            },
          })),
        ),

      addSeriesToAllWeeks: (seriesId) =>
        set((state) => {
          const id = state.currentSeasonId;
          const s = id ? state.seasonCache[id]?.series.find((x) => x.seriesId === seriesId) : undefined;
          if (!s) return {};
          return updateCurrentPicks(state, (cur) => {
            const weeklyPicks = { ...cur.weeklyPicks };
            for (const sw of s.scheduleWeeks) {
              const current = weeklyPicks[sw.seasonWeek] ?? [];
              if (!current.includes(seriesId)) {
                weeklyPicks[sw.seasonWeek] = [...current, seriesId];
              }
            }
            return { ...cur, weeklyPicks };
          });
        }),

      toggleMaybe: (week, seriesId) =>
        set((state) =>
          updateCurrentPicks(state, (cur) => {
            const picks = cur.weeklyPicks[week] ?? [];
            const maybes = cur.weeklyMaybes[week] ?? [];
            if (picks.includes(seriesId)) {
              return {
                weeklyPicks: { ...cur.weeklyPicks, [week]: picks.filter((id) => id !== seriesId) },
                weeklyMaybes: { ...cur.weeklyMaybes, [week]: [...maybes, seriesId] },
              };
            }
            if (maybes.includes(seriesId)) {
              return {
                weeklyMaybes: { ...cur.weeklyMaybes, [week]: maybes.filter((id) => id !== seriesId) },
                weeklyPicks: { ...cur.weeklyPicks, [week]: [...picks, seriesId] },
              };
            }
            return cur;
          }),
        ),

      removeWeeklyMaybe: (week, seriesId) =>
        set((state) =>
          updateCurrentPicks(state, (cur) => ({
            ...cur,
            weeklyMaybes: {
              ...cur.weeklyMaybes,
              [week]: (cur.weeklyMaybes[week] ?? []).filter((id) => id !== seriesId),
            },
          })),
        ),

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
        const { seasonPicks, favorites } = get();
        return JSON.stringify({ version: 2, seasonPicks, favorites });
      },
      importData: (json) => {
        const data = JSON.parse(json);
        if (data.seasonPicks) {
          set({ seasonPicks: data.seasonPicks, favorites: data.favorites ?? [] });
          return;
        }
        // Legacy flat export ({ favorites, weeklyPicks, weeklyMaybes }) — fold into
        // the current season (or the legacy id if data hasn't loaded yet).
        if (data.weeklyPicks || data.weeklyMaybes) {
          const id = get().currentSeasonId ?? LEGACY_SEASON_ID;
          set((state) => ({
            seasonPicks: {
              ...state.seasonPicks,
              [id]: {
                weeklyPicks: data.weeklyPicks ?? {},
                weeklyMaybes: data.weeklyMaybes ?? {},
              },
            },
            favorites: data.favorites ?? [],
          }));
        }
      },
    }),
    {
      name: "iracing-schedule-storage",
      version: 1,
      partialize: (state) => ({
        seasonPicks: state.seasonPicks,
        favorites: state.favorites,
        appliedSeriesRemaps: state.appliedSeriesRemaps,
        modalShowAllSeries: state.modalShowAllSeries,
        filters: state.filters,
      }),
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        // v0 → v1: flat weeklyPicks/weeklyMaybes become per-season picks under 2026-S2.
        if (version < 1 && p.weeklyPicks && !p.seasonPicks) {
          p.seasonPicks = {
            [LEGACY_SEASON_ID]: {
              weeklyPicks: p.weeklyPicks ?? {},
              weeklyMaybes: p.weeklyMaybes ?? {},
            },
          };
          delete p.weeklyPicks;
          delete p.weeklyMaybes;
        }
        return p;
      },
    },
  ),
);

/** The current season's series (browse + add). Empty until loaded. */
export function useCurrentSeries(): Series[] {
  return useAppStore((s) => {
    const id = s.currentSeasonId;
    return (id ? s.seasonCache[id]?.series : undefined) ?? EMPTY_SERIES;
  });
}

/** The current season's picks. */
export function useCurrentPicks(): SeasonPicks {
  return useAppStore((s) => {
    const id = s.currentSeasonId;
    return (id ? s.seasonPicks[id] : undefined) ?? EMPTY_PICKS;
  });
}

/**
 * Whether the season currently on screen came from iRacing's preliminary
 * schedule PDF rather than the Data API. Read from `availableSeasons` so it is
 * known for past seasons too, without fetching their archive.
 */
export function useViewingSeasonIsProvisional(): boolean {
  return useAppStore((s) => {
    const id = s.viewingSeasonId;
    if (!id) return false;
    return s.availableSeasons.find((season) => season.id === id)?.provisional ?? false;
  });
}
