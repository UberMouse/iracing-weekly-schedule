import { motion } from "motion/react";
import type { Series, Category, LicenseClass, WeekSchedule } from "../types";
import TrackMapPopover from "./TrackMapPopover";

interface Props {
  series: Series;
  isFavorite: boolean;
  onToggleFavorite: () => void;
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

export default function SeriesCard({ series, isFavorite, onToggleFavorite }: Props) {
  const catColor = categoryColors[series.category];
  const licColor = licenseColors[series.licenseClass];

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-col gap-3 hover:border-[var(--color-border-hover)] hover:shadow-lg hover:shadow-black/20 transition-[border-color,box-shadow] duration-200"
      style={{ borderLeftWidth: "2px", borderLeftColor: catColor }}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 data-testid="series-card-name" className="font-display font-semibold text-base leading-tight uppercase tracking-wide">
          {series.seriesName}
        </h3>
        <motion.button
          onClick={onToggleFavorite}
          aria-label="Toggle favorite"
          data-favorited={isFavorite ? "true" : "false"}
          whileTap={{ scale: 1.3 }}
          transition={{ type: "spring", stiffness: 500, damping: 15 }}
          className="shrink-0 text-xl leading-none"
          style={{ color: isFavorite ? "var(--color-accent)" : "var(--color-text-muted)" }}
        >
          {isFavorite ? "★" : "☆"}
        </motion.button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span
          className="text-sm px-2.5 py-0.5 rounded-full font-medium"
          style={{ backgroundColor: `color-mix(in srgb, ${catColor} 15%, transparent)`, color: catColor }}
        >
          {categoryLabels[series.category]}
        </span>
        <span
          className="text-sm px-2 py-0.5 rounded font-display font-bold border"
          style={{ borderColor: licColor, color: licColor }}
        >
          {series.licenseClass}
        </span>
        <span className="text-sm px-2.5 py-0.5 rounded-full bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)]">
          {series.setupType}
        </span>
        {series.isMulticlass && (
          <span className="text-sm px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400">
            Multiclass
          </span>
        )}
      </div>
      <p className="text-xs font-mono text-[var(--color-text-secondary)]">
        {series.cars.map((c) => c.carName).join(" · ")}
      </p>
      <div className="border-t border-[var(--color-border)] pt-2 mt-1 flex flex-col gap-0.5">
        {series.scheduleWeeks.map((w) => (
          <div key={w.weekNumber} className="flex gap-2 text-xs leading-snug items-center">
            <span className="font-mono text-[var(--color-text-muted)] shrink-0 w-7 text-right">W{w.weekNumber}</span>
            <TrackMapPopover week={w}>
              <span className="font-mono text-[var(--color-text-secondary)] cursor-default">
                {w.trackName}{w.trackConfig ? ` — ${w.trackConfig}` : ""}
              </span>
            </TrackMapPopover>
            <RainBadge week={w} />
          </div>
        ))}
      </div>
    </motion.div>
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
