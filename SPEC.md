# iRacing Weekly Schedule

A static web app for building a personalized iRacing weekly racing schedule. Pick which series to race each week and see your full season plan at a glance.

## Problem

Existing tools for viewing and managing iRacing season schedules are unsatisfying. There's no good way to plan your season week-by-week by selecting which series you'll focus on, filtered to your license and interests.

## Tech Stack

- **Frontend**: React 18+ with TypeScript
- **Build tool**: Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router v6
- **State management**: Zustand with `persist` middleware
- **Hosting**: GitHub Pages
- **Data fetching**: Node.js build-time script (TypeScript)

## Data Source

### iRacing Data API

Schedule data is fetched at build time from the iRacing Data API and bundled as static JSON.

**Authentication**: OAuth 2.0 — Password Limited Flow (designed for scripts and backend processes that don't need user-specific data).

- Legacy email/password auth was retired Dec 9, 2025 (2026 Season 1)
- Register for OAuth client credentials: https://oauth.iracing.com/oauth2/book/client_registration.html
- Full workflow docs: https://oauth.iracing.com/oauth2/book/data_api_workflow.html

**Key API endpoints**:
- `get_series()` — series list with metadata
- Series season schedules — tracks per week
- `get_tracks()` — track details
- `get_cars()` / `get_carclasses()` — car and class info

**Existing tooling**: The npm package `@iracing-data/api` provides TypeScript types and API clients — evaluate for use in the build script.

### Phased Approach

- **Phase 1**: Mock data (`src/data/mock-schedule.json`) matching the real API schema. Build the full UI without an API dependency.
- **Phase 2**: Implement the real fetch script (`scripts/fetch-schedule.ts`) that authenticates and writes `public/data/season.json`.

## Data Model

```typescript
interface Series {
  seriesId: number;
  seriesName: string;
  category: "oval" | "dirt_oval" | "dirt_road" | "road" | "formula";
  licenseClass: "R" | "D" | "C" | "B" | "A";
  setupType: "fixed" | "open";
  isMulticlass: boolean;
  cars: Car[];
  scheduleWeeks: WeekSchedule[];
}

interface Car {
  carId: number;
  carName: string;
}

interface WeekSchedule {
  weekNumber: number;       // 1-12
  trackName: string;
  trackConfig?: string;     // e.g., "Oval", "Road Course"
}

interface UserState {
  favorites: number[];                    // series IDs
  weeklyPicks: Record<number, number[]>;  // weekNumber -> array of series IDs
}
```

## Screens

### Screen 1: Series Browser (`/series`)

Browse, filter, and favorite series.

- **Filter bar** at top:
  - Category pills: oval, dirt oval, dirt road, road, formula
  - License class dropdown: R, D, C, B, A
  - Setup type toggle: fixed / open
  - Text search
  - "Show favorites only" toggle
- **Series cards** in a grid, each showing:
  - Series name
  - Category badge
  - License class
  - Setup type (fixed/open)
  - Car list
  - Multiclass indicator
  - Star/heart icon to toggle favorite

### Screen 2: Weekly Schedule Builder (`/schedule`)

Build your season plan week by week.

- **Horizontal scrollable table**: weeks as columns (1–12), your selected series as rows
- Each cell shows: series name + track name for that week
- **Auto-scrolls to current week** on load and highlights it
- "Add series" button per week — pick from favorites or search all series
- Remove a series from a week
- Multiple series per week allowed

### Shared UI

- Top navigation bar linking to both screens
- Season info header (season name/year)
- Export/Import buttons for schedule data

## State Management

Single Zustand store with `persist` middleware for localStorage sync:

```typescript
interface AppStore {
  // Schedule data (loaded from bundled JSON)
  series: Series[];

  // Favorites (persisted)
  favorites: number[];
  toggleFavorite: (seriesId: number) => void;

  // Weekly picks (persisted)
  weeklyPicks: Record<number, number[]>;
  addWeeklyPick: (week: number, seriesId: number) => void;
  removeWeeklyPick: (week: number, seriesId: number) => void;

  // Filters (not persisted — reset on page load)
  filters: FilterState;
  setFilters: (filters: Partial<FilterState>) => void;

  // Export/Import
  exportData: () => string;   // returns JSON string
  importData: (json: string) => void;
}
```

## Persistence

- **Primary**: localStorage via Zustand `persist` middleware — stores favorites and weekly picks
- **Portability**: Export/import as a JSON file for backup, sharing, or device transfer
- **Season scope**: One season at a time. When a new season starts, rebuild with new data. User can export previous season's schedule before resetting.

## Build Pipeline

1. **Fetch script** (`scripts/fetch-schedule.ts`):
   - Authenticates via OAuth2 Password Limited Flow
   - Fetches series, schedules, tracks, cars from iRacing Data API
   - Writes `public/data/season.json`
2. **Build command**: `node scripts/fetch-schedule.js && vite build`
3. **Credentials**: `.env` file (gitignored) with `IRACING_CLIENT_ID` and `IRACING_CLIENT_SECRET`. A `.env.example` documents required vars.
4. **GitHub Actions** (`deploy.yml`):
   - Triggers: manual dispatch + scheduled (once at season start)
   - Steps: install deps → fetch data → build → deploy to GitHub Pages
   - Secrets: `IRACING_CLIENT_ID` and `IRACING_CLIENT_SECRET` stored in GitHub repo secrets

## Project Structure

```
iracing-weekly-schedule/
├── public/
│   └── data/
│       └── season.json              # Built by fetch script (or mock data)
├── scripts/
│   └── fetch-schedule.ts            # Build-time iRacing API data fetcher
├── src/
│   ├── components/
│   │   ├── SeriesBrowser/           # Series list + filter UI
│   │   ├── ScheduleBuilder/         # Weekly schedule table
│   │   ├── SeriesCard.tsx           # Individual series card
│   │   └── Layout.tsx               # Nav bar, shared layout
│   ├── store/
│   │   └── useAppStore.ts           # Zustand store
│   ├── types/
│   │   └── index.ts                 # TypeScript interfaces
│   ├── data/
│   │   └── mock-schedule.json       # Mock data for Phase 1
│   ├── App.tsx                      # Router setup
│   └── main.tsx                     # Entry point
├── .env.example
├── .github/
│   └── workflows/
│       └── deploy.yml               # GitHub Actions: fetch + build + deploy
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── SPEC.md
```
