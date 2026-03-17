import { classifyEventType, type EventType } from "../types";

const config: Record<EventType, { label: string; color: string }> = {
  sprint: { label: "", color: "" },
  endurance: { label: "Endurance", color: "var(--color-evt-endurance)" },
  special: { label: "Special Event", color: "var(--color-evt-special)" },
};

interface Props {
  raceTimeMinutes: number | null;
  isRepeating: boolean;
  compact?: boolean;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export default function EventTypeBadge({ raceTimeMinutes, isRepeating, compact = false }: Props) {
  const eventType = classifyEventType(raceTimeMinutes, isRepeating);
  if (eventType === "sprint") return null;

  const { label, color } = config[eventType];
  const duration = raceTimeMinutes ? formatDuration(raceTimeMinutes) : "";
  const title = `${label}${duration ? ` (${duration})` : ""}`;

  if (compact) {
    return (
      <span
        className="text-[10px] font-medium px-1 py-px rounded shrink-0"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)`, color }}
        title={title}
      >
        {label}{duration ? ` ${duration}` : ""}
      </span>
    );
  }

  return (
    <span
      className="text-sm px-2.5 py-0.5 rounded-full font-medium"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
      title={duration ? `Race duration: ${duration}` : undefined}
    >
      {label}
    </span>
  );
}
