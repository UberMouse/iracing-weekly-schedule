import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Configuration,
  SeriesApi,
  CarApi,
  CarclassApi,
  TrackApi,
} from "@iracing-data/api-client-fetch";
import { transformToSeries, type RawDetailedSchedule, type RawSeason } from "./transform";

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
// iRacing requires both client_secret and password to be SHA-256 hashed before sending.
// Each is hashed with its corresponding identifier as salt, then Base64 encoded.
function maskSecret(secret: string, identifier: string): string {
  const normalized = identifier.trim().toLowerCase();
  return createHash("sha256")
    .update(`${secret}${normalized}`, "utf8")
    .digest("base64");
}

const TOKEN_URL = "https://oauth.iracing.com/oauth2/token";

// The @iracing-data/oauth-client only supports authorization-code flow (browser).
// For CI / build-time use we perform iRacing's Password Limited grant directly.
async function authenticate(): Promise<string> {
  console.log("Authenticating with iRacing...");

  const maskedSecret = maskSecret(CLIENT_SECRET, CLIENT_ID);
  const maskedPassword = maskSecret(PASSWORD, USERNAME);

  const body = new URLSearchParams({
    grant_type: "password_limited",
    client_id: CLIENT_ID,
    client_secret: maskedSecret,
    username: USERNAME,
    password: maskedPassword,
    scope: "iracing.auth",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Authentication failed (${res.status}): ${text}`,
    );
  }

  const json = (await res.json()) as { access_token: string };
  console.log("Authenticated successfully.");
  return json.access_token;
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
  const accessToken = await authenticate();

  const config = new Configuration({
    accessToken,
  });

  const seriesApi = new SeriesApi(config);
  const carApi = new CarApi(config);
  const carclassApi = new CarclassApi(config);
  const trackApi = new TrackApi(config);

  console.log("Fetching series...");
  const seriesLink = await seriesApi.getSeries();
  const rawSeries = await fetchLink<unknown[]>(seriesLink);
  console.log(`  Found ${rawSeries.length} series`);

  console.log("Fetching seasons (current)...");
  const seasonsLink = await seriesApi.getSeriesSeasons();
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

  console.log("Fetching track assets...");
  const trackAssetsLink = await trackApi.getTrackAssets();
  const rawTrackAssets = await fetchLink<Record<string, unknown>>(trackAssetsLink);
  console.log(`  Found ${Object.keys(rawTrackAssets).length} track assets`);

  // Fetch detailed schedules per season for session_minutes (covers lap-limited races)
  const typedSeasons = rawSeasons as RawSeason[];
  console.log(`Fetching detailed schedules for ${typedSeasons.length} seasons...`);
  const detailedSchedules = new Map<number, RawDetailedSchedule>();
  const BATCH_SIZE = 10;
  for (let i = 0; i < typedSeasons.length; i += BATCH_SIZE) {
    const batch = typedSeasons.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (season) => {
        try {
          const link = await seriesApi.getSeriesSeasonSchedule({ season_id: season.season_id });
          const data = await fetchLink<RawDetailedSchedule>(link);
          return [season.season_id, data] as const;
        } catch {
          return [season.season_id, null] as const;
        }
      }),
    );
    for (const [seasonId, data] of results) {
      if (data) detailedSchedules.set(seasonId, data);
    }
    if (i + BATCH_SIZE < typedSeasons.length) {
      process.stdout.write(`  ${Math.min(i + BATCH_SIZE, typedSeasons.length)}/${typedSeasons.length}\r`);
    }
  }
  console.log(`  Fetched ${detailedSchedules.size} detailed schedules`);

  console.log("Transforming data...");
  // Cast to our raw types — the API responses match these shapes
  const result = transformToSeries(
    rawSeries as Parameters<typeof transformToSeries>[0],
    rawSeasons as Parameters<typeof transformToSeries>[1],
    rawCars as Parameters<typeof transformToSeries>[2],
    rawCarClasses as Parameters<typeof transformToSeries>[3],
    rawTrackAssets as Parameters<typeof transformToSeries>[4],
    detailedSchedules,
  );
  console.log(`  Produced ${result.series.length} series with schedules`);
  console.log(`  Season start date: ${result.seasonStartDate}`);

  // Write output
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));
  console.log(`Written to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Failed to fetch schedule data:", err);
  process.exit(1);
});
