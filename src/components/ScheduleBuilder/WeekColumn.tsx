import { useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import AddSeriesModal from "./AddSeriesModal";

interface Props {
  week: number;
  isCurrentWeek: boolean;
}

export default function WeekColumn({ week, isCurrentWeek }: Props) {
  const { series, weeklyPicks, removeWeeklyPick } = useAppStore();
  const [showModal, setShowModal] = useState(false);

  const pickedIds = weeklyPicks[week] ?? [];
  const pickedSeries = pickedIds
    .map((id) => series.find((s) => s.seriesId === id))
    .filter(Boolean);

  return (
    <div
      className={`flex-shrink-0 w-56 border rounded-lg flex flex-col ${
        isCurrentWeek
          ? "border-[var(--color-current-week)] bg-[var(--color-current-week)]/5"
          : "border-[var(--color-border)] bg-[var(--color-surface)]/50"
      }`}
    >
      <div
        className={`px-3 py-2 text-xs font-semibold border-b ${
          isCurrentWeek
            ? "border-[var(--color-current-week)]/30 text-[var(--color-current-week)]"
            : "border-[var(--color-border)] text-[var(--color-text-secondary)]"
        }`}
      >
        Week {week}
        {isCurrentWeek && <span className="ml-2 text-[10px] opacity-70">Current</span>}
      </div>
      <div className="p-2 flex flex-col gap-2 flex-1">
        {pickedSeries.map((s) => {
          if (!s) return null;
          const weekTrack = s.scheduleWeeks.find((w) => w.weekNumber === week);
          return (
            <div key={s.seriesId} className="bg-[var(--color-surface-elevated)] rounded-md px-2 py-1.5 text-xs group relative">
              <div className="font-medium pr-5">{s.seriesName}</div>
              {weekTrack && (
                <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5 font-mono">
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
          className="border border-dashed border-[var(--color-border)] rounded-md px-2 py-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)] transition-colors"
        >
          + Add Series
        </button>
      </div>
      {showModal && <AddSeriesModal week={week} onClose={() => setShowModal(false)} />}
    </div>
  );
}
