import { motion } from "motion/react";
import type { Series, Category } from "../types";

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

export default function SeriesCard({ series, isFavorite, onToggleFavorite }: Props) {
  const catColor = categoryColors[series.category];

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 flex flex-col gap-3 hover:border-[var(--color-border-hover)] hover:shadow-lg hover:shadow-black/20 transition-[border-color,box-shadow] duration-200"
      style={{ borderLeftWidth: "2px", borderLeftColor: catColor }}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display font-semibold text-sm leading-tight uppercase tracking-wide">
          {series.seriesName}
        </h3>
        <motion.button
          onClick={onToggleFavorite}
          aria-label="Toggle favorite"
          data-favorited={isFavorite ? "true" : "false"}
          whileTap={{ scale: 1.3 }}
          transition={{ type: "spring", stiffness: 500, damping: 15 }}
          className="shrink-0 text-lg leading-none"
          style={{ color: isFavorite ? "var(--color-accent)" : "var(--color-text-muted)" }}
        >
          {isFavorite ? "★" : "☆"}
        </motion.button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ backgroundColor: `color-mix(in srgb, ${catColor} 15%, transparent)`, color: catColor }}
        >
          {categoryLabels[series.category]}
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded font-display font-bold border border-[var(--color-border)] text-[var(--color-text-secondary)]">
          {series.licenseClass}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)]">
          {series.setupType}
        </span>
        {series.isMulticlass && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400">
            Multiclass
          </span>
        )}
      </div>
      <p className="text-[11px] font-mono text-[var(--color-text-muted)]">
        {series.cars.map((c) => c.carName).join(" · ")}
      </p>
    </motion.div>
  );
}
