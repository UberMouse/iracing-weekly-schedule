import { useAppStore } from "../../store/useAppStore";
import WeekRow from "./WeekRow";
import SeasonCreditsTracker from "./SeasonCreditsTracker";

const TOTAL_WEEKS = 12;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const EMPTY_PICKS = { weeklyPicks: {}, weeklyMaybes: {} };

function getCurrentWeek(seasonStartDate: string): number | null {
  const start = new Date(seasonStartDate).getTime();
  const now = Date.now();
  const week = Math.floor((now - start) / MS_PER_WEEK) + 1;
  return week >= 1 && week <= TOTAL_WEEKS ? week : null;
}

export default function ScheduleBuilder() {
  const currentSeasonId = useAppStore((s) => s.currentSeasonId);
  const viewingSeasonId = useAppStore((s) => s.viewingSeasonId);
  const availableSeasons = useAppStore((s) => s.availableSeasons);
  const setViewingSeason = useAppStore((s) => s.setViewingSeason);
  const viewing = useAppStore((s) => (s.viewingSeasonId ? s.seasonCache[s.viewingSeasonId] : undefined));
  const viewingPicks =
    useAppStore((s) => (s.viewingSeasonId ? s.seasonPicks[s.viewingSeasonId] : undefined)) ?? EMPTY_PICKS;

  const isCurrent = viewingSeasonId === currentSeasonId;
  const readOnly = !isCurrent;
  const currentWeek = isCurrent && viewing ? getCurrentWeek(viewing.seasonStartDate) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 sm:mb-5">
        <h2 className="font-display text-lg sm:text-xl font-semibold uppercase tracking-widest">
          Weekly Schedule
        </h2>
        {availableSeasons.length > 1 ? (
          <label className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] font-display uppercase tracking-wider">
            Season
            <select
              value={viewingSeasonId ?? ""}
              onChange={(e) => setViewingSeason(e.target.value)}
              className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-md px-2.5 py-1.5 text-sm text-[var(--color-text-primary)] font-display tracking-wider"
            >
              {[...availableSeasons]
                .sort((a, b) => b.startDate.localeCompare(a.startDate))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.id === currentSeasonId ? " (current)" : ""}
                  </option>
                ))}
            </select>
          </label>
        ) : (
          viewing && (
            <span className="text-xs text-[var(--color-text-secondary)] font-display uppercase tracking-wider">
              {viewing.seasonName}
            </span>
          )
        )}
      </div>

      {readOnly && (
        <p className="mb-3 text-xs text-[var(--color-text-secondary)] italic">
          Viewing a past season — read only.
        </p>
      )}

      {!viewing ? (
        <div className="flex items-center justify-center py-16 text-[var(--color-text-secondary)] gap-3">
          <div className="h-5 w-5 rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)] animate-spin" />
          <span className="text-sm">Loading season…</span>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map((week) => (
              <WeekRow
                key={week}
                week={week}
                isCurrentWeek={week === currentWeek}
                seasonStartDate={viewing.seasonStartDate}
                series={viewing.series}
                weeklyPicks={viewingPicks.weeklyPicks}
                weeklyMaybes={viewingPicks.weeklyMaybes}
                readOnly={readOnly}
              />
            ))}
          </div>
          <div className="sticky bottom-4 mt-4 flex justify-end">
            <SeasonCreditsTracker weeklyPicks={viewingPicks.weeklyPicks} series={viewing.series} />
          </div>
        </>
      )}
    </div>
  );
}
