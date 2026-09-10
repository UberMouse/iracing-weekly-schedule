import { describe, it, expect } from "vitest";
import {
  buildSeriesIdRemap,
  syntheticSeriesId,
  transformPrelimToSeries,
  type PriorSeries,
} from "../prelim-transform";
import type { PrelimSeries, PrelimWeek } from "../pdf-schedule";

const cars = [
  { car_id: 1, car_name: "Mini Stock" },
  { car_id: 2, car_name: "Caterham 420R" },
  { car_id: 3, car_name: "Cadillac V-Series.R GTP" },
];

const tracks = [
  { track_id: 10, track_name: "Charlotte Motor Speedway", config_name: "Oval" },
  { track_id: 11, track_name: "Langley Speedway" },
  { track_id: 12, track_name: "Circuit des 24 Heures du Mans", config_name: "24 Heures du Mans" },
  { track_id: 13, track_name: "Nürburgring Nordschleife", config_name: "Industriefahrten" },
];

const week = (overrides: Partial<PrelimWeek> = {}): PrelimWeek => ({
  weekNumber: 1,
  startDate: "2026-09-15",
  detailLines: ["Charlotte Motor Speedway - Oval", "(2026-09-19 13:40 1x)"],
  conditions: "84F/29C, Rain chance None, Rolling start",
  raceLength: "15 laps",
  ...overrides,
});

const series = (overrides: Partial<PrelimSeries> = {}): PrelimSeries => ({
  seriesName: "Mini Stock Rookie Series - 2026 Season 4",
  category: "oval",
  licenseClass: "R",
  carLines: ["Mini Stock"],
  isCarRotation: false,
  racesDescription: "Races every 30 minutes at :15 and :45",
  // Twelve weeks so the season start resolves from a full-length series.
  weeks: Array.from({ length: 12 }, (_, i) =>
    week({
      weekNumber: i + 1,
      startDate: new Date(Date.UTC(2026, 8, 15 + i * 7)).toISOString().slice(0, 10),
    }),
  ),
  ...overrides,
});

const run = (prelim: PrelimSeries[], priorSeries: PriorSeries[] = []) =>
  transformPrelimToSeries({ prelim, cars, tracks, priorSeries });

describe("transformPrelimToSeries", () => {
  it("derives season identity and start date from the PDF", () => {
    const result = run([series()]);
    expect(result.seasonId).toBe("2026-S4");
    expect(result.seasonName).toBe("2026 Season 4");
    expect(result.seasonStartDate).toBe("2026-09-15T00:00:00.000Z");
  });

  it("resolves tracks to catalogue ids and strips the config from the name", () => {
    const [entry] = run([series()]).series;
    expect(entry.scheduleWeeks[0]).toMatchObject({
      trackId: 10,
      trackName: "Charlotte Motor Speedway",
      trackConfig: "Oval",
      seasonWeek: 1,
    });
  });

  it("rejoins a track name wrapped across lines", () => {
    const result = run([
      series({
        weeks: [
          week({
            detailLines: [
              "Circuit des 24 Heures du Mans - 24 Heures du",
              "Mans",
              "(2026-10-31 14:50 1x)",
            ],
          }),
        ],
      }),
    ]);
    expect(result.series[0].scheduleWeeks[0].trackId).toBe(12);
    expect(result.diagnostics.unresolvedTracks).toEqual([]);
  });

  it("splits per-week cars from the track name for car-rotation series", () => {
    const result = run([
      series({
        isCarRotation: true,
        carLines: [],
        weeks: [
          week({
            detailLines: [
              "Nürburgring Nordschleife - Industriefahrten",
              "Caterham 420R",
              "(2026-09-19 13:45 1x)",
            ],
          }),
        ],
      }),
    ]);
    const [entry] = result.series;
    expect(entry.scheduleWeeks[0].trackId).toBe(13);
    expect(entry.scheduleWeeks[0].cars).toEqual([{ carId: 2, carName: "Caterham 420R" }]);
  });

  it("resolves car names broken by a line-wrapped hyphen", () => {
    const result = run([series({ carLines: ["Cadillac V-", "Series.R GTP"] })]);
    expect(result.series[0].cars).toEqual([{ carId: 3, carName: "Cadillac V-Series.R GTP" }]);
    expect(result.diagnostics.unresolvedCars).toEqual([]);
  });

  it("reads rain chance and treats a chance as rain being enabled", () => {
    const result = run([
      series({
        weeks: [
          week({ conditions: "68F/20C, Rain chance 29%, Grid by class" }),
          week({ weekNumber: 2, startDate: "2026-09-22", conditions: "68F/20C, Rain chance None" }),
        ],
      }),
    ]);
    const [wet, dry] = result.series[0].scheduleWeeks;
    expect(wet).toMatchObject({ rainChance: 29, rainEnabled: true });
    expect(dry).toMatchObject({ rainChance: 0, rainEnabled: false });
  });

  it("treats 'Grid by class' as the multiclass marker", () => {
    const multi = run([
      series({ weeks: [week({ conditions: "68F/20C, Rain chance None, Grid by class" })] }),
    ]);
    expect(multi.series[0].isMulticlass).toBe(true);
    expect(run([series()]).series[0].isMulticlass).toBe(false);
  });

  it("counts a named race day as scheduled rather than repeating", () => {
    const scheduled = run([
      series({ racesDescription: "Races every other Saturday at 2, 7, 18 GMT and Sunday at 14 GMT" }),
    ]);
    expect(scheduled.series[0].isRepeating).toBe(false);
    expect(run([series()]).series[0].isRepeating).toBe(true);
  });

  it("takes the race duration from a time-limited race", () => {
    const timed = run([series({ weeks: [week({ raceLength: "40 mins" })] })]);
    expect(timed.series[0].raceTimeMinutes).toBe(40);
  });

  it("drops weeks outside the twelve-week season window", () => {
    // Year-long series (e.g. the NASCAR tours) print all 39 of their races.
    const longSeason = series({
      weeks: Array.from({ length: 20 }, (_, i) =>
        week({
          weekNumber: i + 1,
          startDate: new Date(Date.UTC(2026, 8, 15 + i * 7)).toISOString().slice(0, 10),
        }),
      ),
    });
    const result = transformPrelimToSeries({
      prelim: [series(), longSeason],
      cars,
      tracks,
      priorSeries: [],
    });
    expect(result.series[1].scheduleWeeks).toHaveLength(12);
    // totalWeeks still reports the series' real length.
    expect(result.series[1].totalWeeks).toBe(20);
  });

  it("honours an explicit season id override", () => {
    const result = transformPrelimToSeries({
      prelim: [series()],
      cars,
      tracks,
      priorSeries: [],
      seasonId: "2027-S1",
    });
    expect(result.seasonId).toBe("2027-S1");
    expect(result.seasonName).toBe("2027 Season 1");
  });
});

describe("series identity matching", () => {
  const prior: PriorSeries[] = [
    {
      seriesId: 519,
      seriesName: "Renault Clio Cup",
      category: "sports_car",
      licenseClass: "D",
      setupType: "fixed",
      isRepeating: true,
      raceTimeMinutes: 25,
    },
    {
      seriesId: 399,
      seriesName: "Supercars Series",
      category: "sports_car",
      licenseClass: "C",
      setupType: "open",
      isRepeating: true,
      raceTimeMinutes: 30,
    },
    {
      seriesId: 405,
      seriesName: "Supercars Series - Australian Server Only",
      category: "sports_car",
      licenseClass: "C",
      setupType: "open",
      isRepeating: true,
      raceTimeMinutes: 30,
    },
  ];

  const sportsCar = (name: string, licenseClass: "C" | "D" = "D") =>
    series({ seriesName: name, category: "sports_car", licenseClass, carLines: ["Mini Stock"] });

  it("matches a renamed series and inherits its setup type", () => {
    const result = run([sportsCar("Clio Cup - 2026 Season 4")], prior);
    const [entry] = result.series;
    expect(entry.seriesId).toBe(519);
    // The PDF never states setup type; it comes from the matched series.
    expect(entry.setupType).toBe("fixed");
    expect(result.diagnostics.fuzzyMatches).toHaveLength(1);
  });

  it("inherits race duration for a lap-limited race", () => {
    // "15 laps" gives no duration, so sprint/endurance classification would
    // otherwise be lost.
    const result = run([sportsCar("Clio Cup - 2026 Season 4")], prior);
    expect(result.series[0].raceTimeMinutes).toBe(25);
  });

  it("never lets two series claim the same id", () => {
    const result = run(
      [
        sportsCar("Supercars Series - 2026 Season 4", "C"),
        sportsCar("Supercars Series - Australian Servers - 2026 Season 4", "C"),
      ],
      prior,
    );
    expect(result.series.map((s) => s.seriesId)).toEqual([399, 405]);
  });

  it("will not match across a licence class", () => {
    const result = run([sportsCar("Clio Cup - 2026 Season 4", "C")], prior);
    expect(result.series[0].seriesId).toBeLessThan(0);
  });

  it("gives an unmatched series a stable synthetic id", () => {
    const result = run([sportsCar("Track Day - 2026 Season 4")], prior);
    const [entry] = result.series;
    expect(entry.seriesId).toBeLessThan(0);
    expect(entry.seriesId).toBe(syntheticSeriesId("Track Day - 2026 Season 4"));
    expect(result.diagnostics.newSeries).toEqual(["Track Day - 2026 Season 4"]);
    // Falls back to the title when there is nothing to inherit from.
    expect(entry.setupType).toBe("open");
  });

  it("keeps synthetic ids stable across season-suffix spellings", () => {
    expect(syntheticSeriesId("Track Day - 2026 Season 4")).toBe(
      syntheticSeriesId("Track Day 2026 Season 4"),
    );
  });

  it("strips the season suffix from the stored series name", () => {
    const result = run([sportsCar("Clio Cup - 2026 Season 4")], prior);
    expect(result.series[0].seriesName).toBe("Clio Cup");
  });

  it("inherits the category for an unranked series", () => {
    const unranked = series({
      seriesName: "NASCAR Pickup Cup - 2026 Season 4",
      category: null,
      licenseClass: "R",
    });
    const result = run([unranked], [
      {
        seriesId: 259,
        seriesName: "NASCAR Pickup Cup",
        category: "oval",
        licenseClass: "R",
      },
    ]);
    expect(result.series[0]).toMatchObject({ seriesId: 259, category: "oval" });
    expect(result.diagnostics.uncategorisedSeries).toEqual([
      { name: "NASCAR Pickup Cup - 2026 Season 4", category: "oval", inherited: true },
    ]);
  });
});

describe("buildSeriesIdRemap", () => {
  const provisional = [
    { seriesId: -42, seriesName: "Track Day", category: "sports_car", licenseClass: "D" },
    { seriesId: 519, seriesName: "Clio Cup", category: "sports_car", licenseClass: "D" },
  ] as const;

  it("maps a synthetic id onto the official one", () => {
    const remap = buildSeriesIdRemap([...provisional], [
      { seriesId: 612, seriesName: "Track Day", category: "sports_car", licenseClass: "D" },
      { seriesId: 519, seriesName: "Renault Clio Cup", category: "sports_car", licenseClass: "D" },
    ]);
    expect(remap).toEqual({ "-42": 612 });
  });

  it("corrects an id the import matched to the wrong series", () => {
    const remap = buildSeriesIdRemap(
      [{ seriesId: 311, seriesName: "DIRTcar Class C Dirt Street Stock", category: "dirt_oval", licenseClass: "C" }],
      [{ seriesId: 640, seriesName: "DIRTcar Class C Dirt Street Stock", category: "dirt_oval", licenseClass: "C" }],
    );
    expect(remap).toEqual({ "311": 640 });
  });

  it("is one-to-one, so no two provisional ids collapse onto one official id", () => {
    const remap = buildSeriesIdRemap(
      [
        { seriesId: -1, seriesName: "Supercars Series", category: "sports_car", licenseClass: "C" },
        { seriesId: -2, seriesName: "Supercars Series - Australian Servers", category: "sports_car", licenseClass: "C" },
      ],
      [
        { seriesId: 399, seriesName: "Supercars Series", category: "sports_car", licenseClass: "C" },
        { seriesId: 405, seriesName: "Supercars Series - Australian Server Only", category: "sports_car", licenseClass: "C" },
      ],
    );
    expect(new Set(Object.values(remap)).size).toBe(Object.keys(remap).length);
    expect(remap).toEqual({ "-1": 399, "-2": 405 });
  });

  it("leaves out series whose id was already right", () => {
    const remap = buildSeriesIdRemap(
      [{ seriesId: 519, seriesName: "Clio Cup", category: "sports_car", licenseClass: "D" }],
      [{ seriesId: 519, seriesName: "Renault Clio Cup", category: "sports_car", licenseClass: "D" }],
    );
    expect(remap).toEqual({});
  });
});
