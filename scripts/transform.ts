import type { Series, Category, LicenseClass, TrackMapLayers } from "../src/types";

const TRACK_IMAGE_BASE = "https://images-static.iracing.com/";

function resolveTrackMapBase(trackMap: string): string {
  // track_map may be a full URL or a relative path
  if (trackMap.startsWith("http://") || trackMap.startsWith("https://")) {
    return trackMap;
  }
  return `${TRACK_IMAGE_BASE}${trackMap}`;
}

// Raw API response types (minimal, matching what we actually use)
export interface RawSeries {
  series_id: number;
  series_name: string;
  category_id: number;
  min_license_level: number;
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

export interface RawWeatherSummary {
  precip_chance?: number;
  max_precip_rate_desc?: string;
}

export interface RawWeather {
  precip_option?: number;
  weather_summary?: RawWeatherSummary;
}

export interface RawRaceTimeDescriptor {
  repeating: boolean;
  session_minutes: number;
  repeat_minutes?: number | null;
  super_session?: boolean;
}

export interface RawSeasonSchedule {
  race_week_num: number;
  start_date?: string;
  track: RawSeasonScheduleTrack;
  weather?: RawWeather;
  race_time_limit?: number | null;
  race_time_descriptors?: RawRaceTimeDescriptor[];
}

export interface RawSeason {
  series_id: number;
  season_id: number;
  season_year: number;
  season_quarter: number;
  fixed_setup: boolean;
  car_class_ids: number[];
  schedules: RawSeasonSchedule[];
}

/** Detailed schedule from /data/series/season_schedule/{season_id} */
export interface RawDetailedSchedule {
  schedules: {
    race_week_num: number;
    race_time_limit?: number | null;
    race_time_descriptors?: RawRaceTimeDescriptor[];
    race_week_cars?: { car_id: number; car_name: string; car_name_abbreviated?: string }[];
  }[];
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

export interface RawTrackAsset {
  track_map?: string;
  track_map_layers?: {
    background?: string;
    inactive?: string;
    active?: string;
    pitroad?: string;
    "start-finish"?: string;
    turns?: string;
  };
}

const CATEGORY_MAP: Record<number, Category> = {
  1: "oval",
  2: "sports_car",
  3: "dirt_oval",
  4: "dirt_road",
  5: "sports_car",
  6: "formula",
};

function mapLicenseClassFromAllowedLicenses(
  allowedLicenses: RawSeries["allowed_licenses"],
): LicenseClass {
  if (!allowedLicenses || allowedLicenses.length === 0) return "R";

  // Entries where min === max are crossover entries (e.g. B 4.0 can enter A-class).
  // The series' true class is the lowest group with a full license range.
  const sorted = [...allowedLicenses].sort(
    (a, b) => a.min_license_level - b.min_license_level,
  );
  const primary =
    sorted.find((e) => e.min_license_level !== e.max_license_level) ??
    sorted[0];

  const name = primary.group_name.toLowerCase();
  if (name.includes("class a")) return "A";
  if (name.includes("class b")) return "B";
  if (name.includes("class c")) return "C";
  if (name.includes("class d")) return "D";
  return "R";
}

function buildTrackMapUrl(asset: RawTrackAsset | undefined): string | undefined {
  if (!asset?.track_map || !asset.track_map_layers?.active) return undefined;
  const base = resolveTrackMapBase(asset.track_map);
  return `${base}${asset.track_map_layers.active}`;
}

function buildTrackMapLayers(asset: RawTrackAsset | undefined): TrackMapLayers | undefined {
  if (!asset?.track_map || !asset.track_map_layers) return undefined;
  const base = resolveTrackMapBase(asset.track_map);
  const layers = asset.track_map_layers;
  return {
    ...(layers.background ? { background: `${base}${layers.background}` } : {}),
    ...(layers.inactive ? { inactive: `${base}${layers.inactive}` } : {}),
    ...(layers.active ? { active: `${base}${layers.active}` } : {}),
    ...(layers.pitroad ? { pitroad: `${base}${layers.pitroad}` } : {}),
    ...(layers["start-finish"] ? { startFinish: `${base}${layers["start-finish"]}` } : {}),
    ...(layers.turns ? { turns: `${base}${layers.turns}` } : {}),
  };
}

/**
 * Determine the season start date from the earliest start_date of any
 * standard 12-week series (race_week_num=0). Falls back to the earliest
 * start_date across all seasons if no 12-week series exists.
 */
function findSeasonStartDate(rawSeasons: RawSeason[]): Date | undefined {
  let earliest: Date | undefined;

  // Prefer start_date from a standard 12-week series' first week
  for (const season of rawSeasons) {
    if (season.schedules.length === 12) {
      const week0 = season.schedules.find((s) => s.race_week_num === 0);
      if (week0?.start_date) {
        const d = new Date(week0.start_date);
        if (!earliest || d < earliest) earliest = d;
      }
    }
  }

  // Fallback: earliest start_date from any race_week_num=0
  if (!earliest) {
    for (const season of rawSeasons) {
      const week0 = season.schedules.find((s) => s.race_week_num === 0);
      if (week0?.start_date) {
        const d = new Date(week0.start_date);
        if (!earliest || d < earliest) earliest = d;
      }
    }
  }

  return earliest;
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Compute season week (1-12) from a schedule entry's start_date relative
 * to the season start. Returns undefined if the entry falls outside the
 * current 12-week season window.
 */
function computeSeasonWeek(
  startDate: string | undefined,
  seasonStart: Date | undefined,
  fallbackWeekNum: number,
): number | undefined {
  // If we have dates, always use them for accurate mapping
  if (startDate && seasonStart) {
    const entryDate = new Date(startDate);
    const diffMs = entryDate.getTime() - seasonStart.getTime();
    const weekIndex = Math.floor(diffMs / MS_PER_WEEK);

    // Only include weeks that fall within the 12-week season window
    if (weekIndex < 0 || weekIndex >= 12) return undefined;
    return weekIndex + 1;
  }

  // Fallback: use weekNumber directly (assumes 1:1 mapping)
  if (fallbackWeekNum >= 1 && fallbackWeekNum <= 12) {
    return fallbackWeekNum;
  }
  return undefined;
}

/**
 * Extract session minutes from detailed schedule data.
 * Uses session_minutes from race_time_descriptors (covers both time- and lap-limited races),
 * falling back to race_time_limit from the basic seasons endpoint.
 */
function resolveIsRepeating(
  season: RawSeason,
  detailedSchedules?: Map<number, RawDetailedSchedule>,
): boolean {
  const detailed = detailedSchedules?.get(season.season_id);
  const firstWeek = detailed?.schedules[0];
  const descriptor = firstWeek?.race_time_descriptors?.[0];
  return descriptor?.repeating ?? true; // default to true (most series repeat)
}

function resolveSessionMinutes(
  season: RawSeason,
  detailedSchedules?: Map<number, RawDetailedSchedule>,
): number | null {
  const detailed = detailedSchedules?.get(season.season_id);
  if (detailed) {
    const firstWeek = detailed.schedules[0];
    // session_minutes from race_time_descriptors captures actual session duration
    // for both time-limited and lap-limited races
    const descriptor = firstWeek?.race_time_descriptors?.[0];
    if (descriptor && descriptor.session_minutes > 0) {
      return descriptor.session_minutes;
    }
    // Fall back to race_time_limit from detailed schedule
    if (firstWeek?.race_time_limit && firstWeek.race_time_limit > 0) {
      return firstWeek.race_time_limit;
    }
  }

  // Fall back to race_time_limit from basic seasons endpoint
  const firstSchedule = season.schedules[0];
  if (firstSchedule?.race_time_limit && firstSchedule.race_time_limit > 0) {
    return firstSchedule.race_time_limit;
  }

  return null;
}

export function transformToSeries(
  rawSeries: RawSeries[],
  rawSeasons: RawSeason[],
  rawCars: RawCar[],
  rawCarClasses: RawCarClass[],
  trackAssets?: Record<string, RawTrackAsset>,
  detailedSchedules?: Map<number, RawDetailedSchedule>,
): Series[] {
  const carMap = new Map(rawCars.map((c) => [c.car_id, c]));
  const carClassMap = new Map(
    rawCarClasses.map((cc) => [cc.car_class_id, cc]),
  );
  const seasonBySeriesId = new Map(
    rawSeasons.map((s) => [s.series_id, s]),
  );
  const seasonStart = findSeasonStartDate(rawSeasons);

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

      const totalScheduleWeeks = season.schedules.length;
      const raceTimeMinutes = resolveSessionMinutes(season, detailedSchedules);
      const isRepeating = resolveIsRepeating(season, detailedSchedules);

      // Map schedule weeks (API uses 0-indexed, we use 1-indexed)
      const scheduleWeeks = season.schedules
        .slice()
        .sort((a, b) => a.race_week_num - b.race_week_num)
        .map((week) => {
          const weekNumber = week.race_week_num + 1;
          const seasonWeek = computeSeasonWeek(
            week.start_date,
            seasonStart,
            weekNumber,
          );
          const trackId = week.track.track_id;
          const asset = trackAssets?.[String(trackId)];
          const trackMapUrl = buildTrackMapUrl(asset);
          const trackMapLayers = buildTrackMapLayers(asset);

          // Resolve per-week cars from the detailed schedule
          const detailed = detailedSchedules?.get(season.season_id);
          const detailedWeek = detailed?.schedules.find(
            (dw) => dw.race_week_num === week.race_week_num,
          );
          const weekCars = detailedWeek?.race_week_cars
            ?.map((c) => ({ carId: c.car_id, carName: c.car_name }))
            ?? undefined;

          return {
            weekNumber,
            seasonWeek,
            trackId,
            trackName: week.track.track_name,
            ...(week.track.config_name
              ? { trackConfig: week.track.config_name }
              : {}),
            rainChance: week.weather?.weather_summary?.precip_chance ?? 0,
            rainEnabled: (week.weather?.precip_option ?? 0) > 0,
            ...(week.weather?.weather_summary?.max_precip_rate_desc
              ? { maxPrecipDesc: week.weather.weather_summary.max_precip_rate_desc }
              : {}),
            ...(trackMapUrl ? { trackMapUrl } : {}),
            ...(trackMapLayers ? { trackMapLayers } : {}),
            ...(weekCars ? { cars: weekCars } : {}),
          };
        })
        // Filter to only weeks in the current season (seasonWeek 1-12)
        .filter((w): w is typeof w & { seasonWeek: number } => w.seasonWeek !== undefined);

      return {
        seriesId: s.series_id,
        seriesName: s.series_name,
        category: CATEGORY_MAP[s.category_id] ?? "sports_car",
        licenseClass: mapLicenseClassFromAllowedLicenses(s.allowed_licenses),
        setupType: season.fixed_setup ? "fixed" : "open",
        isMulticlass: season.car_class_ids.length > 1,
        totalWeeks: totalScheduleWeeks,
        raceTimeMinutes,
        isRepeating,
        cars,
        scheduleWeeks,
      } satisfies Series;
    });
}
