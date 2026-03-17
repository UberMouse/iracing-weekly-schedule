import { useMemo } from "react";
import { useAppStore } from "../../store/useAppStore";
import SeriesCard from "../SeriesCard";
import FilterBar from "./FilterBar";

const LICENSE_ORDER: Record<string, number> = { R: 0, D: 1, C: 2, B: 3, A: 4 };
const CATEGORY_ORDER: Record<string, number> = { sports_car: 0, oval: 1, formula: 2, dirt_road: 3, dirt_oval: 4 };

export default function SeriesBrowser() {
  const { series, filters, favorites, toggleFavorite } = useAppStore();

  const filtered = useMemo(() => {
    return series
      .filter((s) => {
        if (filters.categories.length > 0 && !filters.categories.includes(s.category))
          return false;
        if (filters.licenseClasses.length > 0 && !filters.licenseClasses.includes(s.licenseClass))
          return false;
        if (filters.setupType && s.setupType !== filters.setupType) return false;
        if (
          filters.searchText &&
          !s.seriesName.toLowerCase().includes(filters.searchText.toLowerCase())
        )
          return false;
        if (filters.favoritesOnly && !favorites.includes(s.seriesId)) return false;
        return true;
      })
      .sort((a, b) => {
        const licDiff = (LICENSE_ORDER[a.licenseClass] ?? 99) - (LICENSE_ORDER[b.licenseClass] ?? 99);
        if (licDiff !== 0) return licDiff;
        const catDiff = (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99);
        if (catDiff !== 0) return catDiff;
        return a.seriesName.localeCompare(b.seriesName);
      });
  }, [series, filters, favorites]);

  return (
    <div>
      <FilterBar />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((s) => (
          <SeriesCard
            key={s.seriesId}
            series={s}
            isFavorite={favorites.includes(s.seriesId)}
            onToggleFavorite={() => toggleFavorite(s.seriesId)}
          />
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="text-center text-gray-500 py-12">No series match your filters.</p>
      )}
    </div>
  );
}
