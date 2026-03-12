import { useRef, useEffect } from "react";
import WeekColumn from "./WeekColumn";

const TOTAL_WEEKS = 12;
const CURRENT_WEEK = 1; // TODO: derive from season start date

export default function ScheduleBuilder() {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to current week on mount
    if (scrollRef.current) {
      const currentCol = scrollRef.current.children[CURRENT_WEEK - 1] as HTMLElement;
      if (currentCol) {
        currentCol.scrollIntoView?.({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }
  }, []);

  return (
    <div>
      <h2 className="font-display text-lg font-semibold uppercase tracking-widest mb-4">Weekly Schedule</h2>
      <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-4">
        {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map((week) => (
          <WeekColumn key={week} week={week} isCurrentWeek={week === CURRENT_WEEK} />
        ))}
      </div>
    </div>
  );
}
