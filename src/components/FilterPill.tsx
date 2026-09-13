/**
 * Shared pill-shaped toggle button used by category filters (SeriesBrowser's
 * FilterBar) and the Tracks page's type filter. `color` drives the active
 * state's tint (border/text/background); pass null for a neutral accent tint.
 */
export default function FilterPill({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="text-xs sm:text-sm px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full border transition-colors"
      style={
        active
          ? color
            ? { backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)`, borderColor: color, color }
            : {
                backgroundColor: "var(--color-accent-dim)",
                borderColor: "var(--color-accent)",
                color: "var(--color-accent)",
              }
          : { borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }
      }
    >
      {label}
    </button>
  );
}
