import { useId, useMemo, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import AddSeriesModal from "./AddSeriesModal";
import { findBackToBacks, formatBackToBackMatches } from "./backToBack";
import TrackMapPopover from "../TrackMapPopover";
import { isCarRotation } from "../../types";
import type { Category, LicenseClass, WeekSchedule, Series } from "../../types";
import EventTypeBadge from "../EventTypeBadge";

interface Props {
  week: number;
  isCurrentWeek: boolean;
  seasonStartDate: string;
  series: Series[];
  weeklyPicks: Record<number, number[]>;
  weeklyMaybes: Record<number, number[]>;
  readOnly?: boolean;
  /** The season came from iRacing's preliminary PDF, so session lengths are estimates. */
  provisional?: boolean;
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
/** Stable fallback so a week without picks doesn't defeat the memos below. */
const NO_IDS: number[] = [];

function formatWeekStartDate(seasonStartDate: string, week: number): string {
  const start = new Date(seasonStartDate).getTime();
  const weekStart = new Date(start + (week - 1) * MS_PER_WEEK);
  return weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

export default function WeekRow({
  week,
  isCurrentWeek,
  seasonStartDate,
  series,
  weeklyPicks,
  weeklyMaybes,
  readOnly = false,
  provisional = false,
}: Props) {
  const { removeWeeklyPick, removeWeeklyMaybe, toggleMaybe } = useAppStore();
  const [showModal, setShowModal] = useState(false);
  const [showBackToBacks, setShowBackToBacks] = useState(false);
  const backToBacksId = useId();

  // Every row re-renders on any store change, but the store keeps untouched
  // weeks' id arrays, so these memos only recompute when this week changes.
  const pickedIds = weeklyPicks[week] ?? NO_IDS;
  const maybeIds = weeklyMaybes[week] ?? NO_IDS;
  const pickedSeries = useMemo(() => {
    const entries: { seriesId: number; isMaybe: boolean }[] = [
      ...pickedIds.map((id) => ({ seriesId: id, isMaybe: false })),
      ...maybeIds.map((id) => ({ seriesId: id, isMaybe: true })),
    ];
    return entries
      .map((e) => {
        const s = series.find((s) => s.seriesId === e.seriesId);
        return s ? { ...s, isMaybe: e.isMaybe } : null;
      })
      .filter((s): s is Series & { isMaybe: boolean } => s !== null);
  }, [series, pickedIds, maybeIds]);
  const backToBacks = useMemo(
    () => (pickedSeries.length >= 2 ? findBackToBacks(pickedSeries, week) : null),
    [pickedSeries, week],
  );
  // Formatting is the expensive part, so only do it while the panel is open.
  const backToBackLines = useMemo(() => {
    if (!showBackToBacks || !backToBacks) return null;
    const referenceDate = new Date(new Date(seasonStartDate).getTime() + (week - 1) * MS_PER_WEEK);
    return backToBacks.pairs.map((pair) =>
      formatBackToBackMatches(pair.matches, pair.sessionMinutes, { referenceDate }),
    );
  }, [showBackToBacks, backToBacks, seasonStartDate, week]);

  return (
    <div
      className={`border rounded-lg ${
        isCurrentWeek
          ? "border-[var(--color-current-week)] bg-[var(--color-current-week)]/5"
          : "border-[var(--color-border)] bg-[var(--color-surface)]/50"
      }`}
    >
      <div className="flex items-center gap-3 sm:gap-5 px-3 sm:px-5 py-3 sm:py-4">
        <div
          className={`shrink-0 w-16 sm:w-24 font-display font-semibold text-sm sm:text-base uppercase ${
            isCurrentWeek
              ? "text-[var(--color-current-week)]"
              : "text-[var(--color-text-secondary)]"
          }`}
        >
          Week {week}
          <div className="text-xs opacity-70 font-normal">{formatWeekStartDate(seasonStartDate, week)}</div>
          {isCurrentWeek && <div className="text-xs opacity-70 font-normal">Current</div>}
        </div>
        <div className="flex-1 flex flex-wrap gap-2 sm:gap-3 items-center">
          {pickedSeries.map((s) => {
            const weekTrack = s.scheduleWeeks.find((w) => w.seasonWeek === week);
            const catColor = categoryColors[s.category];
            const licColor = licenseColors[s.licenseClass];
            return (
              <div
                key={s.seriesId}
                className={`bg-[var(--color-surface-elevated)] rounded-md px-3 sm:px-4 py-2 sm:py-2.5 text-sm group relative flex flex-col gap-1 ${
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
                {weekTrack && isCarRotation(s) && weekTrack.cars && weekTrack.cars.length > 0 ? (
                  <div className="text-xs text-[var(--color-text-secondary)] font-mono">
                    {weekTrack.cars.map((c) => c.carName).join(" · ")}
                  </div>
                ) : weekTrack ? (
                  <div className="text-xs text-[var(--color-text-secondary)] font-mono flex items-center gap-1.5">
                    <TrackMapPopover week={weekTrack}>
                      <span className="cursor-default">
                        {weekTrack.trackName}
                        {weekTrack.trackConfig ? ` — ${weekTrack.trackConfig}` : ""}
                      </span>
                    </TrackMapPopover>
                    <RainBadge week={weekTrack} />
                  </div>
                ) : null}
                {!readOnly && (
                  <div className="absolute top-1.5 right-1.5 flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
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
                )}
              </div>
            );
          })}
          {!readOnly && (
            <button
              onClick={() => setShowModal(true)}
              aria-label="Add series"
              className="border border-dashed border-[var(--color-border)] rounded-md px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)] transition-colors"
            >
              + Add Series
            </button>
          )}
        </div>
      </div>
      {backToBacks && (
        <div className="border-t border-[var(--color-border)] px-3 sm:px-5 py-2 text-xs">
          <button
            type="button"
            onClick={() => setShowBackToBacks((open) => !open)}
            aria-expanded={showBackToBacks}
            aria-controls={backToBacksId}
            className="flex items-center gap-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <span aria-hidden="true" className={`inline-block transition-transform ${showBackToBacks ? "rotate-90" : ""}`}>
              ▸
            </span>
            Back-2-backs ({backToBacks.pairs.length})
          </button>
          {/* The panel stays mounted so aria-controls always resolves; its
              contents only render while open. */}
          <div id={backToBacksId} hidden={!showBackToBacks} className="mt-2 flex flex-col gap-2">
            {backToBackLines && (
              <>
                {backToBacks.pairs.length === 0 ? (
                  <p className="text-[var(--color-text-muted)]">No back-2-backs this week</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {backToBacks.pairs.map((pair, i) => (
                      <li key={`${pair.from.seriesId}-${pair.to.seriesId}`}>
                        <div className="font-medium text-[var(--color-text-primary)]">
                          {pair.from.seriesName}{" "}
                          <span
                            className={`font-normal text-[var(--color-text-secondary)] ${
                              provisional ? "cursor-help underline decoration-dotted underline-offset-2" : ""
                            }`}
                            title={provisional ? "Estimated from iRacing's preliminary schedule" : undefined}
                          >
                            {`(${provisional ? "~" : ""}${pair.sessionMinutes} min)`}
                          </span>
                          {provisional && (
                            <span className="sr-only"> (estimated from iRacing's preliminary schedule)</span>
                          )}{" "}
                          → {pair.to.seriesName}
                        </div>
                        <div className="flex flex-wrap gap-x-3 font-mono text-[var(--color-text-secondary)]">
                          {backToBackLines[i].map((line) => (
                            <span key={line}>{line}</span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {backToBacks.missingStartTimes.length > 0 && (
                  <p className="text-[var(--color-text-muted)]">
                    No start times: {backToBacks.missingStartTimes.map((s) => s.seriesName).join(", ")}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {!readOnly && showModal && (
        <AddSeriesModal
          week={week}
          series={series}
          weeklyPicks={weeklyPicks}
          weeklyMaybes={weeklyMaybes}
          onClose={() => setShowModal(false)}
        />
      )}
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
