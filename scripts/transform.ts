import type { Series, Category, LicenseClass } from "../src/types";

// Raw API response types (minimal, matching what we actually use)
export interface RawSeries {
  series_id: number;
  series_name: string;
  category_id: number;
  min_license_level: number;
  fixed_setup: boolean;
  allowed_licenses: {
    group_name: string;
    min_license_level: number;
    max_license_level: number;
  }[];
}

export interface RawSeasonScheduleTrack {
  track_id: number;
  track_name: string;
  config_name?: string;
}

export interface RawSeasonSchedule {
  race_week_num: number;
  track: RawSeasonScheduleTrack;
}

export interface RawSeason {
  series_id: number;
  season_id: number;
  season_year: number;
  season_quarter: number;
  car_class_ids: number[];
  schedules: RawSeasonSchedule[];
}

export interface RawCarClass {
  car_class_id: number;
  name: string;
  cars_in_class: { car_id: number }[];
}

export interface RawCar {
  car_id: number;
  car_name: string;
}

const CATEGORY_MAP: Record<number, Category> = {
  1: "oval",
  2: "sports_car",
  3: "dirt_oval",
  4: "dirt_road",
  5: "sports_car",
  6: "formula",
};

function mapLicenseLevel(level: number): LicenseClass {
  if (level >= 16) return "A"; // A 1.0+ = 16+
  if (level >= 12) return "B"; // B 1.0+ = 12+
  if (level >= 8) return "C"; // C 1.0+ = 8+
  if (level >= 4) return "D"; // D 1.0+ = 4+
  return "R"; // Rookie = 1-3
}

export function transformToSeries(
  rawSeries: RawSeries[],
  rawSeasons: RawSeason[],
  rawCars: RawCar[],
  rawCarClasses: RawCarClass[],
): Series[] {
  const carMap = new Map(rawCars.map((c) => [c.car_id, c]));
  const carClassMap = new Map(
    rawCarClasses.map((cc) => [cc.car_class_id, cc]),
  );
  const seasonBySeriesId = new Map(
    rawSeasons.map((s) => [s.series_id, s]),
  );

  return rawSeries
    .filter((s) => seasonBySeriesId.has(s.series_id))
    .map((s) => {
      const season = seasonBySeriesId.get(s.series_id)!;

      // Resolve cars from car classes
      const carIds = new Set(
        season.car_class_ids.flatMap((ccId) => {
          const cc = carClassMap.get(ccId);
          return cc ? cc.cars_in_class.map((c) => c.car_id) : [];
        }),
      );

      const cars = [...carIds]
        .map((id) => carMap.get(id))
        .filter((c): c is RawCar => c !== undefined)
        .map((c) => ({ carId: c.car_id, carName: c.car_name }));

      // Map schedule weeks (API uses 0-indexed, we use 1-indexed)
      const scheduleWeeks = season.schedules
        .slice()
        .sort((a, b) => a.race_week_num - b.race_week_num)
        .map((week) => ({
          weekNumber: week.race_week_num + 1,
          trackName: week.track.track_name,
          ...(week.track.config_name
            ? { trackConfig: week.track.config_name }
            : {}),
        }));

      return {
        seriesId: s.series_id,
        seriesName: s.series_name,
        category: CATEGORY_MAP[s.category_id] ?? "sports_car",
        licenseClass: mapLicenseLevel(s.min_license_level),
        setupType: s.fixed_setup ? "fixed" : "open",
        isMulticlass: season.car_class_ids.length > 1,
        cars,
        scheduleWeeks,
      } satisfies Series;
    });
}
