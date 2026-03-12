import { useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import AddSeriesModal from "./AddSeriesModal";
import type { Category } from "../../types";

interface Props {
  week: number;
  isCurrentWeek: boolean;
}

const categoryColors: Record<Category, string> = {
  oval: "var(--color-cat-oval)",
  dirt_oval: "var(--color-cat-dirt-oval)",
  dirt_road: "var(--color-cat-dirt-road)",
  sports_car: "var(--color-cat-sports-car)",
  formula: "var(--color-cat-formula)",
};

const categoryLabels: Record<Category, string> = {
  oval: "Oval",
  dirt_oval: "Dirt Oval",
  dirt_road: "Dirt Road",
  sports_car: "Sports Car",
  formula: "Formula",
};

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
      <div className="flex items-center gap-5 px-5 py-4">
        <div
          className={`shrink-0 w-24 font-display font-semibold text-base uppercase ${
            isCurrentWeek
              ? "text-[var(--color-current-week)]"
              : "text-[var(--color-text-secondary)]"
          }`}
        >
          Week {week}
          {isCurrentWeek && <div className="text-xs opacity-70 font-normal">Current</div>}
        </div>
        <div className="flex-1 flex flex-wrap gap-3 items-center">
          {pickedSeries.map((s) => {
            if (!s) return null;
            const weekTrack = s.scheduleWeeks.find((w) => w.weekNumber === week);
            const catColor = categoryColors[s.category];
            return (
              <div
                key={s.seriesId}
                className="bg-[var(--color-surface-elevated)] rounded-md px-4 py-2.5 text-sm group relative flex flex-col gap-1"
                style={{ borderLeft: `3px solid ${catColor}` }}
              >
                <div className="font-medium pr-5">{s.seriesName}</div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-xs px-2 py-px rounded-full font-medium"
                    style={{ backgroundColor: `color-mix(in srgb, ${catColor} 15%, transparent)`, color: catColor }}
                  >
                    {categoryLabels[s.category]}
                  </span>
                  <span className="text-xs px-1.5 py-px rounded font-display font-bold border border-[var(--color-border)] text-[var(--color-text-secondary)]">
                    {s.licenseClass}
                  </span>
                </div>
                {weekTrack && (
                  <div className="text-xs text-[var(--color-text-secondary)] font-mono">
                    {weekTrack.trackName}
                    {weekTrack.trackConfig ? ` — ${weekTrack.trackConfig}` : ""}
                  </div>
                )}
                <button
                  onClick={() => removeWeeklyPick(week, s.seriesId)}
                  aria-label="Remove series"
                  className="absolute top-1.5 right-1.5 text-[var(--color-text-muted)] hover:text-red-400 text-sm opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              </div>
            );
          })}
          <button
            onClick={() => setShowModal(true)}
            aria-label="Add series"
            className="border border-dashed border-[var(--color-border)] rounded-md px-4 py-2.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)] transition-colors"
          >
            + Add Series
          </button>
        </div>
      </div>
      {showModal && <AddSeriesModal week={week} onClose={() => setShowModal(false)} />}
    </div>
  );
}
