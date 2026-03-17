import { useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import AddSeriesModal from "./AddSeriesModal";
import TrackMapPopover from "../TrackMapPopover";
import type { Category, LicenseClass, WeekSchedule } from "../../types";
import EventTypeBadge from "../EventTypeBadge";

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

const licenseColors: Record<LicenseClass, string> = {
  R: "var(--color-lic-R)",
  D: "var(--color-lic-D)",
  C: "var(--color-lic-C)",
  B: "var(--color-lic-B)",
  A: "var(--color-lic-A)",
};

export default function WeekRow({ week, isCurrentWeek }: Props) {
  const { series, weeklyPicks, weeklyMaybes, removeWeeklyPick, removeWeeklyMaybe, toggleMaybe } = useAppStore();
  const [showModal, setShowModal] = useState(false);

  const pickedIds = weeklyPicks[week] ?? [];
  const maybeIds = weeklyMaybes[week] ?? [];
  const entries: { seriesId: number; isMaybe: boolean }[] = [
    ...pickedIds.map((id) => ({ seriesId: id, isMaybe: false })),
    ...maybeIds.map((id) => ({ seriesId: id, isMaybe: true })),
  ];
  const pickedSeries = entries
    .map((e) => {
      const s = series.find((s) => s.seriesId === e.seriesId);
      return s ? { ...s, isMaybe: e.isMaybe } : null;
    })
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
            const weekTrack = s.scheduleWeeks.find((w) => w.seasonWeek === week);
            const catColor = categoryColors[s.category];
            const licColor = licenseColors[s.licenseClass];
            return (
              <div
                key={s.seriesId}
                className={`bg-[var(--color-surface-elevated)] rounded-md px-4 py-2.5 text-sm group relative flex flex-col gap-1 ${
                  s.isMaybe ? "opacity-50" : ""
                }`}
                style={{
                  borderLeft: s.isMaybe
                    ? `3px dashed ${catColor}`
                    : `3px solid ${catColor}`,
                }}
              >
                <div className="font-medium pr-12 flex items-center gap-1.5">
                  {s.seriesName}
                  {s.isMaybe && (
                    <span className="text-[10px] text-gray-500 font-normal uppercase tracking-wide">maybe</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-xs px-2 py-px rounded-full font-medium"
                    style={{ backgroundColor: `color-mix(in srgb, ${catColor} 15%, transparent)`, color: catColor }}
                  >
                    {categoryLabels[s.category]}
                  </span>
                  <span
                    className="text-xs px-1.5 py-px rounded font-display font-bold border"
                    style={{ borderColor: licColor, color: licColor }}
                  >
                    {s.licenseClass}
                  </span>
                  <EventTypeBadge raceTimeMinutes={s.raceTimeMinutes} isRepeating={s.isRepeating} compact />
                </div>
                {weekTrack && (
                  <div className="text-xs text-[var(--color-text-secondary)] font-mono flex items-center gap-1.5">
                    <TrackMapPopover week={weekTrack}>
                      <span className="cursor-default">
                        {weekTrack.trackName}
                        {weekTrack.trackConfig ? ` — ${weekTrack.trackConfig}` : ""}
                      </span>
                    </TrackMapPopover>
                    <RainBadge week={weekTrack} />
                  </div>
                )}
                {weekTrack?.cars && weekTrack.cars.length > 0 && (
                  <div className="text-xs text-[var(--color-text-muted)] font-mono">
                    {weekTrack.cars.map((c) => c.carName).join(" · ")}
                  </div>
                )}
                <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => toggleMaybe(week, s.seriesId)}
                    aria-label={s.isMaybe ? "Promote to definite" : "Mark as maybe"}
                    className="text-[var(--color-text-muted)] hover:text-yellow-400 text-sm"
                    title={s.isMaybe ? "Promote to definite" : "Mark as maybe"}
                  >
                    ?
                  </button>
                  <button
                    onClick={() =>
                      s.isMaybe
                        ? removeWeeklyMaybe(week, s.seriesId)
                        : removeWeeklyPick(week, s.seriesId)
                    }
                    aria-label="Remove series"
                    className="text-[var(--color-text-muted)] hover:text-red-400 text-sm"
                  >
                    ✕
                  </button>
                </div>
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

function RainBadge({ week }: { week: WeekSchedule }) {
  if (!week.rainEnabled) return null;
  if (week.rainChance === 0) {
    return (
      <span className="text-[10px] text-sky-600/60 shrink-0" title="Dynamic weather enabled">
        ☁
      </span>
    );
  }
  return (
    <span
      className="text-[10px] text-sky-400 shrink-0"
      title={`${week.rainChance}% rain${week.maxPrecipDesc ? ` — ${week.maxPrecipDesc}` : ""}`}
    >
      🌧{week.rainChance}%
    </span>
  );
}
