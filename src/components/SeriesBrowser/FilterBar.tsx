import { useAppStore } from "../../store/useAppStore";
import type { Category, LicenseClass, SetupType } from "../../types";

const categories: { value: Category; label: string }[] = [
  { value: "oval", label: "Oval" },
  { value: "dirt_oval", label: "Dirt Oval" },
  { value: "dirt_road", label: "Dirt Road" },
  { value: "sports_car", label: "Sports Car" },
  { value: "formula", label: "Formula" },
];

const licenseClasses: LicenseClass[] = ["R", "D", "C", "B", "A"];

export default function FilterBar() {
  const { filters, setFilters } = useAppStore();

  const toggleCategory = (cat: Category) => {
    const next = filters.categories.includes(cat)
      ? filters.categories.filter((c) => c !== cat)
      : [...filters.categories, cat];
    setFilters({ categories: next });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      {/* Category pills */}
      <div className="flex gap-1.5">
        {categories.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => toggleCategory(value)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filters.categories.includes(value)
                ? "bg-white text-gray-900 border-white"
                : "border-gray-700 text-gray-400 hover:border-gray-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* License class dropdown */}
      <select
        value={filters.licenseClass ?? ""}
        onChange={(e) =>
          setFilters({ licenseClass: (e.target.value || null) as LicenseClass | null })
        }
        className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-gray-300"
      >
        <option value="">All Licenses</option>
        {licenseClasses.map((lc) => (
          <option key={lc} value={lc}>{lc} License</option>
        ))}
      </select>

      {/* Setup type toggle */}
      <select
        value={filters.setupType ?? ""}
        onChange={(e) =>
          setFilters({ setupType: (e.target.value || null) as SetupType | null })
        }
        className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-gray-300"
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
        className="bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-gray-300 placeholder:text-gray-600 w-48"
      />

      {/* Favorites toggle */}
      <button
        onClick={() => setFilters({ favoritesOnly: !filters.favoritesOnly })}
        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
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
