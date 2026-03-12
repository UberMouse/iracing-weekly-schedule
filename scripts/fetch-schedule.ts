import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Configuration,
  SeriesApi,
  CarApi,
  CarclassApi,
} from "@iracing-data/api-client-fetch";
import { DEFAULT_TOKEN_URL } from "@iracing-data/oauth-client";
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
// The @iracing-data/oauth-client only supports authorization-code flow (browser).
// For CI / build-time use we perform an OAuth2 Resource Owner Password Credentials
// grant directly against the iRacing token endpoint.
async function authenticate(): Promise<string> {
  console.log("Authenticating with iRacing...");

  const body = new URLSearchParams({
    grant_type: "password",
    username: USERNAME,
    password: PASSWORD,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "iracing.auth",
  });

  const res = await fetch(DEFAULT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
