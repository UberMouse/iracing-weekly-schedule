import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Configuration,
  SeriesApi,
  CarApi,
  CarclassApi,
  TrackApi,
} from "@iracing-data/api-client-fetch";
import { authenticate } from "./iracing-api";
import { transformToSeries, type RawDetailedSchedule, type RawSeason } from "./transform";
import { buildSeriesIdRemap } from "./prelim-transform";
import { readSeasonFile, writeSeasonFiles, type SeasonFile } from "./season-files";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Per-season archives + current-season.json, served as static blobs by GitHub Pages.
const SEASONS_DIR = resolve(__dirname, "../public/seasons");

// --- API Helpers ---
// iRacing API returns { link, expires } — must fetch the link for actual data
async function fetchLink<T>(response: { link: string }): Promise<T> {
  const res = await fetch(response.link);
  if (!res.ok) throw new Error(`Failed to fetch data link: ${res.status}`);
  return res.json() as Promise<T>;
}

// --- Main ---
async function main() {
  const accessToken = await authenticate();

  const config = new Configuration({
    accessToken,
  });

  const seriesApi = new SeriesApi(config);
  const carApi = new CarApi(config);
  const carclassApi = new CarclassApi(config);
  const trackApi = new TrackApi(config);

  console.log("Fetching series...");
  const seriesLink = await seriesApi.getSeries();
  const rawSeries = await fetchLink<unknown[]>(seriesLink);
  console.log(`  Found ${rawSeries.length} series`);

  console.log("Fetching seasons (current)...");
  const seasonsLink = await seriesApi.getSeriesSeasons();
  const rawSeasons = await fetchLink<unknown[]>(seasonsLink);
  console.log(`  Found ${rawSeasons.length} seasons`);

  console.log("Fetching cars...");
  const carsLink = await carApi.getCar();
  const rawCars = await fetchLink<unknown[]>(carsLink);
  console.log(`  Found ${rawCars.length} cars`);

  console.log("Fetching car classes...");
  const carClassesLink = await carclassApi.getCarClass();
  const rawCarClasses = await fetchLink<unknown[]>(carClassesLink);
  console.log(`  Found ${rawCarClasses.length} car classes`);

  console.log("Fetching track assets...");
  const trackAssetsLink = await trackApi.getTrackAssets();
  const rawTrackAssets = await fetchLink<Record<string, unknown>>(trackAssetsLink);
  console.log(`  Found ${Object.keys(rawTrackAssets).length} track assets`);

  // Fetch detailed schedules per season for session_minutes (covers lap-limited races)
  const typedSeasons = rawSeasons as RawSeason[];
  console.log(`Fetching detailed schedules for ${typedSeasons.length} seasons...`);
  const detailedSchedules = new Map<number, RawDetailedSchedule>();
  const BATCH_SIZE = 10;
  for (let i = 0; i < typedSeasons.length; i += BATCH_SIZE) {
    const batch = typedSeasons.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (season) => {
        try {
          const link = await seriesApi.getSeriesSeasonSchedule({ season_id: season.season_id });
          const data = await fetchLink<RawDetailedSchedule>(link);
          return [season.season_id, data] as const;
        } catch {
          return [season.season_id, null] as const;
        }
      }),
    );
    for (const [seasonId, data] of results) {
      if (data) detailedSchedules.set(seasonId, data);
    }
    if (i + BATCH_SIZE < typedSeasons.length) {
      process.stdout.write(`  ${Math.min(i + BATCH_SIZE, typedSeasons.length)}/${typedSeasons.length}\r`);
    }
  }
  console.log(`  Fetched ${detailedSchedules.size} detailed schedules`);

  console.log("Transforming data...");
  // Cast to our raw types — the API responses match these shapes
  const result = transformToSeries(
    rawSeries as Parameters<typeof transformToSeries>[0],
    rawSeasons as Parameters<typeof transformToSeries>[1],
    rawCars as Parameters<typeof transformToSeries>[2],
    rawCarClasses as Parameters<typeof transformToSeries>[3],
    rawTrackAssets as Parameters<typeof transformToSeries>[4],
    detailedSchedules,
  );
  console.log(`  Produced ${result.series.length} series with schedules`);
  console.log(`  Season: ${result.seasonId} (${result.seasonName}), start ${result.seasonStartDate}`);

  // If this season was previously imported from the preliminary PDF, its series
  // ids were best-effort guesses. Record how they map onto the official ones so
  // the app can carry picks and favourites across the swap. An already-published
  // remap is preserved until it is certain every client has replayed it.
  const existing = readSeasonFile(SEASONS_DIR, result.seasonId);
  const seriesIdRemap = existing?.provisional
    ? buildSeriesIdRemap(existing.series, result.series)
    : existing?.seriesIdRemap;

  if (existing?.provisional) {
    console.log(
      `  Replacing provisional ${result.seasonId} data; ` +
        `remapping ${Object.keys(seriesIdRemap ?? {}).length} series id(s)`,
    );
  }

  const seasonFile: SeasonFile = {
    ...result,
    ...(seriesIdRemap && Object.keys(seriesIdRemap).length ? { seriesIdRemap } : {}),
  };

  // Write per-season archive + rebuild current-season.json (never overwrites prior archives).
  const current = writeSeasonFiles(SEASONS_DIR, seasonFile);
  console.log(
    `Wrote ${SEASONS_DIR}/${result.seasonId}.json and current-season.json ` +
      `(${current.availableSeasons.length} season(s) available)`,
  );
}

main().catch((err) => {
  console.error("Failed to fetch schedule data:", err);
  process.exit(1);
});
