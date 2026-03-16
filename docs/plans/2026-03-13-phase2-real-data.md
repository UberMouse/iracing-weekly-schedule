# Phase 2: Real iRacing API Data — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace mock data with real iRacing season data fetched at build time via the iRacing Data API.

**Architecture:** A Node.js build-time script authenticates with iRacing's OAuth2 Password Limited Flow using `@iracing-data/oauth-client`, fetches series/season/track/car data via `@iracing-data/api-client-fetch`, transforms it to match our `Series[]` type, and writes `src/data/season.json`. The existing static import in the store stays unchanged.

**Tech Stack:** Node.js, TypeScript, tsx, @iracing-data/api-client-fetch, @iracing-data/oauth-client, dotenv, Vitest

---

## Background: iRacing Data API

### Authentication
- **Flow:** OAuth2 Password Limited (`grant_type=password_limited`)
- **Token endpoint:** `POST https://oauth.iracing.com/oauth2/token`
- **Secret masking:** Both `client_secret` and `password` must be SHA-256 hashed before sending:
  ```ts
  function maskSecret(secret: string, identifier: string): string {
    const normalized = identifier.trim().toLowerCase();
    return crypto.createHash("sha256").update(`${secret}${normalized}`, "utf8").digest("base64");
  }
  ```
  - `client_secret` masked with `client_id` as identifier
  - `password` masked with `username` (email) as identifier
- **Tokens:** Access token lasts 600s (JWT), refresh token is single-use ~1hr

### Two-Step Fetch Pattern
Every `/data` endpoint returns `{ link: string, expires: Date }` — a temporary S3 URL. You must fetch the `link` to get the actual JSON data.

### Key Endpoints
- `GET /data/series/get` → series list
- `GET /data/series/seasons` → season info including schedule
- `GET /data/track/get` → track details
- `GET /data/car/get` → car details
- `GET /data/carclass/get` → car class details (maps car classes → cars)

### Category ID Mapping
- 1 = Oval, 2 = Road (unused — split into 5+6), 3 = Dirt Oval, 4 = Dirt Road, 5 = Sports Car, 6 = Formula

### Packages
- `@iracing-data/api-client-fetch` — Auto-generated fetch API client. Classes: `SeriesApi`, `CarApi`, `CarclassApi`, `TrackApi`, `ConstantsApi`. All methods return `IracingAPIResponse` (the S3 link wrapper).
- `@iracing-data/oauth-client` — OAuth2 client. `OAuthClient` class handles password limited flow, token refresh, secret masking. Uses `InMemoryStore` for state and `DiskStore` for session persistence.

---

## Task 1: Install Dependencies & Environment Setup

**Files:**
- Modify: `package.json`
- Create: `.env.example`

**Step 1: Install packages**

```bash
npm install --save-dev @iracing-data/api-client-fetch @iracing-data/oauth-client tsx dotenv
```

**Step 2: Create `.env.example`**

```env
# iRacing OAuth2 credentials (Password Limited Flow)
# Register at: https://oauth.iracing.com/oauth2/book/client_registration.html
IRACING_CLIENT_ID=
IRACING_CLIENT_SECRET=

# Your iRacing account credentials
IRACING_USERNAME=
IRACING_PASSWORD=
```

**Step 3: Verify `.env` is in `.gitignore`**

Check `.gitignore` includes `.env`. If not, add it.

**Step 4: Commit**

```bash
git add package.json package-lock.json .env.example .gitignore
git commit -m "chore: add iRacing API dependencies and env template"
```

---

## Task 2: Script TypeScript Configuration

**Files:**
- Create: `tsconfig.scripts.json`

The existing `tsconfig.node.json` only includes `vite.config.ts` and uses `noEmit` + `verbatimModuleSyntax`. We need a separate config for scripts that `tsx` can use.

**Step 1: Create `tsconfig.scripts.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "skipLibCheck": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "outDir": "./dist-scripts",
    "rootDir": "./scripts"
  },
  "include": ["scripts"]
}
```

**Step 2: Commit**

```bash
git add tsconfig.scripts.json
git commit -m "chore: add tsconfig for build scripts"
```

---

## Task 3: Transform Function (TDD)

The transform function is the pure logic that maps raw iRacing API responses into our `Series[]` type. Build this test-first.

**Files:**
- Create: `scripts/transform.ts`
- Create: `scripts/__tests__/transform.test.ts`

### Step 1: Write the failing test

The test uses realistic fixture data shaped like the actual iRacing API responses. The transform function takes raw API data (series, seasons, tracks, cars, car classes) and returns `Series[]`.

```ts
// scripts/__tests__/transform.test.ts
import { describe, it, expect } from "vitest";
import { transformToSeries } from "../transform";
import type { Category } from "../../src/types";

// Minimal fixtures matching iRacing API response shapes
const rawSeries = [
  {
    series_id: 230,
    series_name: "GT3 Sprint",
    category_id: 5,
    min_license_level: 8,  // C 4.0 = level 8
    fixed_setup: false,
    allowed_licenses: [
      { group_name: "Class C", min_license_level: 8, max_license_level: 12 },
    ],
  },
  {
    series_id: 100,
    series_name: "Rookie Mazda",
    category_id: 5,
    min_license_level: 1,
    fixed_setup: true,
    allowed_licenses: [
      { group_name: "Rookie", min_license_level: 1, max_license_level: 4 },
    ],
  },
];

const rawSeasons = [
  {
    series_id: 230,
    season_id: 4001,
    season_year: 2026,
    season_quarter: 2,
    car_class_ids: [74],
    schedules: [
      { race_week_num: 0, track: { track_id: 10, track_name: "Spa", config_name: "Grand Prix" } },
      { race_week_num: 1, track: { track_id: 20, track_name: "Monza", config_name: "Grand Prix" } },
    ],
  },
  {
    series_id: 100,
    season_id: 4002,
    season_year: 2026,
    season_quarter: 2,
    car_class_ids: [22],
    schedules: [
      { race_week_num: 0, track: { track_id: 30, track_name: "Laguna Seca" } },
    ],
  },
];

const rawCarClasses = [
  { car_class_id: 74, name: "GT3 Class", cars_in_class: [{ car_id: 50 }, { car_id: 51 }] },
  { car_class_id: 22, name: "Mazda MX-5", cars_in_class: [{ car_id: 60 }] },
];

const rawCars = [
  { car_id: 50, car_name: "BMW M4 GT3" },
  { car_id: 51, car_name: "Porsche 911 GT3 R" },
  { car_id: 60, car_name: "Mazda MX-5 Cup" },
];

describe("transformToSeries", () => {
  const result = transformToSeries(rawSeries, rawSeasons, rawCars, rawCarClasses);

  it("returns one Series per season entry", () => {
    expect(result).toHaveLength(2);
  });

  it("maps series metadata", () => {
    const gt3 = result.find((s) => s.seriesId === 230)!;
    expect(gt3.seriesName).toBe("GT3 Sprint");
    expect(gt3.category).toBe("sports_car" satisfies Category);
    expect(gt3.setupType).toBe("open");
  });

  it("maps license class from min_license_level", () => {
    const gt3 = result.find((s) => s.seriesId === 230)!;
    expect(gt3.licenseClass).toBe("C");

    const rookie = result.find((s) => s.seriesId === 100)!;
    expect(rookie.licenseClass).toBe("R");
  });

  it("maps schedule weeks (1-indexed)", () => {
    const gt3 = result.find((s) => s.seriesId === 230)!;
    expect(gt3.scheduleWeeks).toEqual([
      { weekNumber: 1, trackName: "Spa", trackConfig: "Grand Prix" },
      { weekNumber: 2, trackName: "Monza", trackConfig: "Grand Prix" },
    ]);
  });

  it("resolves cars via car classes", () => {
    const gt3 = result.find((s) => s.seriesId === 230)!;
    expect(gt3.cars).toEqual([
      { carId: 50, carName: "BMW M4 GT3" },
      { carId: 51, carName: "Porsche 911 GT3 R" },
    ]);
  });

  it("detects multiclass when season has multiple car class IDs", () => {
    const gt3 = result.find((s) => s.seriesId === 230)!;
    expect(gt3.isMulticlass).toBe(false);
  });

  it("omits series with no season data", () => {
    const withExtra = [
      ...rawSeries,
      { series_id: 999, series_name: "Ghost Series", category_id: 1, min_license_level: 1, fixed_setup: false, allowed_licenses: [] },
    ];
    const r = transformToSeries(withExtra, rawSeasons, rawCars, rawCarClasses);
    expect(r.find((s) => s.seriesId === 999)).toBeUndefined();
  });
});
```

**Step 2: Run the test to verify it fails**

```bash
npx vitest run scripts/__tests__/transform.test.ts
```

Expected: FAIL — `Cannot find module '../transform'`

**Step 3: Implement the transform function**

```ts
// scripts/transform.ts
import type { Series, Category, LicenseClass } from "../src/types";

// Raw API response types (minimal, matching what we actually use)
export interface RawSeries {
  series_id: number;
  series_name: string;
  category_id: number;
  min_license_level: number;
  fixed_setup: boolean;
  allowed_licenses: { group_name: string; min_license_level: number; max_license_level: number }[];
}

export interface RawSeasonScheduleTrack {
  track_id: number;
  track_name: string;
  config_name?: string;
}

export interface RawSeasonSchedule {
  race_week_num: number;
  track: RawSeasonScheduleTrack;
}

export interface RawSeason {
  series_id: number;
  season_id: number;
  season_year: number;
  season_quarter: number;
  car_class_ids: number[];
  schedules: RawSeasonSchedule[];
}

export interface RawCarClass {
  car_class_id: number;
  name: string;
  cars_in_class: { car_id: number }[];
}

export interface RawCar {
  car_id: number;
  car_name: string;
}

const CATEGORY_MAP: Record<number, Category> = {
  1: "oval",
  2: "sports_car", // "Road" in iRacing — we map to sports_car as default
  3: "dirt_oval",
  4: "dirt_road",
  5: "sports_car",
  6: "formula",
};

function mapLicenseLevel(level: number): LicenseClass {
  if (level >= 16) return "A";    // A 1.0+ = 16+
  if (level >= 12) return "B";    // B 1.0+ = 12+
  if (level >= 8) return "C";     // C 1.0+ = 8+
  if (level >= 4) return "D";     // D 1.0+ = 4+
  return "R";                      // Rookie = 1-3
}

export function transformToSeries(
  rawSeries: RawSeries[],
  rawSeasons: RawSeason[],
  rawCars: RawCar[],
  rawCarClasses: RawCarClass[],
): Series[] {
  const carMap = new Map(rawCars.map((c) => [c.car_id, c]));
  const carClassMap = new Map(rawCarClasses.map((cc) => [cc.car_class_id, cc]));
  const seasonBySeriesId = new Map(rawSeasons.map((s) => [s.series_id, s]));

  return rawSeries
    .filter((s) => seasonBySeriesId.has(s.series_id))
    .map((s) => {
      const season = seasonBySeriesId.get(s.series_id)!;

      // Resolve cars from car classes
      const carIds = new Set(
        season.car_class_ids.flatMap((ccId) => {
          const cc = carClassMap.get(ccId);
          return cc ? cc.cars_in_class.map((c) => c.car_id) : [];
        }),
      );

      const cars = [...carIds]
        .map((id) => carMap.get(id))
        .filter((c): c is RawCar => c !== undefined)
        .map((c) => ({ carId: c.car_id, carName: c.car_name }));

      // Map schedule weeks (API uses 0-indexed, we use 1-indexed)
      const scheduleWeeks = season.schedules
        .slice()
        .sort((a, b) => a.race_week_num - b.race_week_num)
        .map((week) => ({
          weekNumber: week.race_week_num + 1,
          trackName: week.track.track_name,
          ...(week.track.config_name ? { trackConfig: week.track.config_name } : {}),
        }));

      return {
        seriesId: s.series_id,
        seriesName: s.series_name,
        category: CATEGORY_MAP[s.category_id] ?? "sports_car",
        licenseClass: mapLicenseLevel(s.min_license_level),
        setupType: s.fixed_setup ? "fixed" : "open",
        isMulticlass: season.car_class_ids.length > 1,
        cars,
        scheduleWeeks,
      } satisfies Series;
    });
}
```

**Step 4: Run the test to verify it passes**

```bash
npx vitest run scripts/__tests__/transform.test.ts
```

Expected: All 7 tests PASS.

**Step 5: Commit**

```bash
git add scripts/transform.ts scripts/__tests__/transform.test.ts
git commit -m "feat: add transform function mapping iRacing API data to Series type"
```

---

## Task 4: Fetch Script

**Files:**
- Create: `scripts/fetch-schedule.ts`

This is the orchestration script: authenticate, call APIs, transform, write JSON. It uses the `@iracing-data/oauth-client` for auth and `@iracing-data/api-client-fetch` for API calls.

**Step 1: Write the fetch script**

```ts
// scripts/fetch-schedule.ts
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  OAuthClient,
  InMemoryStore,
  type InternalState,
} from "@iracing-data/oauth-client";
import type { IRacingOAuthTokenResponse } from "@iracing-data/oauth-client/dist/client";
import {
  Configuration,
  SeriesApi,
  CarApi,
  CarclassApi,
} from "@iracing-data/api-client-fetch";
import { transformToSeries } from "./transform";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Config ---
const required = (name: string): string => {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
};

const CLIENT_ID = required("IRACING_CLIENT_ID");
const CLIENT_SECRET = required("IRACING_CLIENT_SECRET");
const USERNAME = required("IRACING_USERNAME");
const PASSWORD = required("IRACING_PASSWORD");

const OUTPUT_PATH = resolve(__dirname, "../src/data/season.json");

// --- Auth ---
async function authenticate(): Promise<IRacingOAuthTokenResponse> {
  const stateStore = new InMemoryStore<string, InternalState>();
  const sessionStore = new InMemoryStore<string, IRacingOAuthTokenResponse>();

  const client = new OAuthClient({
    clientMetadata: {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      username: USERNAME,
      password: PASSWORD,
      scopes: ["iracing.auth"],
    },
    stateStore,
    sessionStore,
  });

  console.log("Authenticating with iRacing...");
  const session = await client.passwordLimitedAuthorization();
  console.log("Authenticated successfully.");
  return session;
}

// --- API Helpers ---
// iRacing API returns { link, expires } — must fetch the link for actual data
async function fetchLink<T>(response: { link: string }): Promise<T> {
  const res = await fetch(response.link);
  if (!res.ok) throw new Error(`Failed to fetch data link: ${res.status}`);
  return res.json() as Promise<T>;
}

// --- Main ---
async function main() {
  const session = await authenticate();

  const config = new Configuration({
    accessToken: session.access_token,
  });

  const seriesApi = new SeriesApi(config);
  const carApi = new CarApi(config);
  const carclassApi = new CarclassApi(config);

  console.log("Fetching series...");
  const seriesLink = await seriesApi.getSeries();
  const rawSeries = await fetchLink<unknown[]>(seriesLink);
  console.log(`  Found ${rawSeries.length} series`);

  console.log("Fetching seasons (current)...");
  const seasonsLink = await seriesApi.getSeriesSeasons({});
  const rawSeasons = await fetchLink<unknown[]>(seasonsLink);
  console.log(`  Found ${rawSeasons.length} seasons`);

  console.log("Fetching cars...");
  const carsLink = await carApi.getCar();
  const rawCars = await fetchLink<unknown[]>(carsLink);
  console.log(`  Found ${rawCars.length} cars`);

  console.log("Fetching car classes...");
  const carClassesLink = await carclassApi.getCarClass();
  const rawCarClasses = await fetchLink<unknown[]>(carClassesLink);
  console.log(`  Found ${rawCarClasses.length} car classes`);

  console.log("Transforming data...");
  // Cast to our raw types — the API responses match these shapes
  const series = transformToSeries(
    rawSeries as Parameters<typeof transformToSeries>[0],
    rawSeasons as Parameters<typeof transformToSeries>[1],
    rawCars as Parameters<typeof transformToSeries>[2],
    rawCarClasses as Parameters<typeof transformToSeries>[3],
  );
  console.log(`  Produced ${series.length} series with schedules`);

  // Write output
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(series, null, 2));
  console.log(`Written to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Failed to fetch schedule data:", err);
  process.exit(1);
});
```

**Step 2: Run it (dry check — will fail without credentials, but should compile)**

```bash
npx tsx scripts/fetch-schedule.ts
```

Expected: Fails with "Missing required env var: IRACING_CLIENT_ID" — confirms the script loads and runs.

**Step 3: Commit**

```bash
git add scripts/fetch-schedule.ts
git commit -m "feat: add iRacing API fetch script for build-time data"
```

---

## Task 5: Wire Up Store to Use Real Data

**Files:**
- Modify: `src/store/useAppStore.ts`

Currently imports `../data/mock-schedule.json`. Change to import `../data/season.json` — the script output. Keep mock data as fallback during development (import season.json, fall back to mock if it doesn't exist).

**Step 1: Update the import**

The simplest approach: the fetch script writes `src/data/season.json`. In development without credentials, the mock data is still at `src/data/mock-schedule.json`. We'll make the store try to import `season.json` and keep `mock-schedule.json` as the default.

Since we can't do conditional dynamic imports cleanly for a static build, the best approach is:

- When the fetch script runs, it writes `src/data/season.json`
- Change the store import to `season.json`
- For local dev without credentials, create an npm script that copies mock data to `season.json`

In `src/store/useAppStore.ts`, change line 4:

```diff
-import mockData from "../data/mock-schedule.json";
+import seasonData from "../data/season.json";
```

And line 22:

```diff
-      series: mockData as Series[],
+      series: seasonData as Series[],
```

**Step 2: Create initial `src/data/season.json` from mock data**

Copy `mock-schedule.json` to `season.json` so the app works immediately:

```bash
cp src/data/mock-schedule.json src/data/season.json
```

Add `src/data/season.json` to `.gitignore` — it's a build artifact (generated by the fetch script). Mock data stays in git as the development fallback.

**Step 3: Add dev convenience script to package.json**

```json
"scripts": {
  "fetch-data": "tsx scripts/fetch-schedule.ts",
  "prebuild": "test -f src/data/season.json || cp src/data/mock-schedule.json src/data/season.json",
  "dev": "test -f src/data/season.json || cp src/data/mock-schedule.json src/data/season.json && vite",
  "build": "tsc -b && vite build",
  "build:prod": "tsx scripts/fetch-schedule.ts && tsc -b && vite build"
}
```

- `fetch-data` — manually run the iRacing fetch
- `prebuild` — ensures `season.json` exists before build (uses mock as fallback)
- `dev` — same fallback for dev server
- `build:prod` — full production pipeline: fetch real data → typecheck → build

**Step 4: Run tests to confirm nothing broke**

```bash
npm test
```

Expected: All existing tests pass.

**Step 5: Commit**

```bash
git add src/store/useAppStore.ts .gitignore package.json
git commit -m "feat: wire store to season.json, add fetch-data and build:prod scripts"
```

---

## Task 6: GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

**Step 1: Create the workflow**

```yaml
name: Deploy to GitHub Pages

on:
  workflow_dispatch:
  schedule:
    # Run at the start of each iRacing season (roughly quarterly)
    # Manually adjust or trigger via workflow_dispatch
    - cron: "0 12 1 */3 *"

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Fetch iRacing schedule data
        run: npx tsx scripts/fetch-schedule.ts
        env:
          IRACING_CLIENT_ID: ${{ secrets.IRACING_CLIENT_ID }}
          IRACING_CLIENT_SECRET: ${{ secrets.IRACING_CLIENT_SECRET }}
          IRACING_USERNAME: ${{ secrets.IRACING_USERNAME }}
          IRACING_PASSWORD: ${{ secrets.IRACING_PASSWORD }}

      - run: npm run build

      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

      - id: deployment
        uses: actions/deploy-pages@v4
```

**Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add GitHub Actions workflow for fetch + build + deploy"
```

---

## Task 7: Manual End-to-End Verification

Once you have iRacing OAuth credentials:

**Step 1: Create `.env` with your credentials**

```bash
cp .env.example .env
# Edit .env with your actual credentials
```

**Step 2: Run the fetch script**

```bash
npm run fetch-data
```

Expected: Outputs series count, writes `src/data/season.json` with real data.

**Step 3: Inspect the output**

```bash
head -50 src/data/season.json
```

Verify it matches the `Series[]` shape: `seriesId`, `seriesName`, `category`, `licenseClass`, `setupType`, `isMulticlass`, `cars`, `scheduleWeeks`.

**Step 4: Run the app**

```bash
npm run dev
```

Verify the series browser shows real iRacing series with real track schedules.

**Step 5: Run all tests**

```bash
npm test
```

All tests should pass.

---

## Summary of New/Modified Files

| Action | File | Purpose |
|--------|------|---------|
| Create | `.env.example` | Env var template |
| Create | `tsconfig.scripts.json` | TypeScript config for scripts |
| Create | `scripts/transform.ts` | Pure transform: raw API → Series[] |
| Create | `scripts/__tests__/transform.test.ts` | Tests for transform logic |
| Create | `scripts/fetch-schedule.ts` | Build-time data fetcher |
| Create | `.github/workflows/deploy.yml` | CI/CD pipeline |
| Modify | `package.json` | New deps + scripts |
| Modify | `.gitignore` | Ignore season.json + .env |
| Modify | `src/store/useAppStore.ts` | Import season.json instead of mock |
