import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Series } from "../src/types";

/** A single season's full data, as served from public/seasons/<id>.json */
export interface SeasonFile {
  seasonId: string;
  seasonName: string;
  seasonStartDate: string;
  series: Series[];
}

/** Lightweight season descriptor used to populate the season switcher. */
export interface SeasonMeta {
  id: string;
  name: string;
  startDate: string;
}

/** The entry-point blob fetched on app load. */
export interface CurrentSeasonFile {
  currentSeasonId: string;
  availableSeasons: SeasonMeta[];
  season: SeasonFile;
}

const CURRENT_FILE = "current-season.json";

/**
 * Write the current season's archive (public/seasons/<id>.json) and rebuild
 * current-season.json from every archive present in the directory.
 *
 * Archives are immutable once written — prior seasons are never overwritten,
 * so running this each build accumulates history in the repo. The just-written
 * current season is always included in availableSeasons.
 */
export function writeSeasonFiles(dir: string, current: SeasonFile): CurrentSeasonFile {
  mkdirSync(dir, { recursive: true });

  // Write (or refresh) the current season's own addressable archive.
  writeFileSync(join(dir, `${current.seasonId}.json`), JSON.stringify(current, null, 2));

  // Collect metadata from every season archive in the directory.
  const byId = new Map<string, SeasonMeta>();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json") || name === CURRENT_FILE) continue;
    try {
      const data = JSON.parse(readFileSync(join(dir, name), "utf8")) as Partial<SeasonFile>;
      if (data.seasonId && data.seasonName && data.seasonStartDate) {
        byId.set(data.seasonId, {
          id: data.seasonId,
          name: data.seasonName,
          startDate: data.seasonStartDate,
        });
      }
    } catch {
      // Skip unparseable files rather than failing the whole build.
    }
  }
  // Guarantee the current season is present even if the read missed it.
  byId.set(current.seasonId, {
    id: current.seasonId,
    name: current.seasonName,
    startDate: current.seasonStartDate,
  });

  const availableSeasons = [...byId.values()].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );

  const currentFile: CurrentSeasonFile = {
    currentSeasonId: current.seasonId,
    availableSeasons,
    season: current,
  };
  writeFileSync(join(dir, CURRENT_FILE), JSON.stringify(currentFile, null, 2));

  return currentFile;
}
