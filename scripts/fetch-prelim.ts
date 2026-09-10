import { readFile } from "node:fs/promises";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { authenticate, fetchData } from "./iracing-api";
import { loadPdfPages, parseSchedulePdf } from "./pdf-schedule";
import {
  transformPrelimToSeries,
  type CarCatalogEntry,
  type PriorSeries,
  type TrackCatalogEntry,
} from "./prelim-transform";
import { writeSeasonFiles, type SeasonFile } from "./season-files";
import {
  mapCategory,
  mapLicenseClassFromAllowedLicenses,
  type RawSeries,
  type RawTrackAsset,
} from "./transform";

/**
 * Build a season archive from iRacing's preliminary schedule PDF.
 *
 * iRacing publishes next season's schedule as a PDF roughly a week before the
 * Data API switches over, so this exists to make the new season pickable during
 * that gap. Only the *schedule* comes from the PDF — cars, tracks and track maps
 * are read from the live API, which stays current between seasons.
 *
 * The result is written exactly like `fetch-data`'s output but flagged
 * `provisional`, and is replaced by `npm run fetch-data` once the season opens.
 *
 *   npm run fetch-prelim -- https://us.v-cdn.net/.../2026s4.pdf
 *   npm run fetch-prelim -- ./2026s4.pdf --dry-run
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEASONS_DIR = resolve(__dirname, "../public/seasons");
const CURRENT_FILE = "current-season.json";

interface Args {
  source: string;
  dryRun: boolean;
  seasonId?: string;
}

function parseArgs(argv: string[]): Args {
  let source: string | undefined;
  let dryRun = false;
  let seasonId: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--season") seasonId = argv[++i];
    else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    else source ??= arg;
  }

  if (!source) {
    throw new Error(
      "Usage: npm run fetch-prelim -- <pdf-url-or-path> [--season 2026-S4] [--dry-run]",
    );
  }
  return { source, dryRun, seasonId };
}

async function readPdf(source: string): Promise<Uint8Array> {
  if (/^https?:\/\//.test(source)) {
    console.log(`Downloading ${source} ...`);
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Failed to download PDF (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  }
  console.log(`Reading ${source} ...`);
  return new Uint8Array(await readFile(source));
}

/**
 * Between seasons the Data API keeps listing year-long series (and a crop of
 * "13th Week" fillers). The year-long ones never appear in a quarterly archive,
 * so the live catalogue is the only place to learn their ids; the fillers are
 * noise that would happily mis-match a real series and are dropped.
 */
function catalogIdentities(rawSeries: RawSeries[]): PriorSeries[] {
  return rawSeries
    .filter((series) => !/^13th week\b/i.test(series.series_name))
    .map((series) => ({
      seriesId: series.series_id,
      seriesName: series.series_name.trim(),
      category: mapCategory(series.category_id),
      licenseClass: mapLicenseClassFromAllowedLicenses(series.allowed_licenses),
    }));
}

/**
 * Every archived season, newest first, flattened into the series facts the
 * prelim transform can learn from. Newer archives win on id conflicts so a
 * series carries its most recent identity.
 */
function loadPriorSeries(dir: string): PriorSeries[] {
  const archives: SeasonFile[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }

  for (const name of names) {
    if (!name.endsWith(".json") || name === CURRENT_FILE) continue;
    try {
      const data = JSON.parse(readFileSync(join(dir, name), "utf8")) as SeasonFile;
      // A provisional archive's ids are guesses; never learn identities from it.
      if (data.seasonId && data.series && !data.provisional) archives.push(data);
    } catch {
      // Skip unreadable archives rather than failing the import.
    }
  }
  archives.sort((a, b) => b.seasonStartDate.localeCompare(a.seasonStartDate));

  const byId = new Map<number, PriorSeries>();
  for (const archive of archives) {
    for (const series of archive.series) {
      if (byId.has(series.seriesId)) continue;
      byId.set(series.seriesId, {
        seriesId: series.seriesId,
        seriesName: series.seriesName,
        category: series.category,
        licenseClass: series.licenseClass,
        setupType: series.setupType,
        isRepeating: series.isRepeating,
        raceTimeMinutes: series.raceTimeMinutes,
      });
    }
  }
  console.log(
    `  Learned ${byId.size} series identities from ${archives.length} archived season(s)`,
  );
  return [...byId.values()];
}

/** Archives first: they carry setup type and race timing, the catalogue does not. */
function mergeIdentities(archived: PriorSeries[], catalog: PriorSeries[]): PriorSeries[] {
  const byId = new Map<number, PriorSeries>();
  for (const series of [...archived, ...catalog]) {
    if (!byId.has(series.seriesId)) byId.set(series.seriesId, series);
  }
  return [...byId.values()];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const pdfData = await readPdf(args.source);
  console.log("Parsing schedule PDF...");
  const pages = await loadPdfPages(pdfData);
  const prelim = parseSchedulePdf(pages);
  console.log(`  Parsed ${prelim.length} series across ${pages.length} pages`);
  if (prelim.length === 0) {
    throw new Error("No series found in the PDF — its layout may have changed.");
  }

  const accessToken = await authenticate();

  console.log("Fetching series catalogue...");
  const rawSeries = await fetchData<RawSeries[]>(accessToken, "/data/series/get");
  console.log(`  Found ${rawSeries.length} series`);

  console.log("Fetching cars...");
  const cars = await fetchData<CarCatalogEntry[]>(accessToken, "/data/car/get");
  console.log(`  Found ${cars.length} cars`);

  console.log("Fetching tracks...");
  const tracks = await fetchData<TrackCatalogEntry[]>(accessToken, "/data/track/get");
  console.log(`  Found ${tracks.length} tracks`);

  console.log("Fetching track assets...");
  const trackAssets = await fetchData<Record<string, RawTrackAsset>>(
    accessToken,
    "/data/track/assets",
  );
  console.log(`  Found ${Object.keys(trackAssets).length} track assets`);

  console.log("Loading archived seasons for series identities...");
  const priorSeries = mergeIdentities(
    loadPriorSeries(SEASONS_DIR),
    catalogIdentities(rawSeries),
  );
  console.log(`  ${priorSeries.length} candidate series identities in total`);

  console.log("Transforming data...");
  const result = transformPrelimToSeries({
    prelim,
    cars,
    tracks,
    trackAssets,
    priorSeries,
    ...(args.seasonId ? { seasonId: args.seasonId } : {}),
  });

  const { diagnostics } = result;
  console.log(`  Produced ${result.series.length} series with schedules`);
  console.log(
    `  Season: ${result.seasonId} (${result.seasonName}), start ${result.seasonStartDate}`,
  );
  console.log(
    `  Series ids: ${result.series.length - diagnostics.newSeries.length} matched ` +
      `(${diagnostics.fuzzyMatches.length} by similarity), ` +
      `${diagnostics.newSeries.length} new`,
  );

  if (diagnostics.fuzzyMatches.length) {
    console.log("\n  Matched by similarity — check these read correctly:");
    for (const match of diagnostics.fuzzyMatches) {
      console.log(
        `    ${match.score.toFixed(2)}  ${match.pdfName}\n           -> ${match.matchedName} (#${match.seriesId})`,
      );
    }
  }
  if (diagnostics.newSeries.length) {
    console.log("\n  New series (synthetic ids, remapped when official data lands):");
    for (const name of diagnostics.newSeries) console.log(`    ${name}`);
  }
  if (diagnostics.uncategorisedSeries.length) {
    console.log("\n  Series listed under an unranked/unknown section:");
    for (const entry of diagnostics.uncategorisedSeries) {
      console.log(
        `    ${entry.name} -> ${entry.category}` +
          `${entry.inherited ? " (inherited from match)" : " (default)"}`,
      );
    }
  }
  if (diagnostics.unresolvedTracks.length) {
    console.log("\n  WARNING: tracks not found in the catalogue (no track map/id):");
    for (const name of diagnostics.unresolvedTracks) console.log(`    ${name}`);
  }
  if (diagnostics.unresolvedCars.length) {
    console.log("\n  WARNING: cars not found in the catalogue (omitted):");
    for (const name of diagnostics.unresolvedCars) console.log(`    ${name}`);
  }

  if (args.dryRun) {
    console.log("\nDry run — nothing written.");
    return;
  }

  const seasonFile: SeasonFile = {
    seasonId: result.seasonId,
    seasonName: result.seasonName,
    seasonStartDate: result.seasonStartDate,
    series: result.series,
    provisional: true,
  };
  const current = writeSeasonFiles(SEASONS_DIR, seasonFile);
  console.log(
    `\nWrote ${SEASONS_DIR}/${result.seasonId}.json (provisional) and ${CURRENT_FILE} ` +
      `(${current.availableSeasons.length} season(s) available)`,
  );
  console.log("Commit public/seasons/ and push to publish.");
}

main().catch((err) => {
  console.error("Failed to build preliminary schedule:", err);
  process.exit(1);
});
