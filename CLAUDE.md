# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server with HMR
npm run build        # tsc + vite build (local, no data fetch)
npm run build:prod   # fetch-data + tsc + vite build (CI/production)
npm run fetch-data   # Fetch iRacing API data via 1Password (op run), can be run anytime and credentials will be injected
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

### Frontend

- **React 19 + TypeScript** with Vite 7, Tailwind CSS 4, Zustand 5, React Router v7, Motion.js
- Two-page SPA: `/series` (browse/filter the current season) and `/schedule` (build/view weekly plan, with a season switcher)
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
- **SeriesCard** — Series metadata, cars, schedule weeks with track info
- **AddSeriesModal** — Modal for picking series into a specific week

### Transform Logic

The transform (`scripts/transform.ts`) handles several non-obvious mappings:
- iRacing category IDs → internal categories (road is split into `sports_car` + `formula`)
- License extraction from `allowed_licenses` array (primary range, not crossover)
- Season week calculation (1-12) from schedule `start_date` relative to season start
- Per-week car detection for car-rotation series (e.g., Ring Meister)
- Race time from detailed schedule `race_time_descriptors` including `session_minutes`

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`): push to main, manual dispatch, or quarterly cron runs `npm run build` (no data fetch) then deploys committed files (including `public/seasons/`) to GitHub Pages. Base path: `/iracing-weekly-schedule/`. To publish a new season: run `npm run fetch-data` locally, commit the new `public/seasons/` files, and push.
