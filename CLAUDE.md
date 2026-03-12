# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Vite dev server
- `npm run build` — TypeScript type-check (`tsc -b`) then Vite production build to `/dist`
- `npm run lint` — ESLint
- `npm run test` — run all tests once with Vitest
- `npm run test:watch` — Vitest in watch mode
- To run a single test: `npx vitest run src/components/__tests__/SeriesCard.test.tsx`

## Architecture

React 19 + TypeScript app for planning iRacing weekly racing schedules. Uses Vite, Tailwind CSS v4, React Router v7, and Zustand for state.

### Data flow

Mock JSON (`src/data/mock-schedule.json`) → Zustand store → React components. Phase 2 will replace mock data with a build-time fetch script (`scripts/fetch-schedule.ts`) that writes `public/data/season.json` from the iRacing Data API.

### State management

Single Zustand store (`src/store/useAppStore.ts`) with `persist` middleware (localStorage key: `iracing-schedule-storage`). Persisted: `favorites` (series IDs) and `weeklyPicks` (week → series ID array). Not persisted: `series` data and `filters`.

### Two main screens

- **SeriesBrowser** (`/series`) — browse, filter, and favorite series. Filtering done via `useMemo` in the component.
- **ScheduleBuilder** (`/schedule`) — 12-week grid where users assign series to weeks via AddSeriesModal.

### Component organization

Components are grouped by feature in `src/components/SeriesBrowser/` and `src/components/ScheduleBuilder/` with barrel exports via `index.ts`. Shared components (`SeriesCard`, `Layout`, `ExportImport`) live directly in `src/components/`. Tests are colocated in `__tests__/` subdirectories.

## Key conventions

- **Categories**: `"oval" | "dirt_oval" | "dirt_road" | "sports_car" | "formula"` — note: SPEC.md says "road" but the actual codebase uses "sports_car" + "formula" as the split.
- **Styling**: Tailwind utility classes + CSS custom properties defined in `src/index.css` `@theme` block. Dark theme with category colors (`--color-cat-*`) and license class colors (`--color-lic-*`). Uses `color-mix()` for tinted backgrounds.
- **Animations**: `motion/react` (Framer Motion v12) for page transitions, hover effects, and interactions.
- **Fonts**: Barlow Condensed (display), Outfit (body), JetBrains Mono (mono) — loaded from Google Fonts in `index.html`.
- **TypeScript**: Strict mode with `noUnusedLocals` and `noUnusedParameters` enabled.
- **Testing**: Vitest with `@testing-library/react`. Setup file: `src/test-setup.ts`. Tests use jsdom environment (configured in `vite.config.ts`).
