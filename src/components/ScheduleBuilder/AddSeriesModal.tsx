import { useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import type { Series } from "../../types";
import EventTypeBadge from "../EventTypeBadge";

interface Props {
  week: number;
  onClose: () => void;
}

function SeriesRow({
  series,
  week,
  isInSchedule,
  onAdd,
  onAddAll,
}: {
  series: Series;
  week: number;
  isInSchedule: boolean;
  onAdd: () => void;
  onAddAll?: () => void;
}) {
  const weekTrack = series.scheduleWeeks.find((w) => w.seasonWeek === week);
  return (
    <button
      onClick={onAdd}
      className={`text-left px-3 py-2.5 rounded-md hover:bg-gray-800 transition-colors flex items-center gap-2 ${
        isInSchedule ? "bg-gray-800/40" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium flex items-center gap-1.5">
          {series.seriesName}
          <EventTypeBadge raceTimeMinutes={series.raceTimeMinutes} isRepeating={series.isRepeating} compact />
        </div>
        {weekTrack && (
          <div className="text-xs text-gray-500 flex items-center gap-1.5">
            <span>
              {weekTrack.trackName}
              {weekTrack.trackConfig ? ` — ${weekTrack.trackConfig}` : ""}
            </span>
            {weekTrack.rainEnabled && weekTrack.rainChance > 0 && (
              <span className="text-sky-400">🌧{weekTrack.rainChance}%</span>
            )}
          </div>
        )}
      </div>
      {onAddAll && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddAll();
          }}
          className="shrink-0 text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded border border-gray-700 hover:border-gray-500 transition-colors"
          title="Add to all weeks this series races"
        >
          All weeks
        </button>
      )}
    </button>
  );
}

export default function AddSeriesModal({ week, onClose }: Props) {
  const { series, favorites, weeklyPicks, weeklyMaybes, addWeeklyPick, addSeriesToAllWeeks, modalShowAllSeries, setModalShowAllSeries } =
    useAppStore();
  const [search, setSearch] = useState("");

  const showAll = modalShowAllSeries;

  const pickedIds = weeklyPicks[week] ?? [];
  const maybeIds = weeklyMaybes[week] ?? [];

  const available = (showAll ? series : series.filter((s) => favorites.includes(s.seriesId)))
    .filter((s) => !pickedIds.includes(s.seriesId))
    .filter((s) => !maybeIds.includes(s.seriesId))
    .filter((s) => s.scheduleWeeks.some((w) => w.seasonWeek === week))
    .filter((s) => !search || s.seriesName.toLowerCase().includes(search.toLowerCase()));

  // Feature 1: partition into already-in-schedule vs other
  const allPickedIds = new Set<number>();
  for (const [w, ids] of Object.entries(weeklyPicks)) {
    if (Number(w) !== week) for (const id of ids) allPickedIds.add(id);
  }
  for (const [w, ids] of Object.entries(weeklyMaybes)) {
    if (Number(w) !== week) for (const id of ids) allPickedIds.add(id);
  }

  const alreadyInSchedule = available.filter((s) => allPickedIds.has(s.seriesId));
  const otherSeries = available.filter((s) => !allPickedIds.has(s.seriesId));

  const handleAdd = (s: Series) => {
    addWeeklyPick(week, s.seriesId);
    onClose();
  };

  const handleAddAll = (s: Series) => {
    addSeriesToAllWeeks(s.seriesId);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-lg max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-800">
          <h3 className="font-semibold text-base mb-3">Add Series — Week {week}</h3>
          <input
            type="text"
            placeholder="Search series..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-300 placeholder:text-gray-600"
            autoFocus
          />
          <label className="flex items-center gap-2 mt-2.5 text-sm text-gray-400">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setModalShowAllSeries(e.target.checked)}
            />
            Show all series (not just favorites)
          </label>
        </div>
        <div className="overflow-y-auto p-3 flex flex-col gap-1">
          {alreadyInSchedule.length > 0 && (
            <>
              <div className="text-xs text-gray-500 px-3 py-1.5 font-medium">In your schedule</div>
              {alreadyInSchedule.map((s) => (
                <SeriesRow
                  key={s.seriesId}
                  series={s}
                  week={week}
                  isInSchedule
                  onAdd={() => handleAdd(s)}
                  onAddAll={s.scheduleWeeks.length > 1 ? () => handleAddAll(s) : undefined}
                />
              ))}
              {otherSeries.length > 0 && <div className="border-b border-gray-700 my-1" />}
            </>
          )}
          {otherSeries.map((s) => (
            <SeriesRow
              key={s.seriesId}
              series={s}
              week={week}
              isInSchedule={false}
              onAdd={() => handleAdd(s)}
              onAddAll={s.scheduleWeeks.length > 1 ? () => handleAddAll(s) : undefined}
            />
          ))}
          {available.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              {showAll ? "No series race this week" : "No favorites race this week — check 'Show all series'"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
