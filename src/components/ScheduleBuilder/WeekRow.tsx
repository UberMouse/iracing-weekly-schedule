import { useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import AddSeriesModal from "./AddSeriesModal";

interface Props {
  week: number;
  isCurrentWeek: boolean;
}

export default function WeekRow({ week, isCurrentWeek }: Props) {
  const { series, weeklyPicks, removeWeeklyPick } = useAppStore();
  const [showModal, setShowModal] = useState(false);

  const pickedIds = weeklyPicks[week] ?? [];
  const pickedSeries = pickedIds
    .map((id) => series.find((s) => s.seriesId === id))
    .filter(Boolean);

  return (
    <div
      className={`border rounded-lg ${
        isCurrentWeek
          ? "border-[var(--color-current-week)] bg-[var(--color-current-week)]/5"
          : "border-[var(--color-border)] bg-[var(--color-surface)]/50"
      }`}
    >
      <div className="flex items-center gap-4 px-4 py-3">
        <div
          className={`shrink-0 w-20 font-display font-semibold text-sm uppercase ${
            isCurrentWeek
              ? "text-[var(--color-current-week)]"
              : "text-[var(--color-text-secondary)]"
          }`}
        >
          Week {week}
          {isCurrentWeek && <div className="text-[10px] opacity-70 font-normal">Current</div>}
        </div>
        <div className="flex-1 flex flex-wrap gap-2 items-center">
          {pickedSeries.map((s) => {
            if (!s) return null;
            const weekTrack = s.scheduleWeeks.find((w) => w.weekNumber === week);
            return (
              <div key={s.seriesId} className="bg-[var(--color-surface-elevated)] rounded-md px-3 py-2 text-xs group relative flex flex-col gap-0.5">
                <div className="font-medium pr-5">{s.seriesName}</div>
                {weekTrack && (
                  <div className="text-[10px] text-[var(--color-text-muted)] font-mono">
                    {weekTrack.trackName}
                    {weekTrack.trackConfig ? ` — ${weekTrack.trackConfig}` : ""}
                  </div>
                )}
                <button
                  onClick={() => removeWeeklyPick(week, s.seriesId)}
                  aria-label="Remove series"
                  className="absolute top-1 right-1 text-[var(--color-text-muted)] hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              </div>
            );
          })}
          <button
            onClick={() => setShowModal(true)}
            aria-label="Add series"
            className="border border-dashed border-[var(--color-border)] rounded-md px-3 py-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)] transition-colors"
          >
            + Add Series
          </button>
        </div>
      </div>
      {showModal && <AddSeriesModal week={week} onClose={() => setShowModal(false)} />}
    </div>
  );
}
