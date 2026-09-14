export * from "./track-usage";

export type Category = "oval" | "dirt_oval" | "dirt_road" | "sports_car" | "formula";
export type LicenseClass = "R" | "D" | "C" | "B" | "A";
export type SetupType = "fixed" | "open";

export interface Car {
  carId: number;
  carName: string;
}

export interface TrackMapLayers {
  background?: string;
  inactive?: string;
  active?: string;
  pitroad?: string;
  startFinish?: string;
  turns?: string;
}

/**
 * Per-week race start time(s), derived from the detailed schedule's
 * `race_time_descriptors[0]` (`/data/series/season_schedule/{season_id}`).
 */
export type RaceTimes =
  // A single session that repeats every `repeatMinutes` around the clock,
  // starting at `firstSessionTime` (e.g. most sprint series).
  | { kind: "repeating"; firstSessionTime: string /* "HH:MM", UTC */; repeatMinutes: number; sessionMinutes: number | null }
  // A fixed list of session start times for the week, as given by the API
  // (e.g. NASCAR-style weekly slots), rather than a repeating cadence.
  | { kind: "scheduled"; sessionTimes: string[] /* ISO-8601 UTC, as the API gives them */; sessionMinutes: number | null };

export interface WeekSchedule {
  weekNumber: number;
  seasonWeek: number;
  trackId: number;
  trackName: string;
  trackConfig?: string;
  rainChance: number;
  rainEnabled: boolean;
  maxPrecipDesc?: string;
  trackMapUrl?: string;
  trackMapLayers?: TrackMapLayers;
  cars?: Car[];
  raceTimes?: RaceTimes;
}

export interface Series {
  seriesId: number;
  seriesName: string;
  category: Category;
  licenseClass: LicenseClass;
  setupType: SetupType;
  isMulticlass: boolean;
  totalWeeks: number;
  raceTimeMinutes: number | null;
  isRepeating: boolean;
  cars: Car[];
  scheduleWeeks: WeekSchedule[];
}

export type EventType = "sprint" | "endurance" | "special";

export function classifyEventType(raceTimeMinutes: number | null, isRepeating: boolean): EventType {
  if (isRepeating) return "sprint";
  if (raceTimeMinutes !== null && raceTimeMinutes > 180) return "special";
  return "endurance";
}

export function isCarRotation(series: Series): boolean {
  return (
    series.scheduleWeeks.length > 1 &&
    series.scheduleWeeks.every((w) => w.trackId === series.scheduleWeeks[0].trackId) &&
    series.scheduleWeeks.some((w) => w.cars && w.cars.length > 0)
  );
}

export interface FilterState {
  categories: Category[];
  licenseClasses: LicenseClass[];
  setupType: SetupType | null;
  searchText: string;
  favoritesOnly: boolean;
}
