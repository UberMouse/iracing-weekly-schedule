/**
 * One-off: capture the currently-committed src/data/season.json as the first
 * season archive (2026 Season 2) under public/seasons/, before the next data
 * fetch pulls the new season and overwrites it. Idempotent — safe to re-run.
 *
 *   npx tsx scripts/bootstrap-seasons.ts
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeSeasonFiles, type SeasonFile } from "./season-files";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEGACY = resolve(__dirname, "../src/data/season.json");
const SEASONS_DIR = resolve(__dirname, "../public/seasons");

const legacy = JSON.parse(readFileSync(LEGACY, "utf8")) as {
  seasonStartDate: string;
  series: SeasonFile["series"];
};

const current: SeasonFile = {
  seasonId: "2026-S2",
  seasonName: "2026 Season 2",
  seasonStartDate: legacy.seasonStartDate,
  series: legacy.series,
};

const out = writeSeasonFiles(SEASONS_DIR, current);
console.log(
  `Bootstrapped ${current.seasonId} (${current.seasonName}) — ` +
    `${out.availableSeasons.length} season(s) available, ${current.series.length} series`,
);
