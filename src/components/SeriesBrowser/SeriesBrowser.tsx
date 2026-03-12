import { useMemo } from "react";
import { useAppStore } from "../../store/useAppStore";
import SeriesCard from "../SeriesCard";
import FilterBar from "./FilterBar";

export default function SeriesBrowser() {
  const { series, filters, favorites, toggleFavorite } = useAppStore();

  const filtered = useMemo(() => {
    return series.filter((s) => {
      if (filters.categories.length > 0 && !filters.categories.includes(s.category))
        return false;
      if (filters.licenseClass && s.licenseClass !== filters.licenseClass) return false;
      if (filters.setupType && s.setupType !== filters.setupType) return false;
      if (
        filters.searchText &&
        !s.seriesName.toLowerCase().includes(filters.searchText.toLowerCase())
      )
        return false;
      if (filters.favoritesOnly && !favorites.includes(s.seriesId)) return false;
      return true;
    });
  }, [series, filters, favorites]);

  return (
    <div>
      <FilterBar />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
