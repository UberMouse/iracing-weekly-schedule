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

export interface FilterState {
  categories: Category[];
  licenseClasses: LicenseClass[];
  setupType: SetupType | null;
  searchText: string;
  favoritesOnly: boolean;
}
