import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { TrackUsageFile } from "../../types";
import { LoadingState, ErrorState } from "../StatusMessage";
import FilterPill from "../FilterPill";
import {
  aggregateTrackUsage,
  DEFAULT_TRACK_USAGE_SORT,
  type TrackUsageFilterValue,
  type TrackUsageSort,
  type TrackUsageSortColumn,
} from "./aggregate";

const TRACK_USAGE_URL = `${import.meta.env.BASE_URL}track-usage.json`;

type LoadStatus = "loading" | "ready" | "error";

const FILTERS: { value: TrackUsageFilterValue; label: string; color: string | null }[] = [
  { value: "all", label: "All", color: null },
  { value: "road", label: "Road", color: "var(--color-cat-sports-car)" },
  { value: "oval", label: "Oval", color: "var(--color-cat-oval)" },
  { value: "dirt_road", label: "Dirt Road", color: "var(--color-cat-dirt-road)" },
  { value: "dirt_oval", label: "Dirt Oval", color: "var(--color-cat-dirt-oval)" },
];

function sameColumn(a: TrackUsageSortColumn, b: TrackUsageSortColumn): boolean {
  return a.kind === "total" ? b.kind === "total" : b.kind === "season" && a.seasonId === b.seasonId;
}

interface SortHeaderProps {
  column: TrackUsageSortColumn;
  sort: TrackUsageSort;
  onSort: (column: TrackUsageSortColumn) => void;
  className: string;
  children: ReactNode;
}

/** A right-aligned numeric column header that sorts the table when clicked. */
function SortHeader({ column, sort, onSort, className, children }: SortHeaderProps) {
  const active = sameColumn(column, sort.column);
  const arrow = sort.direction === "desc" ? "▼" : "▲";
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.direction === "desc" ? "descending" : "ascending") : undefined}
      className={`text-right font-display uppercase tracking-wider text-xs px-3 py-2.5 whitespace-nowrap ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 uppercase tracking-wider cursor-pointer hover:text-[var(--color-text-primary)]"
      >
        {children}
        {/* Always rendered (invisible when inactive) so headers don't shift width. */}
        <span aria-hidden="true" className={`text-[9px] ${active ? "" : "invisible"}`}>
          {active ? arrow : "▼"}
        </span>
      </button>
    </th>
  );
}

/**
 * "Tracks" tab: how often each track (all layouts grouped) appears in the
 * schedule per season, filterable by layout type. Data comes from
 * `track-usage.json`, generated at build time from the committed season
 * archives (see `vite.config.ts` / `scripts/track-usage.ts`).
 */
export default function TrackUsage() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TrackUsageFile | null>(null);
  const [filter, setFilter] = useState<TrackUsageFilterValue>("all");
  const [hideFree, setHideFree] = useState(false);
  const [sort, setSort] = useState<TrackUsageSort>(DEFAULT_TRACK_USAGE_SORT);
  // Bumped on retry to re-trigger the fetch effect below; the effect itself
  // only sets state from its fetch's async callbacks, never synchronously
  // from the effect body (react-hooks/set-state-in-effect).
  const [reloadToken, setReloadToken] = useState(0);

  const retry = useCallback(() => {
    setStatus("loading");
    setError(null);
    setReloadToken((t) => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${TRACK_USAGE_URL}?v=${__BUILD_VERSION__}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<TrackUsageFile>;
      })
      .then((file) => {
        if (cancelled) return;
        setData(file);
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load track usage data");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const aggregated = useMemo(
    () => (data ? aggregateTrackUsage(data, filter, { hideFree, sort }) : null),
    [data, filter, hideFree, sort],
  );

  // A new column starts most-used first; re-clicking the active one flips direction.
  const handleSort = useCallback((column: TrackUsageSortColumn) => {
    setSort((current) =>
      sameColumn(column, current.column)
        ? { column, direction: current.direction === "desc" ? "asc" : "desc" }
        : { column, direction: "desc" },
    );
  }, []);

  if (status === "loading") {
    return <LoadingState label="Loading track usage…" />;
  }

  if (status === "error" || !aggregated) {
    return <ErrorState title="Couldn't load track usage" message={error} onRetry={retry} />;
  }

  const { seasons, rows } = aggregated;

  return (
    <div>
      <h1 className="font-display text-2xl font-bold uppercase tracking-wider text-[var(--color-text-primary)] mb-4">
        Track Usage
      </h1>

      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {FILTERS.map(({ value, label, color }) => (
          <FilterPill
            key={value}
            label={label}
            color={color}
            active={filter === value}
            onClick={() => setFilter(value)}
          />
        ))}
        {/* Separated from the type filters since it combines (AND) with them
            rather than being another mutually-exclusive option. */}
        <div className="w-px self-stretch bg-[var(--color-border)] mx-1" aria-hidden="true" />
        <FilterPill
          label="Hide free tracks"
          color="var(--color-free)"
          active={hideFree}
          onClick={() => setHideFree((h) => !h)}
        />
      </div>

      {rows.length === 0 ? (
        <p className="text-center text-[var(--color-text-secondary)] py-12">
          No tracks match this filter.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <th
                  scope="col"
                  className="text-left font-display uppercase tracking-wider text-xs text-[var(--color-text-secondary)] px-3 py-2.5 whitespace-nowrap"
                >
                  Track
                </th>
                {seasons.map((season) => (
                  <SortHeader
                    key={season.id}
                    column={{ kind: "season", seasonId: season.id }}
                    sort={sort}
                    onSort={handleSort}
                    className="text-[var(--color-text-secondary)]"
                  >
                    {season.name}
                    {season.provisional && (
                      <span className="ml-1.5 align-middle text-[9px] normal-case font-body font-semibold tracking-normal rounded-full px-1.5 py-0.5 border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                        <span className="sr-only">, </span>
                        Provisional
                      </span>
                    )}
                  </SortHeader>
                ))}
                <SortHeader
                  column={{ kind: "total" }}
                  sort={sort}
                  onSort={handleSort}
                  className="text-[var(--color-text-primary)]"
                >
                  Total
                </SortHeader>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.trackName}
                  className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface)]/60"
                >
                  <th
                    scope="row"
                    className="px-3 py-2 text-left font-normal text-[var(--color-text-primary)] whitespace-nowrap"
                  >
                    {row.trackName}
                    {row.free && (
                      <span className="ml-1.5 align-middle text-[9px] normal-case font-body font-semibold tracking-normal rounded-full px-1.5 py-0.5 border border-[var(--color-free)]/40 bg-[var(--color-free)]/10 text-[var(--color-free)]">
                        <span className="sr-only">, </span>
                        Free
                      </span>
                    )}
                  </th>
                  {seasons.map((season) => {
                    const count = row.perSeason[season.id] ?? 0;
                    return (
                      <td
                        key={season.id}
                        className={`text-right px-3 py-2 font-mono tabular-nums ${
                          count === 0 ? "text-[var(--color-text-muted)]" : "text-[var(--color-text-secondary)]"
                        }`}
                      >
                        {count}
                      </td>
                    );
                  })}
                  <td className="text-right px-3 py-2 font-mono tabular-nums font-semibold text-[var(--color-text-primary)]">
                    {row.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
