import type { RaceTimes, Series } from "../../types";

/** B may start up to this many minutes before A's scheduled end… */
export const WINDOW_BEFORE_END_MINUTES = 5;
/** …and up to this many minutes after it (both ends inclusive). */
export const WINDOW_AFTER_END_MINUTES = 15;

const MINUTES_PER_DAY = 24 * 60;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = MINUTES_PER_DAY * MS_PER_MINUTE;

/**
 * Matching (A start → B start) occurrences for one ordered pair.
 *
 * - `daily`: both series repeat around the clock, so matches recur every day.
 *   Minutes are UTC minutes since 00:00 for A's start; `toMinute` is
 *   `fromMinute` plus the real gap between the two starts, so it can pass 1440
 *   when B starts after midnight.
 * - `dated`: at least one series has fixed session instants; epoch ms.
 */
export type BackToBackMatches =
  | { kind: "daily"; occurrences: { fromMinute: number; toMinute: number }[] }
  | { kind: "dated"; occurrences: { fromStart: number; toStart: number }[] };

export interface BackToBackPair {
  from: Series;
  to: Series;
  matches: BackToBackMatches;
}

export interface BackToBacks {
  /** Every qualifying ordered pair, in input order (by A, then B). */
  pairs: BackToBackPair[];
  /** Series with no race times for the week, or no session length. */
  missingStartTimes: Series[];
}

type Timing =
  | { kind: "daily"; startMinutes: number[]; sessionMinutes: number }
  | { kind: "dated"; starts: number[]; sessionMinutes: number };

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** A time-of-day difference folded into [-12 h, +12 h). */
function signedDayDelta(minutes: number): number {
  return mod(minutes + MINUTES_PER_DAY / 2, MINUTES_PER_DAY) - MINUTES_PER_DAY / 2;
}

function inWindow(gapMinutes: number): boolean {
  return gapMinutes >= -WINDOW_BEFORE_END_MINUTES && gapMinutes <= WINDOW_AFTER_END_MINUTES;
}

function utcMinuteOfDay(ms: number): number {
  return mod(ms, MS_PER_DAY) / MS_PER_MINUTE;
}

function parseClock(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes < MINUTES_PER_DAY ? minutes : null;
}

function toTiming(raceTimes: RaceTimes | undefined): Timing | null {
  if (!raceTimes || raceTimes.sessionMinutes === null) return null;
  const { sessionMinutes } = raceTimes;
  if (raceTimes.kind === "repeating") {
    const first = parseClock(raceTimes.firstSessionTime);
    const repeat = raceTimes.repeatMinutes;
    if (first === null || !(repeat > 0)) return null;
    // The grid runs around the clock, so an earlier slot exists for any
    // first time later than one repeat past midnight.
    const startMinutes: number[] = [];
    for (let m = first % repeat; m < MINUTES_PER_DAY; m += repeat) startMinutes.push(m);
    return { kind: "daily", startMinutes, sessionMinutes };
  }
  const starts = [...new Set(raceTimes.sessionTimes.map((t) => Date.parse(t)))]
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  return starts.length > 0 ? { kind: "dated", starts, sessionMinutes } : null;
}

function matchTimings(a: Timing, b: Timing): BackToBackMatches {
  if (a.kind === "daily" && b.kind === "daily") {
    const occurrences: { fromMinute: number; toMinute: number }[] = [];
    for (const fromMinute of a.startMinutes) {
      const end = fromMinute + a.sessionMinutes;
      for (const bStart of b.startMinutes) {
        const gap = signedDayDelta(bStart - end);
        if (inWindow(gap)) occurrences.push({ fromMinute, toMinute: end + gap });
      }
    }
    return { kind: "daily", occurrences };
  }

  // Start lists are already unique (grids by construction, instants via a
  // Set), so every emitted (A start, B start) is unique too.
  const occurrences: { fromStart: number; toStart: number }[] = [];
  const durationMs = a.sessionMinutes * MS_PER_MINUTE;
  if (a.kind === "dated" && b.kind === "dated") {
    for (const fromStart of a.starts) {
      for (const toStart of b.starts) {
        if (inWindow((toStart - (fromStart + durationMs)) / MS_PER_MINUTE)) {
          occurrences.push({ fromStart, toStart });
        }
      }
    }
  } else if (a.kind === "dated" && b.kind === "daily") {
    // B races every day, so check its grid around each of A's end instants.
    for (const fromStart of a.starts) {
      const end = fromStart + durationMs;
      for (const bStart of b.startMinutes) {
        const gap = signedDayDelta(bStart - utcMinuteOfDay(end));
        if (inWindow(gap)) occurrences.push({ fromStart, toStart: end + gap * MS_PER_MINUTE });
      }
    }
  } else if (a.kind === "daily" && b.kind === "dated") {
    // Find A's grid slots whose end lands in the window before each B instant.
    for (const toStart of b.starts) {
      const idealStart = toStart - durationMs;
      for (const aStart of a.startMinutes) {
        const shift = signedDayDelta(aStart - utcMinuteOfDay(idealStart));
        // A starting `shift` minutes later than ideal leaves a gap of -shift.
        if (inWindow(-shift)) occurrences.push({ fromStart: idealStart + shift * MS_PER_MINUTE, toStart });
      }
    }
  }
  occurrences.sort((x, y) => x.fromStart - y.fromStart || x.toStart - y.toStart);
  return { kind: "dated", occurrences };
}

/**
 * Every ordered back-2-back A → B among `series` for `week` (matched against
 * `scheduleWeeks[].seasonWeek`): B has a start within
 * [A end − 5 min, A end + 15 min], where A end = A start + `sessionMinutes`.
 * Repeating series are compared on time of day, so windows wrap midnight.
 */
export function findBackToBacks(series: Series[], week: number): BackToBacks {
  const timed: { series: Series; timing: Timing }[] = [];
  const missingStartTimes: Series[] = [];
  for (const s of series) {
    const timing = toTiming(s.scheduleWeeks.find((w) => w.seasonWeek === week)?.raceTimes);
    if (timing) timed.push({ series: s, timing });
    else missingStartTimes.push(s);
  }

  const pairs: BackToBackPair[] = [];
  for (const a of timed) {
    for (const b of timed) {
      if (a.series.seriesId === b.series.seriesId) continue;
      const matches = matchTimings(a.timing, b.timing);
      if (matches.occurrences.length > 0) pairs.push({ from: a.series, to: b.series, matches });
    }
  }
  return { pairs, missingStartTimes };
}

export interface FormatBackToBackOptions {
  /** IANA zone to display in; defaults to the runtime's local zone. */
  timeZone?: string;
  /**
   * Instant whose UTC offset is used for daily patterns (DST can shift it
   * week to week); defaults to now.
   */
  referenceDate?: Date;
}

interface LocalParts {
  weekday: string;
  dateKey: string;
  minuteOfDay: number;
}

// Building an Intl.DateTimeFormat costs ~10x formatting with one, and every
// formatted time goes through here, so keep one per zone ("" = runtime local).
const localPartsFormatters = new Map<string, Intl.DateTimeFormat>();

function localPartsFormatter(timeZone: string | undefined): Intl.DateTimeFormat {
  const key = timeZone ?? "";
  let formatter = localPartsFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    localPartsFormatters.set(key, formatter);
  }
  return formatter;
}

function localParts(ms: number, timeZone: string | undefined): LocalParts {
  const parts = localPartsFormatter(timeZone).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    weekday: get("weekday"),
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    minuteOfDay: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
  };
}

/** The zone's UTC offset in minutes at `date` (e.g. +330 for Asia/Kolkata). */
function utcOffsetMinutes(date: Date, timeZone: string | undefined): number {
  const utcMinuteStart = Math.floor(date.getTime() / MS_PER_MINUTE) * MS_PER_MINUTE;
  const local = localParts(utcMinuteStart, timeZone);
  return signedDayDelta(local.minuteOfDay - utcMinuteOfDay(utcMinuteStart));
}

function clock(minutes: number): string {
  const m = mod(minutes, MINUTES_PER_DAY);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function cadenceLabel(minutes: number): string {
  if (minutes === MINUTES_PER_DAY) return "daily";
  if (minutes === 60) return "hourly";
  return minutes % 60 === 0 ? `every ${minutes / 60} h` : `every ${minutes} min`;
}

function formatDaily(
  occurrences: { fromMinute: number; toMinute: number }[],
  offset: number,
): string[] {
  // Occurrences sharing a start-to-start gap are one periodic pattern (period
  // lcm of the two repeats when both divide a day): report its first local
  // occurrence at/after midnight and its cadence.
  const byGap = new Map<number, number[]>();
  for (const o of occurrences) {
    const gap = o.toMinute - o.fromMinute;
    byGap.set(gap, [...(byGap.get(gap) ?? []), mod(o.fromMinute + offset, MINUTES_PER_DAY)]);
  }
  const patterns: { from: number; gap: number; cadence: number }[] = [];
  for (const [gap, starts] of byGap) {
    starts.sort((x, y) => x - y);
    const step = MINUTES_PER_DAY / starts.length;
    const periodic = Number.isInteger(step) && starts.every((m, i) => i === 0 || m - starts[i - 1] === step);
    if (periodic) patterns.push({ from: starts[0], gap, cadence: step });
    else for (const from of starts) patterns.push({ from, gap, cadence: MINUTES_PER_DAY });
  }
  patterns.sort((x, y) => x.from - y.from || x.gap - y.gap);
  return patterns.map(({ from, gap, cadence }) => {
    const hourly = 60 % cadence === 0;
    const show = (m: number) => (hourly ? `:${clock(m).slice(3)}` : clock(m));
    // Minutes past the hour hide whole hours of the gap (":30 → :30" when B
    // starts an hour later), so spell those out. A shorter gap that wraps
    // (":45 → :15") reads naturally as the next hour.
    const extraHours = hourly && gap >= 60 ? ` (+${Math.floor(gap / 60)}h)` : "";
    return `${show(from)} → ${show(from + gap)}${extraHours} · ${cadenceLabel(cadence)}`;
  });
}

/**
 * Concise display lines for a pair's matches in `timeZone`: one line per
 * periodic pattern for daily matches (":30 → :45 · hourly",
 * ":30 → :30 (+1h) · hourly", "01:45 → 03:00 · every 2 h"), or one per A start
 * for dated matches, listing every B start after it ("Sat 19:00 → 20:15, 20:30",
 * with a weekday added whenever a B start falls on a later day than the time
 * before it).
 */
export function formatBackToBackMatches(
  matches: BackToBackMatches,
  { timeZone, referenceDate = new Date() }: FormatBackToBackOptions = {},
): string[] {
  if (matches.kind === "daily") {
    // Daily patterns are shown with the zone's UTC offset at a single instant
    // (callers pass the week's start), so a DST change part-way through the
    // week is approximated: later days display an hour off.
    return formatDaily(matches.occurrences, utcOffsetMinutes(referenceDate, timeZone));
  }
  // Occurrences are sorted by A start, then B start, so each A start's B
  // starts are adjacent and ascending.
  const lines: { fromStart: number; text: string; lastDateKey: string }[] = [];
  for (const { fromStart, toStart } of matches.occurrences) {
    const to = localParts(toStart, timeZone);
    let line = lines.at(-1);
    if (line?.fromStart !== fromStart) {
      const from = localParts(fromStart, timeZone);
      line = { fromStart, text: `${from.weekday} ${clock(from.minuteOfDay)} →`, lastDateKey: from.dateKey };
      lines.push(line);
    } else {
      line.text += ",";
    }
    const toDay = to.dateKey === line.lastDateKey ? "" : `${to.weekday} `;
    line.text += ` ${toDay}${clock(to.minuteOfDay)}`;
    line.lastDateKey = to.dateKey;
  }
  return lines.map((line) => line.text);
}
