# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server with HMR
npm run build        # tsc + vite build (local, no data fetch)
npm run build:prod   # fetch-data + tsc + vite build (local; CI runs plain `build`)
npm run fetch-data   # Fetch iRacing API data via 1Password (op run), can be run anytime and credentials will be injected
npm run fetch-prelim -- <pdf-url-or-path>   # Build next season from iRacing's preliminary schedule PDF (add --dry-run to preview)
npm run fetch-track-categories   # Refresh data/track-categories.json from the Data API (also done by fetch-data/fetch-prelim)
npm run test         # Vitest single run
npm run test:watch   # Vitest watch mode
npm run lint         # ESLint (flat config)
npm run preview      # Preview production build
```

Run a single test file: `npx vitest run src/components/__tests__/SeriesCard.test.tsx`

## Architecture

Static SPA that fetches iRacing schedule data and serves it as static JSON blobs from `public/seasons/`. No backend.

### Data Pipeline (fetch time — run locally, committed)

1. `scripts/fetch-schedule.ts` — Authenticates via iRacing OAuth2 (Password Limited Flow), fetches series/seasons/cars/tracks from the iRacing Data API
2. `scripts/transform.ts` — Normalizes API responses into the app's `Series` type; derives `seasonId`/`seasonName` (`<year>-S<quarter>`) from the season's year/quarter
3. `scripts/season-files.ts` (`writeSeasonFiles`) — writes the per-season archive `public/seasons/<id>.json` (immutable; never overwrites prior seasons) and rebuilds `public/seasons/current-season.json` (`{ currentSeasonId, availableSeasons, season }`) by scanning the directory

`npm run fetch-data` / `build:prod` are run **locally** (creds injected via 1Password `op run`); the resulting `public/seasons/` files are **committed to git**, which is what keeps past-season archives durable. CI only builds and deploys committed data (it does not fetch).

### Preliminary (pre-season) pipeline

iRacing publishes the next season's schedule as a PDF about a week before the Data API switches over. `npm run fetch-prelim -- <pdf-url-or-path>` turns that PDF into the same `Series[]` so the new season is pickable during the gap:

1. `scripts/pdf-schedule.ts` — segments the PDF by geometry (headings at x=56, series blocks at x=58, race-week columns at x=58/158/358/518). Returns names verbatim.
2. `scripts/prelim-transform.ts` — resolves those names to real iRacing ids. **Only schedules are season-gated**: cars, tracks and track assets are fetched live and resolve ~100%. Series ids come from matching against committed archives plus the live series catalogue (Sørensen–Dice over name tokens, hard-constrained by category + licence, greedy and 1:1 so sibling series can't share an id). Unmatched series get a deterministic **negative** synthetic id.
3. Output is written by `writeSeasonFiles` flagged `provisional: true`, and committed like any other season data.

Things the PDF does not state, and where they come from:
- **Setup type** — never printed; inherited from the matched series (stable across every archived season boundary), else inferred from a "Fixed" in the title.
- **Race duration** — only given for time-limited races ("40 mins"); lap- and heat-limited ones inherit the matched series' duration so sprint/endurance classification survives.
- **Multiclass** — derived from "Grid by class" in the conditions column.
- **Category for the trailing "UNRANKED" section** — inherited from the match (iRacing files those under `oval`).
- **Race start times** — only for interval wordings ("Races every 2 hours at :15 past"), parsed by `parseRaceSchedule` into a `raceTimes: { kind: "repeating" }` on every week; day-specific wordings (naming a weekday, or "GMT") are out of scope and leave `raceTimes` unset. `sessionMinutes` is the week's time-limited race length + 15 (approximating iRacing's whole-event duration), else the matched prior series' `raceTimeMinutes`, else `null`.

**Cutover:** when `npm run fetch-data` later finds a provisional archive for the same season, it writes a `seriesIdRemap` (provisional id → official id) into the new season file. The store replays it **once** per season (tracked in `appliedSeriesRemaps`) so picks and favourites survive. Picks are remapped in full; favourites only for negative ids, since a real id there may predate the import. `writeSeasonFiles` refuses to overwrite official data with provisional data.

### Track usage

- `data/track-categories.json` — a committed catalogue mapping every track *layout* id (config) to its surface (`"road" | "oval" | "dirt_road" | "dirt_oval"`) and a `free` flag, sourced from the Data API's `/data/track/get` (its per-layout `category` and `free_with_subscription` fields). Deliberately outside `public/seasons/`, which is scanned as season archives. `npm run fetch-data`, `fetch-prelim` and the standalone `fetch-track-categories` all refresh it by **merging** (`scripts/track-categories.ts`) — fresh data wins on id conflicts (so `free` picks up any change), but an id only the catalogue still knows about (a layout the live API no longer lists) is never dropped, since old archives still reference it — such a legacy entry may predate the `free` field entirely.
- `track-usage.json` — generated at build time only (never committed) by a Vite plugin in `vite.config.ts`, from `scripts/track-usage.ts`'s `buildTrackUsageFile`: every committed `public/seasons/*.json` archive (chronological, provisional flag carried through) plus the category catalogue, grouped by `trackName.trim()`, counted in series-weeks and split by layout category. A layout id missing from the catalogue is counted under `"unknown"` and logged as a warning rather than failing the build. Each track also carries `free: boolean` — true only if every layout id it was ever scheduled on is catalogued and marked free, so one paid or uncatalogued layout makes the whole track non-free; this reflects the track's *current* free status applied to every season shown, including past ones. Served by `vite build` (emitted asset) and by `npm run dev` (a `configureServer` middleware recomputes it per request). Type: `TrackUsageFile` in `src/types/track-usage.ts`.

### Frontend

- **React 19 + TypeScript** with Vite 7, Tailwind CSS 4, Zustand 5, React Router v7, Motion.js
- SPA routes: `/series` (browse/filter the current season), `/schedule` (build/view weekly plan, with a season switcher), `/tracks` (per-season track usage table) and `/about`
- Season data is fetched at runtime: `useAppStore.loadSeasons()` fetches `current-season.json` (cache-busted with `?v=__BUILD_VERSION__`); past seasons are lazy-fetched per `<id>.json` when selected in the switcher. The app shows a loading gate until the current season resolves.
- Zustand store (`src/store/useAppStore.ts`) with `persist` middleware — favorites, **per-season** picks (`seasonPicks` keyed by season id), and filter state survive in localStorage; fetched season data is ephemeral. A `migrate` (v0→v1) folds legacy flat picks into `seasonPicks["2026-S2"]`. Past seasons render read-only; only the current season is editable.

### Key Domain Types (`src/types/index.ts`)

- **Category**: `"oval" | "dirt_oval" | "dirt_road" | "sports_car" | "formula"` (iRacing category IDs 1-6 mapped in transform)
- **LicenseClass**: `"R" | "D" | "C" | "B" | "A"`
- **SetupType**: `"fixed" | "open"`
- **EventType**: `"sprint" | "endurance" | "special"` (derived from race time + isRepeating)

### Component Layout

- **Layout** — Sticky nav, page transitions, export/import controls
- **SeriesBrowser** — Filterable grid of SeriesCards (category, license, setup, search, favorites-only)
- **ScheduleBuilder** — 12 WeekRows; each shows picked series for that week with add/remove
- **WeekRow back-2-backs** — with ≥ 2 picks + maybes in a week, a collapsed "Back-2-backs (N) · Loops (M)" expander (also on read-only seasons) first lists **Loops** — endless back-2-back cycles of 2–3 repeating series in a strict rotation, each raced once per lap, one entry per series order (rotations deduped; a 3-series loop's two directions are separate; the heading shows every series' session length) with its distinct cycles as chains ending back at the first start plus "repeats every <cycle>" and, when the loop can be joined more often, "starts every <P>" (P = lcm of the repeats). Scheduled series, and repeating ones whose repeat doesn't divide 1440, are excluded from loops (they still appear in pairs). The cycle search has a per-series-order step budget; when it runs out the found loops are still listed under a "Too many loops to list — showing the first ones found" note — then **Pairs**: ordered pairs A → B where some B start lies in [A end − 5 min, A end + 15 min], A end = start + the week's `raceTimes.sessionMinutes` (the whole event); repeating series compare on UTC time of day (wrapping midnight), scheduled ones on instants. Times show in the viewer's zone (repeating pairs as one line per cadence pattern); each heading shows A's session length (`~N min` with an "estimated" tooltip on provisional seasons) and each line reads A start → A end → B start(s), each B start with its minutes of gap/overlap against A's end; series lacking `raceTimes`/`sessionMinutes` are listed as "No start times". Pure logic in `ScheduleBuilder/backToBack.ts`
- **SeriesCard** — Series metadata, cars, schedule weeks with track info
- **AddSeriesModal** — Modal for picking series into a specific week
- **TrackUsage** (`/tracks`) — Table of per-season track appearance counts (series-weeks) fetched from `track-usage.json`, filterable by track type (all/road/oval/dirt road/dirt oval) and by a "Hide free tracks" toggle (ANDed with the type filter, off by default, local component state) that drops tracks marked `free` and shows a "Free" badge beside the name of any that remain. Each season column and Total is a sort button (`aria-sort` on the active header): a new column sorts descending, re-clicking flips direction, ties always break by total descending then name; defaults to Total descending and isn't persisted. Pure sort/filter/aggregate logic (including the hide-free rule) lives in `TrackUsage/aggregate.ts`
- **StatusMessage** — Shared `LoadingState` / `ErrorState` (with retry), full-screen for the app's load gate or inline for pages
- **FilterPill** — Shared colour-tinted toggle pill (`aria-pressed`) used by FilterBar's category filter and the TrackUsage type filter

### Transform Logic

The transform (`scripts/transform.ts`) handles several non-obvious mappings:
- iRacing category IDs → internal categories (road is split into `sports_car` + `formula`)
- License extraction from `allowed_licenses` array (primary range, not crossover)
- Season week calculation (1-12) from schedule `start_date` relative to season start
- Per-week car detection for car-rotation series (e.g., Ring Meister)
- Race time from detailed schedule `race_time_descriptors` including `session_minutes`

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`): push to main, manual dispatch, or quarterly cron runs `npm run build` (no data fetch, no credentials) then deploys committed files (including `public/seasons/`) plus the build-generated `track-usage.json` to GitHub Pages. Base path: `/iracing-weekly-schedule/`. To publish a new season: run `npm run fetch-data` locally, commit the new `public/seasons/` files and any `data/track-categories.json` changes, and push.
