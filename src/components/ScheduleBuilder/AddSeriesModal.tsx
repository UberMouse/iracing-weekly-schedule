import { useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import type { Series } from "../../types";

interface Props {
  week: number;
  onClose: () => void;
}

export default function AddSeriesModal({ week, onClose }: Props) {
  const { series, favorites, weeklyPicks, addWeeklyPick } = useAppStore();
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const pickedIds = weeklyPicks[week] ?? [];

  const available = (showAll ? series : series.filter((s) => favorites.includes(s.seriesId)))
    .filter((s) => !pickedIds.includes(s.seriesId))
    .filter((s) => !search || s.seriesName.toLowerCase().includes(search.toLowerCase()));

  const handleAdd = (s: Series) => {
    addWeeklyPick(week, s.seriesId);
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
              onChange={(e) => setShowAll(e.target.checked)}
            />
            Show all series (not just favorites)
          </label>
        </div>
        <div className="overflow-y-auto p-3 flex flex-col gap-1">
          {available.map((s) => {
            const weekTrack = s.scheduleWeeks.find((w) => w.weekNumber === week);
            return (
              <button
                key={s.seriesId}
                onClick={() => handleAdd(s)}
                className="text-left px-3 py-2.5 rounded-md hover:bg-gray-800 transition-colors"
              >
                <div className="text-sm font-medium">{s.seriesName}</div>
                {weekTrack && (
                  <div className="text-xs text-gray-500">
                    {weekTrack.trackName}
                    {weekTrack.trackConfig ? ` — ${weekTrack.trackConfig}` : ""}
                  </div>
                )}
              </button>
            );
          })}
          {available.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              {showAll ? "No series available" : "No favorites yet — check 'Show all series'"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
