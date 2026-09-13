import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { authenticate, fetchData } from "./iracing-api";
import { updateTrackCategoryCatalogue, type RawTrackLayout } from "./track-categories";

/**
 * Standalone refresh of `data/track-categories.json` from the live
 * `/data/track/get` endpoint. `fetch-schedule.ts` and `fetch-prelim.ts` also
 * refresh it (as a side effect of track data they fetch anyway); this exists
 * to update the catalogue on its own, independent of a season fetch.
 *
 *   npm run fetch-track-categories
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRACK_CATEGORIES_FILE = resolve(__dirname, "../data/track-categories.json");

async function main() {
  const accessToken = await authenticate();

  console.log("Fetching tracks...");
  const tracks = await fetchData<RawTrackLayout[]>(accessToken, "/data/track/get");
  console.log(`  Found ${tracks.length} track layouts`);

  updateTrackCategoryCatalogue(TRACK_CATEGORIES_FILE, tracks);
  console.log(`Wrote ${TRACK_CATEGORIES_FILE}`);
}

main().catch((err) => {
  console.error("Failed to fetch track categories:", err);
  process.exit(1);
});
