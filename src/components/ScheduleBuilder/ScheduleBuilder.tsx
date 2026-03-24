import { useAppStore } from "../../store/useAppStore";
import WeekRow from "./WeekRow";
import SeasonCreditsTracker from "./SeasonCreditsTracker";

const TOTAL_WEEKS = 12;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function getCurrentWeek(seasonStartDate: string): number | null {
  const start = new Date(seasonStartDate).getTime();
  const now = Date.now();
  const week = Math.floor((now - start) / MS_PER_WEEK) + 1;
  return week >= 1 && week <= TOTAL_WEEKS ? week : null;
}

export default function ScheduleBuilder() {
  const seasonStartDate = useAppStore((s) => s.seasonStartDate);
  const currentWeek = getCurrentWeek(seasonStartDate);

  return (
    <div>
      <h2 className="font-display text-lg sm:text-xl font-semibold uppercase tracking-widest mb-3 sm:mb-5">Weekly Schedule</h2>
      <div className="flex flex-col gap-3">
        {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map((week) => (
          <WeekRow key={week} week={week} isCurrentWeek={week === currentWeek} seasonStartDate={seasonStartDate} />
        ))}
      </div>
      <div className="sticky bottom-4 mt-4 flex justify-end">
        <SeasonCreditsTracker />
      </div>
    </div>
  );
}
