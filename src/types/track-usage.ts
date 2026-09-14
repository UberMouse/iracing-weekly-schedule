/**
 * Types for `track-usage.json`, generated at build time (see
 * `scripts/track-usage.ts` and the Vite plugin in `vite.config.ts`) from the
 * committed season archives and `data/track-categories.json`. Never committed
 * itself — CI regenerates it on every build from files that are.
 */

/** A track layout's surface, from the iRacing Data API's per-layout `category`. */
export type TrackCategory = "road" | "oval" | "dirt_road" | "dirt_oval";

/**
 * Bucket for series-weeks at a track whose layout id has no entry in
 * `data/track-categories.json`. Kept out of every named category so a
 * single-category filter never over-counts, but folded into an "All" total
 * (sum of every bucket) so usage isn't silently dropped.
 */
export type TrackUsageBucket = TrackCategory | "unknown";

/** Lightweight season descriptor, chronological order mirrors `seasons`. */
export interface TrackUsageSeason {
  id: string;
  name: string;
  provisional?: boolean;
}

export interface TrackUsageEntry {
  /** `trackName.trim()` — the sole grouping key; distinct spellings stay distinct. */
  trackName: string;
  /** counts[bucket][seasonId] = series-weeks run on that bucket's layouts that season. */
  counts: Partial<Record<TrackUsageBucket, Record<string, number>>>;
  /**
   * True only if every layout id this track used, across every archived
   * season, is present in the catalogue and marked `free` there. A single
   * uncatalogued or paid layout — or a legacy catalogue entry with no `free`
   * field — makes the whole track `false`.
   *
   * Assumption: this reflects the track's *current* free-with-subscription
   * status (from the latest catalogue refresh) applied retroactively to
   * every season shown, past ones included — iRacing doesn't expose
   * historical pricing, and a track's inclusion rarely changes.
   */
  free: boolean;
}

export interface TrackUsageFile {
  /** Every archived season, chronological by seasonStartDate. */
  seasons: TrackUsageSeason[];
  tracks: TrackUsageEntry[];
}
