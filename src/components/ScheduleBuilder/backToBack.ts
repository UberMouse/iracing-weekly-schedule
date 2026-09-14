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
  /** A's session length for the week (minutes), which sets A's end. */
  sessionMinutes: number;
  matches: BackToBackMatches;
}

export interface BackToBacks {
  /** Every qualifying ordered pair, in input order (by A, then B). */
  pairs: BackToBackPair[];
  /** Series with no race times for the week, or no session length. */
  missingStartTimes: Series[];
}

type Timing =
  | { kind: "daily"; startMinutes: number[]; repeatMinutes: number; sessionMinutes: number }
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
    return { kind: "daily", startMinutes, repeatMinutes: repeat, sessionMinutes };
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
      if (matches.occurrences.length > 0) {
        pairs.push({ from: a.series, to: b.series, sessionMinutes: a.timing.sessionMinutes, matches });
      }
    }
  }
  return { pairs, missingStartTimes };
}

export interface BackToBackLoopVariant {
  /**
   * UTC start minutes of every race in one cycle, in order: the loop's series
   * in turn, lap after lap. The first is the canonical start, in
   * [0, `gridMinutes`); later ones count on from it, so they can pass 1440.
   */
  starts: number[];
  /** Minutes from the first start to the start that begins the next cycle. */
  repeatMinutes: number;
}

export interface BackToBackLoop {
  /** Race order within a lap, starting with the series earliest in the input. */
  series: Series[];
  /** Each series' session length for the week, parallel to `series`. */
  sessionMinutes: number[];
  /**
   * Shift every grid in the loop is invariant under: the lcm of their repeats
   * when that divides a day, else a day.
   */
  gridMinutes: number;
  /** Every distinct cycle, by canonical start. */
  variants: BackToBackLoopVariant[];
}

interface LoopSeries {
  series: Series;
  /** Start minutes on the daily UTC grid, ascending. */
  startMinutes: number[];
  /** `isStart[m]` is 1 when a session starts at UTC minute `m` of the day. */
  isStart: Uint8Array;
  repeatMinutes: number;
  sessionMinutes: number;
}

/** One lap from an S1 start back to the next S1 start. */
interface Lap {
  /** Starts of each series in the lap, from the lap node's own minute. */
  starts: number[];
  /** Node index of the S1 start that ends the lap. */
  to: number;
  minutes: number;
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Absolute start minutes of `to` in the window after `from` starting at `t`. */
function hopStarts(from: LoopSeries, t: number, to: LoopSeries): number[] {
  const end = t + from.sessionMinutes;
  const starts: number[] = [];
  for (let u = end - WINDOW_BEFORE_END_MINUTES; u <= end + WINDOW_AFTER_END_MINUTES; u++) {
    if (to.isStart[mod(u, MINUTES_PER_DAY)]) starts.push(u);
  }
  return starts;
}

/** Every simple cycle of the lap graph for one series order, rotated to its smallest node. */
function loopVariants(order: LoopSeries[], gridMinutes: number): BackToBackLoopVariant[] {
  const [first] = order;
  const nodes = first.startMinutes.filter((m) => m < gridMinutes);
  const nodeAt = new Map(nodes.map((m, i) => [m, i]));
  const laps: Lap[][] = nodes.map((t1) => {
    const out: Lap[] = [];
    const walk = (position: number, starts: number[]) => {
      const next = order[(position + 1) % order.length];
      for (const u of hopStarts(order[position], starts[position], next)) {
        if (position + 1 < order.length) walk(position + 1, [...starts, u]);
        // S1's grid repeats every `gridMinutes`, so its node always exists.
        else out.push({ starts, to: nodeAt.get(mod(u, gridMinutes))!, minutes: u - t1 });
      }
    };
    walk(0, [t1]);
    return out;
  });
  const incoming: number[][] = nodes.map(() => []);
  laps.forEach((out, from) => out.forEach((lap) => incoming[lap.to].push(from)));

  const variants: BackToBackLoopVariant[] = [];
  const record = (cycle: Lap[]) => {
    const starts: number[] = [];
    let lapStart = cycle[0].starts[0];
    for (const lap of cycle) {
      const shift = lapStart - lap.starts[0];
      for (const s of lap.starts) starts.push(s + shift);
      lapStart += lap.minutes;
    }
    const repeatMinutes = lapStart - starts[0];
    // Sessions of 5 min or less could let a lap end before it starts.
    if (repeatMinutes > 0) variants.push({ starts, repeatMinutes });
  };
  // Search cycles through node `s` using only nodes ≥ s, so each is found
  // once, from its smallest node, visiting only nodes that can get back to s.
  for (let s = 0; s < nodes.length; s++) {
    const canReturn = new Uint8Array(nodes.length);
    const queue = [s];
    canReturn[s] = 1;
    while (queue.length > 0) {
      for (const from of incoming[queue.pop()!]) {
        if (from > s && !canReturn[from]) {
          canReturn[from] = 1;
          queue.push(from);
        }
      }
    }
    const onPath = new Uint8Array(nodes.length);
    const path: Lap[] = [];
    const search = (node: number) => {
      onPath[node] = 1;
      for (const lap of laps[node]) {
        if (lap.to === s) {
          record([...path, lap]);
        } else if (lap.to > s && canReturn[lap.to] && !onPath[lap.to]) {
          path.push(lap);
          search(lap.to);
          path.pop();
        }
      }
      onPath[node] = 0;
    };
    search(s);
  }
  return variants;
}

/**
 * Every endless back-2-back loop among `series` for `week`: 2 or 3 distinct
 * series raced in a fixed rotation (each once per lap), every hop qualifying
 * as a back-2-back, repeating forever. Only repeating series with a session
 * length can loop. A loop's order starts with its series earliest in
 * `series`, so rotations of one order are one loop, and a 2-series loop is
 * listed once; a 3-series loop's two directions are separate loops.
 */
export function findBackToBackLoops(series: Series[], week: number): BackToBackLoop[] {
  const eligible: LoopSeries[] = [];
  for (const s of series) {
    if (eligible.some((e) => e.series.seriesId === s.seriesId)) continue;
    const timing = toTiming(s.scheduleWeeks.find((w) => w.seasonWeek === week)?.raceTimes);
    if (timing?.kind !== "daily") continue;
    const isStart = new Uint8Array(MINUTES_PER_DAY);
    for (const m of timing.startMinutes) isStart[m] = 1;
    eligible.push({
      series: s,
      startMinutes: timing.startMinutes,
      isStart,
      repeatMinutes: timing.repeatMinutes,
      sessionMinutes: timing.sessionMinutes,
    });
  }

  // Tuples needing a hop no start of the first series can make can't loop.
  const hasHop = eligible.map((from) =>
    eligible.map((to) => from !== to && from.startMinutes.some((t) => hopStarts(from, t, to).length > 0)),
  );
  const orders: number[][] = [];
  const n = eligible.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      orders.push([i, j]);
      // Canonical 3-series orders: both directions around i, j, k.
      for (let k = j + 1; k < n; k++) orders.push([i, j, k], [i, k, j]);
    }
  }
  // Keep 2-series loops before 3-series ones, each by input order.
  orders.sort((a, b) => a.length - b.length);

  const loops: BackToBackLoop[] = [];
  for (const indices of orders) {
    if (!indices.every((from, p) => hasHop[from][indices[(p + 1) % indices.length]])) continue;
    const order = indices.map((i) => eligible[i]);
    const lcm = order.reduce((l, s) => (l / gcd(l, s.repeatMinutes)) * s.repeatMinutes, 1);
    const gridMinutes = MINUTES_PER_DAY % lcm === 0 ? lcm : MINUTES_PER_DAY;
    const variants = loopVariants(order, gridMinutes);
    // Cycles come out by smallest node, so already by canonical start.
    if (variants.length > 0) {
      loops.push({
        series: order.map((s) => s.series),
        sessionMinutes: order.map((s) => s.sessionMinutes),
        gridMinutes,
        variants,
      });
    }
  }
  return loops;
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

/** "(N min gap)" when B starts at/after A's end, "(N min overlap)" before it. */
function gapLabel(minutesAfterEnd: number): string {
  return minutesAfterEnd >= 0 ? `(${minutesAfterEnd} min gap)` : `(${-minutesAfterEnd} min overlap)`;
}

function formatDaily(
  occurrences: { fromMinute: number; toMinute: number }[],
  sessionMinutes: number,
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
    // Minutes past the hour hide whole hours of an offset from A's start
    // (":30 → :30" when B starts an hour later), so spell those out. A shorter
    // offset that wraps (":45 → :15") reads naturally as the next hour.
    const show = (minutesAfterStart: number) => {
      const time = clock(from + minutesAfterStart);
      if (!hourly) return time;
      const extraHours = minutesAfterStart >= 60 ? ` (+${Math.floor(minutesAfterStart / 60)}h)` : "";
      return `:${time.slice(3)}${extraHours}`;
    };
    // Within a pattern A's length is fixed, so the gap to B is too.
    const minutesAfterEnd = gap - sessionMinutes;
    return `${show(0)} → ends ${show(sessionMinutes)} → ${show(gap)} ${gapLabel(minutesAfterEnd)} · ${cadenceLabel(cadence)}`;
  });
}

/**
 * Concise display lines for a pair's matches in `timeZone`, where
 * `sessionMinutes` is A's session length (`BackToBackPair.sessionMinutes`).
 * Each line reads A start → A end → B start(s), every B start followed by its
 * minutes of gap (or overlap) against A's end. Daily matches get one line per
 * periodic pattern (":15 → ends :35 → :45 (10 min gap) · hourly",
 * ":30 → ends :23 → :30 (+1h) (7 min gap) · hourly",
 * "01:45 → ends 02:50 → 03:00 (10 min gap) · every 2 h"); dated matches one per
 * A start, listing every B start after it
 * ("Sat 19:00 → ends 20:10 → 20:15 (5 min gap), 20:25 (15 min gap)"), with a
 * weekday added whenever a time falls on a different day than the time before it.
 */
export function formatBackToBackMatches(
  matches: BackToBackMatches,
  sessionMinutes: number,
  { timeZone, referenceDate = new Date() }: FormatBackToBackOptions = {},
): string[] {
  if (matches.kind === "daily") {
    // Daily patterns are shown with the zone's UTC offset at a single instant
    // (callers pass the week's start), so a DST change part-way through the
    // week is approximated: later days display an hour off.
    return formatDaily(matches.occurrences, sessionMinutes, utcOffsetMinutes(referenceDate, timeZone));
  }
  const durationMs = sessionMinutes * MS_PER_MINUTE;
  // Occurrences are sorted by A start, then B start, so each A start's B
  // starts are adjacent and ascending.
  const lines: { fromStart: number; text: string; lastDateKey: string }[] = [];
  const dayPrefix = (parts: LocalParts, previousDateKey: string) =>
    parts.dateKey === previousDateKey ? "" : `${parts.weekday} `;
  for (const { fromStart, toStart } of matches.occurrences) {
    let line = lines.at(-1);
    if (line?.fromStart !== fromStart) {
      const from = localParts(fromStart, timeZone);
      const end = localParts(fromStart + durationMs, timeZone);
      line = {
        fromStart,
        text: `${from.weekday} ${clock(from.minuteOfDay)} → ends ${dayPrefix(end, from.dateKey)}${clock(end.minuteOfDay)} →`,
        lastDateKey: end.dateKey,
      };
      lines.push(line);
    } else {
      line.text += ",";
    }
    const to = localParts(toStart, timeZone);
    const minutesAfterEnd = (toStart - fromStart - durationMs) / MS_PER_MINUTE;
    line.text += ` ${dayPrefix(to, line.lastDateKey)}${clock(to.minuteOfDay)} ${gapLabel(minutesAfterEnd)}`;
    line.lastDateKey = to.dateKey;
  }
  return lines.map((line) => line.text);
}

/** "every 30 min", "every 1 h", "every 1 h 30 min". */
function periodLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `every ${[hours > 0 ? `${hours} h` : "", rest > 0 ? `${rest} min` : ""].filter(Boolean).join(" ")}`;
}

/**
 * One display line per loop variant in `timeZone`, each one full cycle as a
 * chain of start → end → next start (with its gap or overlap) back to the
 * first series' start, then the period:
 * ":15 → ends :35 → :45 (10 min gap) → ends :16 (+1h) → :15 (+1h) (1 min overlap) · repeats every 1 h".
 * Loops whose grids repeat within the hour read in minutes past the hour,
 * with whole hours since the chain's first time spelled out; longer ones in
 * local HH:MM from the first occurrence at/after local midnight. A multi-lap
 * cycle starts at the lap that comes first locally. Lines are by local start.
 */
export function formatBackToBackLoop(
  loop: BackToBackLoop,
  { timeZone, referenceDate = new Date() }: FormatBackToBackOptions = {},
): string[] {
  // Like daily pair patterns, shown with the offset at a single instant.
  const offset = utcOffsetMinutes(referenceDate, timeZone);
  const { gridMinutes, sessionMinutes } = loop;
  const perLap = loop.series.length;
  const hourly = 60 % gridMinutes === 0;
  const lines = loop.variants.map(({ starts, repeatMinutes }) => {
    let firstLap = 0;
    for (let i = perLap; i < starts.length; i += perLap) {
      if (mod(starts[i] + offset, gridMinutes) < mod(starts[firstLap] + offset, gridMinutes)) firstLap = i;
    }
    const chain = [...starts.slice(firstLap), ...starts.slice(0, firstLap).map((m) => m + repeatMinutes)];
    const from = mod(chain[0] + offset, gridMinutes);
    const show = (minutesAfterStart: number) => {
      const time = clock(from + minutesAfterStart);
      if (!hourly) return time;
      const extraHours = minutesAfterStart >= 60 ? ` (+${Math.floor(minutesAfterStart / 60)}h)` : "";
      return `:${time.slice(3)}${extraHours}`;
    };
    const parts: string[] = [];
    let previousEnd = 0;
    chain.forEach((start, i) => {
      // `firstLap` is a whole number of laps, so series still cycle from the first.
      const end = start + sessionMinutes[i % perLap];
      parts.push(i === 0 ? show(0) : `${show(start - chain[0])} ${gapLabel(start - previousEnd)}`);
      parts.push(`ends ${show(end - chain[0])}`);
      previousEnd = end;
    });
    parts.push(`${show(repeatMinutes)} ${gapLabel(chain[0] + repeatMinutes - previousEnd)}`);
    return { from, text: `${parts.join(" → ")} · repeats ${periodLabel(repeatMinutes)}` };
  });
  lines.sort((a, b) => a.from - b.from);
  return lines.map((line) => line.text);
}
