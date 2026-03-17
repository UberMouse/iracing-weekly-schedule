import { useMemo } from "react";
import type { Series, LicenseClass } from "../types";

interface QualifiedSeries {
  seriesId: number;
  seriesName: string;
  licenseClass: LicenseClass;
  creditValue: number;
  weeksPicked: number;
}

interface InProgressSeries extends QualifiedSeries {
  weeksNeeded: 8;
}

export interface SeasonCredits {
  totalCredits: number;
  uncappedCredits: number;
  maxCredits: 10;
  qualifiedSeries: QualifiedSeries[];
  inProgressSeries: InProgressSeries[];
}

const WEEKS_NEEDED = 8;
const MAX_CREDITS = 10;

function creditValue(licenseClass: LicenseClass): number {
  return licenseClass === "B" || licenseClass === "A" ? 6 : 4;
}

export function useSeasonCredits(
  weeklyPicks: Record<number, number[]>,
  series: Series[],
): SeasonCredits {
  return useMemo(() => {
    const seriesById = new Map(series.map((s) => [s.seriesId, s]));

    // Invert weeklyPicks to per-series week counts
    const seriesWeeks = new Map<number, Set<number>>();
    for (const [week, ids] of Object.entries(weeklyPicks)) {
      for (const id of ids) {
        if (!seriesWeeks.has(id)) seriesWeeks.set(id, new Set());
        seriesWeeks.get(id)!.add(Number(week));
      }
    }

    const qualifiedSeries: QualifiedSeries[] = [];
    const inProgressSeries: InProgressSeries[] = [];

    for (const [seriesId, weeks] of seriesWeeks) {
      const s = seriesById.get(seriesId);
      if (!s || s.totalWeeks > 12) continue;

      const entry = {
        seriesId,
        seriesName: s.seriesName,
        licenseClass: s.licenseClass,
        creditValue: creditValue(s.licenseClass),
        weeksPicked: weeks.size,
      };

      if (weeks.size >= WEEKS_NEEDED) {
        qualifiedSeries.push(entry);
      } else {
        inProgressSeries.push({ ...entry, weeksNeeded: 8 });
      }
    }

    // Sort by credit value descending so highest-value series count first toward cap
    qualifiedSeries.sort((a, b) => b.creditValue - a.creditValue);
    inProgressSeries.sort((a, b) => b.weeksPicked - a.weeksPicked);

    const uncappedCredits = qualifiedSeries.reduce((sum, s) => sum + s.creditValue, 0);
    const totalCredits = Math.min(uncappedCredits, MAX_CREDITS);

    return {
      totalCredits,
      uncappedCredits,
      maxCredits: 10,
      qualifiedSeries,
      inProgressSeries,
    };
  }, [weeklyPicks, series]);
}
