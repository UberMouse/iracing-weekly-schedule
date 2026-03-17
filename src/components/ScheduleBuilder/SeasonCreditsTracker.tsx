import { useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import { useSeasonCredits } from "../../hooks/useSeasonCredits";
import type { LicenseClass } from "../../types";

const licenseColors: Record<LicenseClass, string> = {
  R: "var(--color-lic-R)",
  D: "var(--color-lic-D)",
  C: "var(--color-lic-C)",
  B: "var(--color-lic-B)",
  A: "var(--color-lic-A)",
};

export default function SeasonCreditsTracker() {
  const [expanded, setExpanded] = useState(false);
  const { weeklyPicks, series } = useAppStore();
  const credits = useSeasonCredits(weeklyPicks, series);

  const hasAnySeries = credits.qualifiedSeries.length > 0 || credits.inProgressSeries.length > 0;
  const isCapped = credits.totalCredits >= credits.maxCredits;

  const progressPct = (credits.totalCredits / credits.maxCredits) * 100;

  return (
    <div className="flex flex-col items-end gap-2">
      {expanded && (
        <div
          className="bg-[var(--color-surface-elevated)] border border-[var(--color-border)] rounded-lg shadow-xl w-80 max-h-96 overflow-y-auto"
          role="region"
          aria-label="Season credits details"
        >
          <div className="p-4">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-[var(--color-text)] mb-3">
              Season Credits
            </h3>

            {credits.qualifiedSeries.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wide mb-1.5">
                  Qualified
                </div>
                {credits.qualifiedSeries.map((s) => (
                  <div
                    key={s.seriesId}
                    className="flex items-center gap-2 py-1.5 text-sm"
                  >
                    <span className="text-green-400 shrink-0">&#10003;</span>
                    <span
                      className="text-xs px-1.5 py-px rounded font-display font-bold border shrink-0"
                      style={{
                        borderColor: licenseColors[s.licenseClass],
                        color: licenseColors[s.licenseClass],
                      }}
                    >
                      {s.licenseClass}
                    </span>
                    <span className="truncate flex-1 text-[var(--color-text)]">{s.seriesName}</span>
                    <span className="text-[var(--color-text)] shrink-0 font-mono text-xs font-semibold">
                      ${s.creditValue}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {credits.inProgressSeries.length > 0 && (
              <div>
                <div className="text-xs text-[var(--color-text-secondary)] uppercase tracking-wide mb-1.5">
                  In Progress
                </div>
                {credits.inProgressSeries.map((s) => (
                  <div
                    key={s.seriesId}
                    className="flex items-center gap-2 py-1.5 text-sm"
                  >
                    <span className="text-[var(--color-text-secondary)] shrink-0 text-xs font-mono w-5 text-center">
                      {s.weeksPicked}/{s.weeksNeeded}
                    </span>
                    <span
                      className="text-xs px-1.5 py-px rounded font-display font-bold border shrink-0"
                      style={{
                        borderColor: licenseColors[s.licenseClass],
                        color: licenseColors[s.licenseClass],
                      }}
                    >
                      {s.licenseClass}
                    </span>
                    <span className="truncate flex-1 text-[var(--color-text)]">{s.seriesName}</span>
                    <span className="text-[var(--color-text)] shrink-0 font-mono text-xs font-semibold">
                      ${s.creditValue}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {!hasAnySeries && (
              <p className="text-sm text-[var(--color-text-secondary)]">
                Add series to your weekly schedule to track season credits.
              </p>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setExpanded(!expanded)}
        aria-label="Toggle season credits tracker"
        className={`rounded-full px-4 py-2 text-sm font-semibold shadow-lg border transition-colors ${
          isCapped
            ? "bg-green-600/90 border-green-500 text-white"
            : hasAnySeries
              ? "bg-amber-600/90 border-amber-500 text-white"
              : "bg-[var(--color-surface-elevated)] border-[var(--color-border)] text-[var(--color-text-secondary)]"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs opacity-75 font-normal">Season Credits</span>
          <span>${credits.totalCredits} / ${credits.maxCredits}</span>
          <div className="w-16 h-1.5 bg-black/20 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all bg-white/60"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </button>
    </div>
  );
}
