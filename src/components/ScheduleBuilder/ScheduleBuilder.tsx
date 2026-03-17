import WeekRow from "./WeekRow";
import SeasonCreditsTracker from "./SeasonCreditsTracker";

const TOTAL_WEEKS = 12;
const CURRENT_WEEK = 1; // TODO: derive from season start date

export default function ScheduleBuilder() {
  return (
    <div>
      <h2 className="font-display text-xl font-semibold uppercase tracking-widest mb-5">Weekly Schedule</h2>
      <div className="flex flex-col gap-3">
        {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map((week) => (
          <WeekRow key={week} week={week} isCurrentWeek={week === CURRENT_WEEK} />
        ))}
      </div>
      <div className="sticky bottom-4 mt-4 flex justify-end">
        <SeasonCreditsTracker />
      </div>
    </div>
  );
}
