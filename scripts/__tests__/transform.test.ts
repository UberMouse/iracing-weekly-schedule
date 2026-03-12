import { describe, it, expect } from "vitest";
import { transformToSeries } from "../transform";
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
      { group_name: "Class C", min_license_level: 8, max_license_level: 12 },
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
        track: { track_id: 10, track_name: "Spa", config_name: "Grand Prix" },
      },
      {
        race_week_num: 1,
        track: {
          track_id: 20,
          track_name: "Monza",
          config_name: "Grand Prix",
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

describe("transformToSeries", () => {
  const result = transformToSeries(
    rawSeries,
    rawSeasons,
    rawCars,
    rawCarClasses,
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

  it("maps license class from min_license_level", () => {
    const gt3 = result.find((s) => s.seriesId === 230)!;
    expect(gt3.licenseClass).toBe("C");

    const rookie = result.find((s) => s.seriesId === 100)!;
    expect(rookie.licenseClass).toBe("R");
  });

  it("maps schedule weeks (1-indexed)", () => {
    const gt3 = result.find((s) => s.seriesId === 230)!;
    expect(gt3.scheduleWeeks).toEqual([
      { weekNumber: 1, trackName: "Spa", trackConfig: "Grand Prix" },
      { weekNumber: 2, trackName: "Monza", trackConfig: "Grand Prix" },
    ]);
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
});
