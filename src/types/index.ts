export type Category = "oval" | "dirt_oval" | "dirt_road" | "sports_car" | "formula";
export type LicenseClass = "R" | "D" | "C" | "B" | "A";
export type SetupType = "fixed" | "open";

export interface Car {
  carId: number;
  carName: string;
}

export interface WeekSchedule {
  weekNumber: number;
  trackName: string;
  trackConfig?: string;
}

export interface Series {
  seriesId: number;
  seriesName: string;
  category: Category;
  licenseClass: LicenseClass;
  setupType: SetupType;
  isMulticlass: boolean;
  cars: Car[];
  scheduleWeeks: WeekSchedule[];
}

export interface FilterState {
  categories: Category[];
  licenseClass: LicenseClass | null;
  setupType: SetupType | null;
  searchText: string;
  favoritesOnly: boolean;
}
