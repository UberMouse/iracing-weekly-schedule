import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { TrackUsageBucket, TrackUsageFile } from "../src/types";
import type { SeasonFile } from "./season-files";
import { readTrackCategoryCatalogue, type TrackCategoryCatalogue } from "./track-categories";

/**
 * Computes `track-usage.json`: how often each track (all layouts of it
 * grouped under one name) appears in the schedule of each archived season.
 * Generated at build time (see the Vite plugin in `vite.config.ts`) from
 * committed files only — nothing here is committed itself.
 */

/** One archived season's schedule, as read from `public/seasons/<id>.json`. */
export interface SeasonUsageInput {
  id: string;
  name: string;
  startDate: string;
  provisional?: boolean;
  series: SeasonFile["series"];
}

/**
 * Group every series-week by `trackName.trim()` and count series-weeks per
 * season, split by the track layout's category. A layout id absent from
 * `trackCategories` is counted under "unknown" (reported via `onUnknownTrack`)
 * so an uncatalogued track still shows up in an "All categories" total
 * without inflating any single category's count.
 *
 * Pure and season-order-agnostic: `seasons` is sorted here by `startDate` so
 * the output is chronological regardless of input order.
 */
export function computeTrackUsage(
  seasons: SeasonUsageInput[],
  trackCategories: TrackCategoryCatalogue,
  onUnknownTrack?: (trackId: number, trackName: string) => void,
): TrackUsageFile {
  const sorted = [...seasons].sort((a, b) => a.startDate.localeCompare(b.startDate));

  const tracks = new Map<string, TrackUsageFile["tracks"][number]>();

  for (const season of sorted) {
    for (const series of season.series) {
      for (const week of series.scheduleWeeks) {
        const trackName = week.trackName.trim();

        let entry = tracks.get(trackName);
        if (!entry) {
          entry = { trackName, counts: {} };
          tracks.set(trackName, entry);
        }

        const category = trackCategories[String(week.trackId)]?.category;
        const bucket: TrackUsageBucket = category ?? "unknown";
        if (!category) onUnknownTrack?.(week.trackId, trackName);

        const bySeason = (entry.counts[bucket] ??= {});
        bySeason[season.id] = (bySeason[season.id] ?? 0) + 1;
      }
    }
  }

  return {
    seasons: sorted.map((season) => ({
      id: season.id,
      name: season.name,
      ...(season.provisional ? { provisional: true } : {}),
    })),
    tracks: [...tracks.values()].sort((a, b) => a.trackName.localeCompare(b.trackName)),
  };
}

const CURRENT_FILE = "current-season.json";

/**
 * Read every season archive in `seasonsDir` (skipping `current-season.json`,
 * which is a derived index rather than an archive of its own). Unreadable
 * files are skipped rather than failing the build, matching the tolerance
 * `season-files.ts` and `fetch-prelim.ts` already apply to this directory.
 */
function readAllSeasonArchives(seasonsDir: string): SeasonUsageInput[] {
  let names: string[];
  try {
    names = readdirSync(seasonsDir);
  } catch {
    return [];
  }

  const seasons: SeasonUsageInput[] = [];
  for (const name of names) {
    if (!name.endsWith(".json") || name === CURRENT_FILE) continue;
    try {
      const data = JSON.parse(readFileSync(join(seasonsDir, name), "utf8")) as SeasonFile;
      if (!data.seasonId || !data.series) continue;
      seasons.push({
        id: data.seasonId,
        name: data.seasonName,
        startDate: data.seasonStartDate,
        ...(data.provisional ? { provisional: true } : {}),
        series: data.series,
      });
    } catch {
      // Skip unreadable archives rather than failing the build.
    }
  }
  return seasons;
}

/**
 * Build the full `track-usage.json` contents from committed files: every
 * season archive in `seasonsDir` plus the track category catalogue at
 * `trackCategoriesPath`. This is the function the Vite plugin calls directly
 * (both at build time and from the dev server), so it does its own console
 * warning for uncatalogued track ids — deduplicated, since the same id can
 * recur across many weeks and seasons.
 */
export function buildTrackUsageFile(seasonsDir: string, trackCategoriesPath: string): TrackUsageFile {
  const seasons = readAllSeasonArchives(seasonsDir);
  const trackCategories = readTrackCategoryCatalogue(trackCategoriesPath);

  const warned = new Set<number>();
  const usage = computeTrackUsage(seasons, trackCategories, (trackId, trackName) => {
    if (warned.has(trackId)) return;
    warned.add(trackId);
    console.warn(
      `[track-usage] No category for track ${trackId} ("${trackName}") — ` +
        `counted under "unknown". Run \`npm run fetch-track-categories\` to refresh the catalogue.`,
    );
  });

  return usage;
}
