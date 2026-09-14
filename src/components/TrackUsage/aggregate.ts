import type {
  TrackCategory,
  TrackUsageBucket,
  TrackUsageEntry,
  TrackUsageFile,
  TrackUsageSeason,
} from "../../types";

/** The Tracks page's filter: a single bucket, or "all" to sum every bucket. */
export type TrackUsageFilterValue = "all" | TrackCategory;

export interface TrackUsageRow {
  trackName: string;
  /** Series-weeks per season id, for every season in `AggregatedTrackUsage.seasons`. */
  perSeason: Record<string, number>;
  total: number;
  /** Passed through from `TrackUsageEntry.free` — see there for the definition. */
  free: boolean;
}

export interface AggregateTrackUsageOptions {
  /** Drop rows for tracks that are free with subscription (default: keep them). */
  hideFree?: boolean;
}

export interface AggregatedTrackUsage {
  seasons: TrackUsageSeason[];
  rows: TrackUsageRow[];
}

const ALL_BUCKETS: TrackUsageBucket[] = ["road", "oval", "dirt_road", "dirt_oval", "unknown"];

function bucketsForFilter(filter: TrackUsageFilterValue): TrackUsageBucket[] {
  return filter === "all" ? ALL_BUCKETS : [filter];
}

function perSeasonCounts(
  entry: TrackUsageEntry,
  seasons: TrackUsageSeason[],
  buckets: TrackUsageBucket[],
): Record<string, number> {
  // Only sums counts for season ids present in `file.seasons` — both are
  // produced from the same archive scan (see scripts/track-usage.ts), so
  // there's nothing in `entry.counts` for a season missing from that list.
  const perSeason: Record<string, number> = {};
  for (const season of seasons) {
    let sum = 0;
    for (const bucket of buckets) {
      sum += entry.counts[bucket]?.[season.id] ?? 0;
    }
    perSeason[season.id] = sum;
  }
  return perSeason;
}

/**
 * Pure aggregation for the Tracks page: applies the type filter, sums
 * series-weeks per season and in total, drops tracks with a zero filtered
 * total, and sorts by total descending (name ascending on ties).
 *
 * "all" sums every bucket in `counts`, including "unknown", so usage is never
 * silently dropped. A single-category filter counts only that bucket, so a
 * track run on multiple layout types only shows the weeks matching the filter.
 *
 * `options.hideFree` combines with the type filter (AND): it drops rows for
 * tracks marked `free` after the type filter's zero-total rows are already
 * excluded, then the remaining rows are (re-)sorted as usual.
 */
export function aggregateTrackUsage(
  file: TrackUsageFile,
  filter: TrackUsageFilterValue,
  options: AggregateTrackUsageOptions = {},
): AggregatedTrackUsage {
  const buckets = bucketsForFilter(filter);
  const { hideFree = false } = options;

  const rows = file.tracks
    .map((entry): TrackUsageRow => {
      const perSeason = perSeasonCounts(entry, file.seasons, buckets);
      const total = Object.values(perSeason).reduce((a, b) => a + b, 0);
      return { trackName: entry.trackName, perSeason, total, free: entry.free };
    })
    .filter((row) => row.total > 0)
    .filter((row) => !hideFree || !row.free)
    .sort((a, b) => b.total - a.total || a.trackName.localeCompare(b.trackName));

  return { seasons: file.seasons, rows };
}
