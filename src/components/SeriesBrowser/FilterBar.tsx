import { useAppStore } from "../../store/useAppStore";
import type { Category, LicenseClass, SetupType } from "../../types";

const categories: { value: Category; label: string; color: string }[] = [
  { value: "sports_car", label: "Sports Car", color: "var(--color-cat-sports-car)" },
  { value: "oval", label: "Oval", color: "var(--color-cat-oval)" },
  { value: "formula", label: "Formula", color: "var(--color-cat-formula)" },
  { value: "dirt_road", label: "Dirt Road", color: "var(--color-cat-dirt-road)" },
  { value: "dirt_oval", label: "Dirt Oval", color: "var(--color-cat-dirt-oval)" },
];

const licenseClasses: { value: LicenseClass; label: string; color: string }[] = [
  { value: "R", label: "R", color: "var(--color-lic-R)" },
  { value: "D", label: "D", color: "var(--color-lic-D)" },
  { value: "C", label: "C", color: "var(--color-lic-C)" },
  { value: "B", label: "B", color: "var(--color-lic-B)" },
  { value: "A", label: "A", color: "var(--color-lic-A)" },
];

export default function FilterBar() {
  const { filters, setFilters } = useAppStore();

  const toggleCategory = (cat: Category) => {
    const next = filters.categories.includes(cat)
      ? filters.categories.filter((c) => c !== cat)
      : [...filters.categories, cat];
    setFilters({ categories: next });
  };

  const toggleLicense = (lc: LicenseClass) => {
    const next = filters.licenseClasses.includes(lc)
      ? filters.licenseClasses.filter((l) => l !== lc)
      : [...filters.licenseClasses, lc];
    setFilters({ licenseClasses: next });
  };

  return (
    <div className="sticky top-[63px] z-30 flex flex-wrap items-center gap-4 pb-4 mb-2 bg-[var(--color-bg)] pt-4 -mt-4 border-b border-[var(--color-border)]">
      {/* Category pills */}
      <div className="flex gap-1.5">
        {categories.map(({ value, label, color }) => {
          const active = filters.categories.includes(value);
          return (
            <button
              key={value}
              onClick={() => toggleCategory(value)}
              className="text-sm px-4 py-2 rounded-full border transition-colors"
              style={
                active
                  ? { backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)`, borderColor: color, color }
                  : { borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* License class pills */}
      <div className="flex gap-1.5">
        {licenseClasses.map(({ value, label, color }) => {
          const active = filters.licenseClasses.includes(value);
          return (
            <button
              key={value}
              onClick={() => toggleLicense(value)}
              className="text-sm w-9 h-9 rounded-full border font-display font-bold transition-colors"
              style={
                active
                  ? { backgroundColor: `color-mix(in srgb, ${color} 25%, transparent)`, borderColor: color, color }
                  : { borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Setup type toggle */}
      <select
        value={filters.setupType ?? ""}
        onChange={(e) =>
          setFilters({ setupType: (e.target.value || null) as SetupType | null })
        }
        className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-300"
      >
        <option value="">All Setups</option>
        <option value="fixed">Fixed</option>
        <option value="open">Open</option>
      </select>

      {/* Search */}
      <input
        type="text"
        placeholder="Search series..."
        value={filters.searchText}
        onChange={(e) => setFilters({ searchText: e.target.value })}
        className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-300 placeholder:text-gray-600 w-56"
      />

      {/* Favorites toggle */}
      <button
        onClick={() => setFilters({ favoritesOnly: !filters.favoritesOnly })}
        className={`text-sm px-4 py-2 rounded-full border transition-colors ${
          filters.favoritesOnly
            ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/50"
            : "border-gray-700 text-gray-400 hover:border-gray-500"
        }`}
      >
        ★ Favorites
      </button>
    </div>
  );
}
