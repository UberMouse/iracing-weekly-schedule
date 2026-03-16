import { describe, it, expect } from "vitest";
import { transformToSeries } from "../transform";
import type { RawTrackAsset } from "../transform";
import type { Category } from "../../src/types";

// Minimal fixtures matching iRacing API response shapes
const rawSeries = [
  {
    series_id: 230,
    series_name: "GT3 Sprint",
    category_id: 5,
    min_license_level: 8, // C 4.0 = level 8
    fixed_setup: false,
    allowed_licenses: [
      { group_name: "Class D", min_license_level: 8, max_license_level: 8 },
      { group_name: "Class C", min_license_level: 9, max_license_level: 12 },
    ],
  },
  {
    series_id: 100,
    series_name: "Rookie Mazda",
    category_id: 5,
    min_license_level: 1,
    fixed_setup: true,
    allowed_licenses: [
      { group_name: "Rookie", min_license_level: 1, max_license_level: 4 },
    ],
  },
];

// Standard 12-week series (no start_date needed — seasonWeek = weekNumber)
const rawSeasons = [
  {
    series_id: 230,
    season_id: 4001,
    season_year: 2026,
    season_quarter: 2,
    car_class_ids: [74],
    schedules: [
      {
        race_week_num: 0,
        start_date: "2026-03-17",
        track: { track_id: 10, track_name: "Spa", config_name: "Grand Prix" },
        weather: {
          precip_option: 1,
          weather_summary: {
            precip_chance: 30,
            max_precip_rate_desc: "Light Rain",
          },
        },
      },
      {
        race_week_num: 1,
        start_date: "2026-03-24",
        track: {
          track_id: 20,
          track_name: "Monza",
          config_name: "Grand Prix",
        },
        weather: {
          precip_option: 0,
        },
      },
    ],
  },
  {
    series_id: 100,
    season_id: 4002,
    season_year: 2026,
    season_quarter: 2,
    car_class_ids: [22],
    schedules: [
      {
        race_week_num: 0,
        start_date: "2026-03-17",
        track: { track_id: 30, track_name: "Laguna Seca" },
      },
    ],
  },
];

const rawCarClasses = [
  {
    car_class_id: 74,
    name: "GT3 Class",
    cars_in_class: [{ car_id: 50 }, { car_id: 51 }],
  },
  {
    car_class_id: 22,
    name: "Mazda MX-5",
    cars_in_class: [{ car_id: 60 }],
  },
];

const rawCars = [
  { car_id: 50, car_name: "BMW M4 GT3" },
  { car_id: 51, car_name: "Porsche 911 GT3 R" },
  { car_id: 60, car_name: "Mazda MX-5 Cup" },
];

const trackAssets: Record<string, RawTrackAsset> = {
  // Full URL (real API format)
  "10": {
    track_map: "https://members-assets.iracing.com/public/track-maps/tracks_spa/10-spa-gp/",
    track_map_layers: {
      background: "bg.svg",
      inactive: "inactive.svg",
      active: "active.svg",
      pitroad: "pit.svg",
      "start-finish": "sf.svg",
      turns: "turns.svg",
    },
  },
  // Relative path (fallback format)
  "20": {
    track_map: "tracks/monza/",
    track_map_layers: {
      active: "active.svg",
    },
  },
};

describe("transformToSeries", () => {
  const result = transformToSeries(
    rawSeries,
    rawSeasons,
    rawCars,
    rawCarClasses,
    trackAssets,
  );

  it("returns one Series per season entry", () => {
    expect(result).toHaveLength(2);
  });

  it("maps series metadata", () => {
    const gt3 = result.find((s) => s.seriesId === 230)!;
    expect(gt3.seriesName).toBe("GT3 Sprint");
    expect(gt3.category).toBe("sports_car" satisfies Category);
    expect(gt3.setupType).toBe("open");
  });

  it("maps license class from allowed_licenses group_name", () => {
    const gt3 = result.find((s) => s.seriesId === 230)!;
    expect(gt3.licenseClass).toBe("C");

    const rookie = result.find((s) => s.seriesId === 100)!;
    expect(rookie.licenseClass).toBe("R");
  });

  it("skips crossover entry and uses true series class", () => {
    // A-class series: B 4.0 crossover entry (min===max), true class is A
    const aClassSeries = [
      {
        series_id: 300,
        series_name: "A Class Series",
        category_id: 5,
        min_license_level: 1,
        fixed_setup: false,
        allowed_licenses: [
          { group_name: "Class B", min_license_level: 16, max_license_level: 16 },
          { group_name: "Class A", min_license_level: 17, max_license_level: 20 },
          { group_name: "Pro", min_license_level: 21, max_license_level: 24 },
        ],
      },
    ];
    const aSeason = [
      { ...rawSeasons[0], series_id: 300 },
    ];
    const r = transformToSeries(aClassSeries, aSeason, rawCars, rawCarClasses);
    expect(r[0].licenseClass).toBe("A");
  });

  it("defaults to R when allowed_licenses is empty", () => {
    const emptyLicenseSeries = [
      {
        series_id: 400,
        series_name: "No License Series",
        category_id: 5,
        min_license_level: 1,
        fixed_setup: false,
        allowed_licenses: [],
      },
    ];
    const emptySeason = [
      { ...rawSeasons[0], series_id: 400 },
    ];
    const r = transformToSeries(emptyLicenseSeries, emptySeason, rawCars, rawCarClasses);
    expect(r[0].licenseClass).toBe("R");
  });

  it("maps schedule weeks with trackId and seasonWeek", () => {
    const gt3 = result.find((s) => s.seriesId === 230)!;
    expect(gt3.scheduleWeeks[0]).toMatchObject({
      weekNumber: 1,
      seasonWeek: 1,
      trackId: 10,
      trackName: "Spa",
      trackConfig: "Grand Prix",
    });
    expect(gt3.scheduleWeeks[1]).toMatchObject({
      weekNumber: 2,
      seasonWeek: 2,
      trackId: 20,
      trackName: "Monza",
      trackConfig: "Grand Prix",
    });
  });

  it("resolves cars via car classes", () => {
    const gt3 = result.find((s) => s.seriesId === 230)!;
    expect(gt3.cars).toEqual([
      { carId: 50, carName: "BMW M4 GT3" },
      { carId: 51, carName: "Porsche 911 GT3 R" },
    ]);
  });

  it("detects single-class series as not multiclass", () => {
    const gt3 = result.find((s) => s.seriesId === 230)!;
    expect(gt3.isMulticlass).toBe(false);
  });

  it("detects multiclass when season has multiple car class IDs", () => {
    const multiclassSeason = [
      {
        ...rawSeasons[0],
        series_id: 230,
        car_class_ids: [74, 22],
      },
    ];
    const r = transformToSeries(
      [rawSeries[0]],
      multiclassSeason,
      rawCars,
      rawCarClasses,
    );
    expect(r[0].isMulticlass).toBe(true);
  });

  it("omits series with no season data", () => {
    const withExtra = [
      ...rawSeries,
      {
        series_id: 999,
        series_name: "Ghost Series",
        category_id: 1,
        min_license_level: 1,
        fixed_setup: false,
        allowed_licenses: [],
      },
    ];
    const r = transformToSeries(withExtra, rawSeasons, rawCars, rawCarClasses);
    expect(r.find((s) => s.seriesId === 999)).toBeUndefined();
  });

  it("extracts rain chance from weather data", () => {
    const gt3 = result.find((s) => s.seriesId === 230)!;
    const spa = gt3.scheduleWeeks[0];
    expect(spa.rainChance).toBe(30);
    expect(spa.rainEnabled).toBe(true);
    expect(spa.maxPrecipDesc).toBe("Light Rain");
  });

  it("defaults rain to disabled when precip_option is 0", () => {
    const gt3 = result.find((s) => s.seriesId === 230)!;
    const monza = gt3.scheduleWeeks[1];
    expect(monza.rainChance).toBe(0);
    expect(monza.rainEnabled).toBe(false);
    expect(monza.maxPrecipDesc).toBeUndefined();
  });

  it("defaults rain chance to 0 when no weather data", () => {
    const rookie = result.find((s) => s.seriesId === 100)!;
    const laguna = rookie.scheduleWeeks[0];
    expect(laguna.rainChance).toBe(0);
    expect(laguna.rainEnabled).toBe(false);
    expect(laguna.maxPrecipDesc).toBeUndefined();
  });

  it("builds track map URLs from full-URL track assets", () => {
    const gt3 = result.find((s) => s.seriesId === 230)!;
    const spa = gt3.scheduleWeeks[0];
    const base = "https://members-assets.iracing.com/public/track-maps/tracks_spa/10-spa-gp/";
    expect(spa.trackMapUrl).toBe(`${base}active.svg`);
    expect(spa.trackMapLayers).toEqual({
      background: `${base}bg.svg`,
      inactive: `${base}inactive.svg`,
      active: `${base}active.svg`,
      pitroad: `${base}pit.svg`,
      startFinish: `${base}sf.svg`,
      turns: `${base}turns.svg`,
    });
  });

  it("builds track map URLs from relative-path track assets", () => {
    const gt3 = result.find((s) => s.seriesId === 230)!;
    const monza = gt3.scheduleWeeks[1]; // track_id 20, relative path asset
    expect(monza.trackMapUrl).toBe(
      "https://images-static.iracing.com/tracks/monza/active.svg",
    );
  });

  it("handles missing track assets gracefully", () => {
    const rookie = result.find((s) => s.seriesId === 100)!;
    const laguna = rookie.scheduleWeeks[0]; // track_id 30, no asset
    expect(laguna.trackMapUrl).toBeUndefined();
    expect(laguna.trackMapLayers).toBeUndefined();
  });

  it("sets totalWeeks from full schedule length", () => {
    const gt3 = result.find((s) => s.seriesId === 230)!;
    expect(gt3.totalWeeks).toBe(2);

    const rookie = result.find((s) => s.seriesId === 100)!;
    expect(rookie.totalWeeks).toBe(1);
  });

  it("works without track assets parameter", () => {
    const r = transformToSeries(rawSeries, rawSeasons, rawCars, rawCarClasses);
    const gt3 = r.find((s) => s.seriesId === 230)!;
    expect(gt3.scheduleWeeks[0].trackMapUrl).toBeUndefined();
    expect(gt3.scheduleWeeks[0].rainChance).toBe(30);
  });
});

describe("cross-season series", () => {
  // Season starts 2026-03-17 (from the 12-week series fixture above)
  // Cross-season series has 17 weeks, some before and some after the season window
  const crossSeasonSeries = [
    {
      series_id: 500,
      series_name: "INDYCAR iRacing Series",
      category_id: 6,
      min_license_level: 1,
      fixed_setup: false,
      allowed_licenses: [
        { group_name: "Class D", min_license_level: 8, max_license_level: 8 },
        { group_name: "Class C", min_license_level: 9, max_license_level: 12 },
      ],
    },
  ];

  // 12-week reference season to establish the season start date
  const refSeason = {
    series_id: 230,
    season_id: 4001,
    season_year: 2026,
    season_quarter: 2,
    car_class_ids: [74],
    schedules: Array.from({ length: 12 }, (_, i) => ({
      race_week_num: i,
      start_date: new Date(2026, 2, 17 + i * 7).toISOString().split("T")[0],
      track: { track_id: i + 10, track_name: `Track ${i + 1}` },
    })),
  };

  // INDYCAR: 17 weeks, started 2 weeks before the season
  // Weeks 0-1: before season (start_date 2026-03-03, 2026-03-10)
  // Weeks 2-13: during season (start_date 2026-03-17 through 2026-06-02)
  // Weeks 14-16: after season (start_date 2026-06-09+)
  const indycarSeason = {
    series_id: 500,
    season_id: 5001,
    season_year: 2026,
    season_quarter: 2,
    car_class_ids: [74],
    schedules: Array.from({ length: 17 }, (_, i) => ({
      race_week_num: i,
      start_date: new Date(2026, 2, 3 + i * 7).toISOString().split("T")[0],
      track: { track_id: i + 200, track_name: `Indy Track ${i + 1}` },
    })),
  };

  const allSeasons = [refSeason, indycarSeason];

  it("filters cross-season series to only current season weeks", () => {
    const r = transformToSeries(
      [...rawSeries, ...crossSeasonSeries],
      allSeasons,
      rawCars,
      rawCarClasses,
    );
    const indycar = r.find((s) => s.seriesId === 500)!;
    // Only weeks 2-13 of the 17-week series fall within the 12-week season
    expect(indycar.scheduleWeeks).toHaveLength(12);
  });

  it("maps cross-season series weeks to correct season weeks", () => {
    const r = transformToSeries(
      [...rawSeries, ...crossSeasonSeries],
      allSeasons,
      rawCars,
      rawCarClasses,
    );
    const indycar = r.find((s) => s.seriesId === 500)!;
    // Series week 3 (race_week_num=2) starts 2026-03-17 = season week 1
    expect(indycar.scheduleWeeks[0]).toMatchObject({
      weekNumber: 3,
      seasonWeek: 1,
      trackName: "Indy Track 3",
    });
    // Series week 14 (race_week_num=13) starts 2026-06-02 = season week 12
    expect(indycar.scheduleWeeks[11]).toMatchObject({
      weekNumber: 14,
      seasonWeek: 12,
      trackName: "Indy Track 14",
    });
  });

  it("preserves totalWeeks as the full series schedule length", () => {
    const r = transformToSeries(
      [...rawSeries, ...crossSeasonSeries],
      allSeasons,
      rawCars,
      rawCarClasses,
    );
    const indycar = r.find((s) => s.seriesId === 500)!;
    expect(indycar.totalWeeks).toBe(17);
  });

  it("handles series that skip weeks within the season", () => {
    // Series with 17 weeks but only some fall in the season window, with gaps
    const gappySeason = {
      series_id: 500,
      season_id: 5002,
      season_year: 2026,
      season_quarter: 2,
      car_class_ids: [74],
      schedules: [
        // Week during season week 1
        { race_week_num: 0, start_date: "2026-03-17", track: { track_id: 300, track_name: "Track A" } },
        // Skip season week 2, race in season week 3
        { race_week_num: 1, start_date: "2026-03-31", track: { track_id: 301, track_name: "Track B" } },
        // Race in season week 5
        { race_week_num: 2, start_date: "2026-04-14", track: { track_id: 302, track_name: "Track C" } },
      ],
    };
    const r = transformToSeries(
      crossSeasonSeries,
      [refSeason, gappySeason],
      rawCars,
      rawCarClasses,
    );
    const series = r.find((s) => s.seriesId === 500)!;
    expect(series.scheduleWeeks).toHaveLength(3);
    expect(series.scheduleWeeks[0].seasonWeek).toBe(1);
    expect(series.scheduleWeeks[1].seasonWeek).toBe(3);
    expect(series.scheduleWeeks[2].seasonWeek).toBe(5);
  });
});
