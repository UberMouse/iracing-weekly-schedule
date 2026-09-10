import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeSeasonFiles, readSeasonFile, type SeasonFile } from "../season-files";

const season = (overrides: Partial<SeasonFile> = {}): SeasonFile => ({
  seasonId: "2026-S4",
  seasonName: "2026 Season 4",
  seasonStartDate: "2026-09-15T00:00:00.000Z",
  series: [],
  ...overrides,
});

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "seasons-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("writeSeasonFiles with provisional archives", () => {
  it("marks a provisional season in the archive and the switcher list", () => {
    const current = writeSeasonFiles(dir, season({ provisional: true }));

    expect(readSeasonFile(dir, "2026-S4")?.provisional).toBe(true);
    expect(current.availableSeasons).toEqual([
      {
        id: "2026-S4",
        name: "2026 Season 4",
        startDate: "2026-09-15T00:00:00.000Z",
        provisional: true,
      },
    ]);
  });

  it("lets official data replace a provisional import", () => {
    writeSeasonFiles(dir, season({ provisional: true }));
    writeSeasonFiles(dir, season({ seriesIdRemap: { "-42": 612 } }));

    const written = readSeasonFile(dir, "2026-S4");
    expect(written?.provisional).toBeUndefined();
    expect(written?.seriesIdRemap).toEqual({ "-42": 612 });
  });

  it("refuses to overwrite official data with a provisional import", () => {
    // Re-running fetch-prelim after the season has opened would otherwise
    // replace real schedules with scraped ones.
    writeSeasonFiles(dir, season());

    expect(() => writeSeasonFiles(dir, season({ provisional: true }))).toThrow(
      /Refusing to overwrite official 2026-S4 data/,
    );
    expect(readSeasonFile(dir, "2026-S4")?.provisional).toBeUndefined();
  });

  it("leaves other seasons' archives alone", () => {
    writeSeasonFiles(dir, season({ seasonId: "2026-S3", seasonName: "2026 Season 3", seasonStartDate: "2026-06-16T00:00:00.000Z" }));
    const current = writeSeasonFiles(dir, season({ provisional: true }));

    expect(current.availableSeasons.map((s) => s.id)).toEqual(["2026-S3", "2026-S4"]);
    expect(current.currentSeasonId).toBe("2026-S4");
    // The older archive is untouched and still official.
    expect(readSeasonFile(dir, "2026-S3")?.provisional).toBeUndefined();
  });

  it("keeps current-season.json in step with the archive it just wrote", () => {
    writeSeasonFiles(dir, season({ provisional: true }));
    const written = JSON.parse(readFileSync(join(dir, "current-season.json"), "utf8"));
    expect(written.season.provisional).toBe(true);
  });
});
