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

Static SPA that fetches iRacing schedule data at build time and bundles it as JSON. No backend.

### Data Pipeline (build time)

1. `scripts/fetch-schedule.ts` — Authenticates via iRacing OAuth2 (Password Limited Flow), fetches series/seasons/cars/tracks from the iRacing Data API
2. `scripts/transform.ts` — Normalizes API responses into the app's `Series` type, writes `src/data/season.json`
3. Vite bundles `season.json` into the static site, deployed to GitHub Pages

OAuth2 credentials come from `.env` (see `.env.example`), injected via 1Password CLI (`op run`) locally or GitHub Actions secrets in CI.

### Frontend

- **React 19 + TypeScript** with Vite 7, Tailwind CSS 4, Zustand 5, React Router v7, Motion.js
- Two-page SPA: `/series` (browse/filter series) and `/schedule` (build weekly plan)
- Zustand store (`src/store/useAppStore.ts`) with `persist` middleware — favorites, weekly picks, and filter state survive in localStorage; series data is ephemeral

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

GitHub Actions (`.github/workflows/deploy.yml`): push to main, manual dispatch, or quarterly cron triggers `npm run build:prod` then deploys to GitHub Pages. Base path: `/iracing-weekly-schedule/`.
