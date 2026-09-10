import type { Car, Category, LicenseClass, Series, SetupType, WeekSchedule } from "../src/types";
import type { PrelimSeries, PrelimWeek } from "./pdf-schedule";
import { buildTrackMapLayers, buildTrackMapUrl, computeSeasonWeek, type RawTrackAsset } from "./transform";

/**
 * Turn the preliminary schedule PDF into the same `Series[]` the Data API path
 * produces.
 *
 * The PDF names things but never numbers them, so ids come from elsewhere:
 *  - cars and tracks resolve by name against the live catalogues, which iRacing
 *    keeps current year-round (only *schedules* go dark between seasons);
 *  - series ids are matched against previously-archived seasons, because picks
 *    and favourites are keyed by `seriesId` and must survive the swap to
 *    official data. Series that cannot be matched get a deterministic negative
 *    id, and `fetch-schedule` remaps those when the real schedule lands.
 * The PDF also never states setup type, which is inherited from the matched
 * series (it has never changed across an archived season boundary).
 */

export interface CarCatalogEntry {
  car_id: number;
  car_name: string;
}

export interface TrackCatalogEntry {
  track_id: number;
  track_name: string;
  config_name?: string;
}

/**
 * A known series to match against. Identity (id/name/category/licence) is
 * required; the rest is only present for series read out of an archived season,
 * and is inherited by the matching PDF series when available.
 */
export interface PriorSeries {
  seriesId: number;
  seriesName: string;
  category: Category;
  licenseClass: LicenseClass;
  setupType?: SetupType;
  isRepeating?: boolean;
  raceTimeMinutes?: number | null;
}

export interface PrelimDiagnostics {
  unresolvedTracks: string[];
  unresolvedCars: string[];
  /** Series from a section with no category heading we recognise ("UNRANKED"). */
  uncategorisedSeries: { name: string; category: Category; inherited: boolean }[];
  /** Series that got a synthetic id because nothing matched. */
  newSeries: string[];
  /** Series matched to a prior id by similarity rather than an exact name. */
  fuzzyMatches: { pdfName: string; matchedName: string; seriesId: number; score: number }[];
}

export interface PrelimTransformResult {
  seasonId: string;
  seasonName: string;
  seasonStartDate: string;
  series: Series[];
  diagnostics: PrelimDiagnostics;
}

const SEASON_WEEKS = 12;

/** Fold case, accents and punctuation so PDF and API spellings compare equal. */
export function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Drop the season marker the PDF appends to every series name
 * ("- 2026 Season 4", "2026 Season 4 Fixed", "- 2026 Season"), which the API
 * name never carries.
 */
export function stripSeasonSuffix(name: string): string {
  return name
    .replace(/\s*-?\s*20\d{2}\s*-?\s*Season(\s*\d+)?/gi, " ")
    .replace(/\s*-\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sørensen–Dice similarity over the two names' token sets. */
function similarity(a: string, b: string): number {
  const left = new Set(normalizeName(a).split(" ").filter(Boolean));
  const right = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return (2 * shared) / (left.size + right.size);
}

/**
 * Stable negative id for a series with no counterpart in any archived season.
 * Negative so it can never collide with a real iRacing series id, deterministic
 * so re-running the import keeps existing picks attached.
 */
export function syntheticSeriesId(name: string): number {
  const key = normalizeName(stripSeasonSuffix(name));
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return -(((hash >>> 0) % 1_000_000_000) + 1);
}

/** "Fixed" only counts as a setup marker when it stands alone as a word. */
const hasFixedMarker = (name: string): boolean => /\bfixed\b/i.test(name);

/**
 * Assign each PDF series a prior-season id. Runs as a global greedy matching so
 * that near-identical siblings ("Supercars Series" vs "Supercars Series -
 * Australian Servers") cannot both claim the same id.
 */
function matchSeriesToPrior(
  prelim: PrelimSeries[],
  priorSeries: PriorSeries[],
): { matches: Map<number, PriorSeries>; scores: Map<number, number> } {
  const MIN_SCORE = 0.6;

  const candidates: { index: number; prior: PriorSeries; score: number }[] = [];
  prelim.forEach((series, index) => {
    const pdfName = stripSeasonSuffix(series.seriesName);
    const pdfFixed = hasFixedMarker(series.seriesName);

    for (const prior of priorSeries) {
      // Category and licence come straight from the PDF's section headings and
      // have never drifted between archived seasons, so treat them as hard.
      // An unrecognised section leaves category null; licence still applies.
      if (series.category !== null && prior.category !== series.category) continue;
      if (prior.licenseClass !== series.licenseClass) continue;

      let score = similarity(pdfName, prior.seriesName);
      if (score === 0) continue;
      // Sibling series usually differ only by the word "Fixed"; agreeing on it
      // is the strongest available tie-break.
      if (pdfFixed === (prior.setupType === "fixed" || hasFixedMarker(prior.seriesName))) {
        score += 0.05;
      }
      candidates.push({ index, prior, score });
    }
  });

  candidates.sort((a, b) => b.score - a.score);

  const matches = new Map<number, PriorSeries>();
  const scores = new Map<number, number>();
  const claimed = new Set<number>();
  for (const candidate of candidates) {
    if (candidate.score < MIN_SCORE) break;
    if (matches.has(candidate.index) || claimed.has(candidate.prior.seriesId)) continue;
    matches.set(candidate.index, candidate.prior);
    scores.set(candidate.index, candidate.score);
    claimed.add(candidate.prior.seriesId);
  }
  return { matches, scores };
}

/** The `(2026-09-19 13:40 1x)` line that closes every week's detail column. */
const RACE_TIME_LINE_RE = /^\(\d{4}-\d{2}-\d{2}\s/;

/**
 * Split a week's detail column into track and per-week cars.
 *
 * Long track names wrap across lines and car-rotation series print that week's
 * cars directly underneath, with no marker between the two. Resolving against
 * the track catalogue removes the ambiguity: take the longest run of leading
 * lines that names a real track, and treat whatever follows as cars.
 */
function splitTrackAndCars(
  week: PrelimWeek,
  trackIndex: Map<string, TrackCatalogEntry>,
): { track: TrackCatalogEntry | undefined; rawTrack: string; carText: string } {
  const lines = week.detailLines.filter((line) => !RACE_TIME_LINE_RE.test(line));

  let bestTrack: TrackCatalogEntry | undefined;
  let bestUpTo = 0;
  for (let upTo = 1; upTo <= lines.length; upTo++) {
    // Names broken across a line keep their hyphen ("Cadillac V-" / "Series.R"),
    // but normalisation folds punctuation to spaces so either join resolves.
    const candidate = lines.slice(0, upTo).join(" ");
    const found = trackIndex.get(normalizeName(candidate));
    if (found) {
      bestTrack = found;
      bestUpTo = upTo;
    }
  }

  return {
    track: bestTrack,
    rawTrack: lines.slice(0, bestUpTo || 1).join(" "),
    carText: lines.slice(bestUpTo || 1).join(" "),
  };
}

function resolveCars(
  carText: string,
  carIndex: Map<string, CarCatalogEntry>,
  unresolved: Set<string>,
): Car[] {
  const cars: Car[] = [];
  for (const raw of carText.split(",")) {
    const name = raw.trim();
    if (!name) continue;
    const found = carIndex.get(normalizeName(name));
    if (found) cars.push({ carId: found.car_id, carName: found.car_name });
    else unresolved.add(name);
  }
  return cars;
}

/** "72F/22C, Rain chance 29%, ..." -> 29; "Rain chance None" -> 0. */
function parseRainChance(conditions: string): number {
  const match = conditions.match(/Rain chance (\d+)\s*%/);
  return match ? Number(match[1]) : 0;
}

/** "40 mins" -> 40. Lap- and heat-limited races ("35 laps", "H:8L C:8L F:20L") have no time. */
function parseRaceMinutes(raceLength: string): number | null {
  const match = raceLength.match(/(\d+)\s*mins?\b/i);
  return match ? Number(match[1]) : null;
}

/**
 * Repeating series advertise an interval ("Races every 2 hours at :15 past");
 * scheduled ones name the days they run ("Races every other Saturday at 7 GMT").
 */
function parseIsRepeating(racesDescription: string): boolean | undefined {
  if (!racesDescription.trim()) return undefined;
  return !/\b(mon|tues?|wed|weds|wednesday|thur|thurs|thursday|fri|sat|sun)\w*\b/i.test(
    racesDescription,
  );
}

/** Season start is the earliest week-1 date printed by a full-length series. */
function findSeasonStartDate(prelim: PrelimSeries[]): string {
  let earliest: string | undefined;
  for (const series of prelim) {
    if (series.weeks.length !== SEASON_WEEKS) continue;
    const first = series.weeks.find((week) => week.weekNumber === 1);
    if (first && (!earliest || first.startDate < earliest)) earliest = first.startDate;
  }
  if (!earliest) {
    for (const series of prelim) {
      for (const week of series.weeks) {
        if (!earliest || week.startDate < earliest) earliest = week.startDate;
      }
    }
  }
  if (!earliest) throw new Error("Could not determine season start date from the PDF");
  return earliest;
}

/** Nearly every series title ends in "2026 Season 4"; take the most common. */
function findSeasonIdentity(
  prelim: PrelimSeries[],
): { seasonId: string; seasonName: string } | undefined {
  const counts = new Map<string, number>();
  for (const series of prelim) {
    const match = series.seriesName.match(/(20\d{2})\s*-?\s*Season\s*(\d)/i);
    if (match) {
      const key = `${match[1]}-S${match[2]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let best: string | undefined;
  for (const [key, count] of counts) {
    if (!best || count > (counts.get(best) ?? 0)) best = key;
  }
  if (!best) return undefined;
  const [year, quarter] = best.split("-S");
  return { seasonId: best, seasonName: `${year} Season ${quarter}` };
}

export function transformPrelimToSeries(input: {
  prelim: PrelimSeries[];
  cars: CarCatalogEntry[];
  tracks: TrackCatalogEntry[];
  trackAssets?: Record<string, RawTrackAsset>;
  priorSeries: PriorSeries[];
  seasonId?: string;
}): PrelimTransformResult {
  const { prelim, cars, tracks, trackAssets, priorSeries } = input;

  const carIndex = new Map<string, CarCatalogEntry>();
  for (const car of cars) carIndex.set(normalizeName(car.car_name), car);

  const trackIndex = new Map<string, TrackCatalogEntry>();
  for (const track of tracks) {
    const full = track.config_name
      ? `${track.track_name} - ${track.config_name}`
      : track.track_name;
    trackIndex.set(normalizeName(full), track);
    // Bare names are a weaker key: only claim one if no config took it first.
    const bare = normalizeName(track.track_name);
    if (!trackIndex.has(bare)) trackIndex.set(bare, track);
  }

  const startDate = findSeasonStartDate(prelim);
  const seasonStart = new Date(`${startDate}T00:00:00.000Z`);
  const { matches, scores } = matchSeriesToPrior(prelim, priorSeries);

  const diagnostics: PrelimDiagnostics = {
    unresolvedTracks: [],
    unresolvedCars: [],
    uncategorisedSeries: [],
    newSeries: [],
    fuzzyMatches: [],
  };
  const unresolvedTracks = new Set<string>();
  const unresolvedCars = new Set<string>();

  const series = prelim.map((entry, index): Series => {
    const prior = matches.get(index);
    if (prior) {
      const exact =
        normalizeName(stripSeasonSuffix(entry.seriesName)) === normalizeName(prior.seriesName);
      if (!exact) {
        diagnostics.fuzzyMatches.push({
          pdfName: entry.seriesName,
          matchedName: prior.seriesName,
          seriesId: prior.seriesId,
          score: Number((scores.get(index) ?? 0).toFixed(3)),
        });
      }
    } else {
      diagnostics.newSeries.push(entry.seriesName);
    }

    const scheduleWeeks = entry.weeks
      .map((week): WeekSchedule | null => {
        const seasonWeek = computeSeasonWeek(week.startDate, seasonStart, week.weekNumber);
        if (seasonWeek === undefined) return null;

        const { track, rawTrack, carText } = splitTrackAndCars(week, trackIndex);
        if (!track) unresolvedTracks.add(rawTrack);

        const asset = track ? trackAssets?.[String(track.track_id)] : undefined;
        const trackMapUrl = buildTrackMapUrl(asset);
        const trackMapLayers = buildTrackMapLayers(asset);
        const weekCars = entry.isCarRotation
          ? resolveCars(carText, carIndex, unresolvedCars)
          : [];
        const rainChance = parseRainChance(week.conditions);

        return {
          weekNumber: week.weekNumber,
          seasonWeek,
          trackId: track?.track_id ?? 0,
          trackName: track?.track_name ?? rawTrack,
          ...(track?.config_name ? { trackConfig: track.config_name } : {}),
          rainChance,
          // The PDF prints a single chance figure; the API's separate
          // "rain enabled" flag agrees with chance > 0 in all but a handful
          // of weeks, so derive it rather than inventing a third state.
          rainEnabled: rainChance > 0,
          ...(trackMapUrl ? { trackMapUrl } : {}),
          ...(trackMapLayers ? { trackMapLayers } : {}),
          ...(entry.isCarRotation ? { cars: weekCars } : {}),
        };
      })
      .filter((week): week is WeekSchedule => week !== null);

    // "UNRANKED" series still belong to a category in the API; take the matched
    // series' one. iRacing files the handful that exist (arcade-style oval fun
    // races) under oval, which is the fallback when nothing matched.
    const category = entry.category ?? prior?.category ?? "oval";
    if (entry.category === null) {
      diagnostics.uncategorisedSeries.push({
        name: entry.seriesName,
        category,
        inherited: prior?.category !== undefined,
      });
    }

    const seriesCars = entry.isCarRotation
      ? []
      : resolveCars(entry.carLines.join(" "), carIndex, unresolvedCars);

    // The PDF gives a duration only for time-limited races. For lap- and
    // heat-limited ones fall back to the matched series' previous duration,
    // which keeps sprint/endurance classification correct.
    const raceTimeMinutes =
      parseRaceMinutes(entry.weeks[0]?.raceLength ?? "") ?? prior?.raceTimeMinutes ?? null;

    return {
      seriesId: prior?.seriesId ?? syntheticSeriesId(entry.seriesName),
      seriesName: stripSeasonSuffix(entry.seriesName),
      category,
      licenseClass: entry.licenseClass,
      // Never printed in the PDF; inherited, else inferred from the title.
      setupType:
        prior?.setupType ??
        (hasFixedMarker(entry.seriesName) ? "fixed" : "open"),
      // "Grid by class" appears exactly on the multiclass series.
      isMulticlass: entry.weeks.some((week) => week.conditions.includes("Grid by class")),
      totalWeeks: entry.weeks.length,
      raceTimeMinutes,
      isRepeating: parseIsRepeating(entry.racesDescription) ?? prior?.isRepeating ?? true,
      cars: seriesCars,
      scheduleWeeks,
    };
  })
  .filter((entry) => entry.scheduleWeeks.length > 0);

  diagnostics.unresolvedTracks = [...unresolvedTracks];
  diagnostics.unresolvedCars = [...unresolvedCars];

  const identity = findSeasonIdentity(prelim);
  const fallback = {
    seasonId: `${seasonStart.getUTCFullYear()}-S0`,
    seasonName: `${seasonStart.getUTCFullYear()} Season`,
  };
  const resolved = input.seasonId
    ? { seasonId: input.seasonId, seasonName: input.seasonId.replace("-S", " Season ") }
    : identity ?? fallback;

  return {
    ...resolved,
    seasonStartDate: seasonStart.toISOString(),
    series,
    diagnostics,
  };
}

/**
 * Map the series ids in a provisional archive onto the official ones, for the
 * moment the Data API publishes a season we had only scraped.
 *
 * Picks and favourites are keyed by `seriesId`, so every id the PDF import got
 * wrong — a synthetic id for a series it had never seen, or a mismatch against
 * a renamed one — would orphan the user's selections. Matching the two archives
 * by name gives a 1:1 correspondence; entries whose id already agrees are
 * omitted, leaving only the moves the app has to replay.
 */
export function buildSeriesIdRemap(
  provisional: Pick<Series, "seriesId" | "seriesName" | "category" | "licenseClass">[],
  official: Pick<Series, "seriesId" | "seriesName" | "category" | "licenseClass">[],
): Record<string, number> {
  const MIN_SCORE = 0.6;

  const candidates: { from: number; to: number; score: number }[] = [];
  for (const before of provisional) {
    for (const after of official) {
      if (before.category !== after.category) continue;
      if (before.licenseClass !== after.licenseClass) continue;
      const score = similarity(before.seriesName, after.seriesName);
      if (score >= MIN_SCORE) candidates.push({ from: before.seriesId, to: after.seriesId, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const remap: Record<string, number> = {};
  const usedFrom = new Set<number>();
  const usedTo = new Set<number>();
  for (const candidate of candidates) {
    if (usedFrom.has(candidate.from) || usedTo.has(candidate.to)) continue;
    usedFrom.add(candidate.from);
    usedTo.add(candidate.to);
    if (candidate.from !== candidate.to) remap[String(candidate.from)] = candidate.to;
  }
  return remap;
}
