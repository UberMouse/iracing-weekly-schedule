import { describe, it, expect } from "vitest";
import { parseSchedulePdf, type PdfPage, type PdfTextItem } from "../pdf-schedule";

// The real PDF places every run at a fixed x: 56 for section headings, 58 for
// series header blocks, and 58/158/358/518 for a race week's four columns.
const HEADING_X = 56;
const SERIES_X = 58;
const COL_WEEK = 58;
const COL_DETAIL = 158;
const COL_CONDITIONS = 358;
const COL_LENGTH = 518;

const HEADING_HEIGHT = 14;
const TABLE_HEIGHT = 9;

let baseline = 700;
const run = (str: string, x: number, height: number, y?: number): PdfTextItem => ({
  str,
  x,
  y: y ?? baseline,
  height,
  fontName: height >= 12 ? "g_d0_f1" : "g_d0_f3",
});

const heading = (str: string) => run(str, HEADING_X, HEADING_HEIGHT, (baseline -= 14));
const seriesLine = (str: string) => run(str, SERIES_X, HEADING_HEIGHT, (baseline -= 14));

/** One race-week row: week label, detail lines, conditions and race length. */
function weekRow(
  label: string,
  detail: string[],
  conditions: string,
  length: string,
): PdfTextItem[] {
  const top = (baseline -= 10);
  const items = [
    run(label, COL_WEEK, TABLE_HEIGHT, top),
    run(conditions, COL_CONDITIONS, TABLE_HEIGHT, top),
    run(length, COL_LENGTH, TABLE_HEIGHT, top),
  ];
  detail.forEach((line, index) => {
    items.push(run(line, COL_DETAIL, TABLE_HEIGHT, index === 0 ? top : (baseline -= 10)));
  });
  return items;
}

function page(pageNumber: number, items: PdfTextItem[]): PdfPage {
  return {
    pageNumber,
    // Every page carries its number in the footer, in the heading face.
    items: [...items, run(String(pageNumber), 299, 12, 18)],
  };
}

function build(fn: () => PdfTextItem[]): PdfPage[] {
  baseline = 700;
  return [page(6, fn())];
}

describe("parseSchedulePdf", () => {
  it("reads category, licence and schedule from the section headings", () => {
    const pages = build(() => [
      heading("OVAL"),
      heading("R Class Series (OVAL)"),
      seriesLine("Mini Stock Rookie Series - 2026 Season 4"),
      seriesLine("Mini Stock"),
      seriesLine("Rookie (1.0) --> Pro/WC (4.0)"),
      seriesLine("Races every 30 minutes at :15 and :45"),
      ...weekRow(
        "Week 1 (2026-09-15)",
        ["Charlotte Motor Speedway - Oval", "(2026-09-19 13:40 1x)"],
        "84F/29C, Rain chance None, Rolling start",
        "15 laps",
      ),
    ]);

    const [series] = parseSchedulePdf(pages);
    expect(series.seriesName).toBe("Mini Stock Rookie Series - 2026 Season 4");
    expect(series.category).toBe("oval");
    expect(series.licenseClass).toBe("R");
    expect(series.carLines).toEqual(["Mini Stock"]);
    expect(series.isCarRotation).toBe(false);
    expect(series.racesDescription).toBe("Races every 30 minutes at :15 and :45");
    expect(series.weeks).toHaveLength(1);
    expect(series.weeks[0]).toMatchObject({
      weekNumber: 1,
      startDate: "2026-09-15",
      raceLength: "15 laps",
    });
  });

  it("keeps every detail line so wrapped track names survive", () => {
    const pages = build(() => [
      heading("SPORTS CAR"),
      heading("B Class Series (SPORTS CAR)"),
      seriesLine("IMSA Endurance Series - 2026 Season 4"),
      seriesLine("Dallara P217"),
      seriesLine("Class C (4.0) --> Pro/WC (4.0), Team racing"),
      ...weekRow(
        "Week 4 (2026-10-31)",
        ["Circuit des 24 Heures du Mans - 24 Heures du", "Mans", "(2026-10-31 14:50 1x)"],
        "72F/22C, Rain chance None, Grid by class",
        "160 mins",
      ),
    ]);

    const [series] = parseSchedulePdf(pages);
    expect(series.weeks[0].detailLines).toEqual([
      "Circuit des 24 Heures du Mans - 24 Heures du",
      "Mans",
      "(2026-10-31 14:50 1x)",
    ]);
  });

  it("marks car-rotation series and drops the notice from the car list", () => {
    const pages = build(() => [
      heading("SPORTS CAR"),
      heading("C Class Series (SPORTS CAR)"),
      seriesLine("Ring Meister - 2026 Season 4"),
      seriesLine("See race week for cars in use that week."),
      seriesLine("Class D (4.0) --> Pro/WC (4.0)"),
      ...weekRow(
        "Week 1 (2026-09-15)",
        ["Nurburgring Nordschleife - Industriefahrten", "Caterham 420R", "(2026-09-19 13:45 1x)"],
        "65F/19C, Rain chance None",
        "3 laps",
      ),
    ]);

    const [series] = parseSchedulePdf(pages);
    expect(series.isCarRotation).toBe(true);
    expect(series.carLines).toEqual([]);
  });

  it("leaves the category null for sections it does not recognise", () => {
    // The PDF ends with an "UNRANKED" section; inheriting the previous
    // category would file those series under dirt road.
    const pages = build(() => [
      heading("DIRT ROAD"),
      heading("B Class Series (DIRT ROAD)"),
      seriesLine("Rallycross Series - 2026 Season 4"),
      seriesLine("VW Beetle"),
      seriesLine("Class B (4.0) --> Pro/WC (4.0)"),
      ...weekRow("Week 1 (2026-09-15)", ["Daytona", "(2026-09-19 12:00 1x)"], "None", "8 laps"),
      heading("UNRANKED"),
      heading("R Class Series (UNRANKED)"),
      seriesLine("NASCAR Pickup Cup - 2026 Season 4"),
      seriesLine("NASCAR Truck"),
      seriesLine("Rookie (1.0) --> Pro/WC (4.0)"),
      ...weekRow("Week 1 (2026-09-15)", ["Bristol", "(2026-09-19 12:00 1x)"], "None", "40 laps"),
    ]);

    const parsed = parseSchedulePdf(pages);
    expect(parsed.map((s) => [s.seriesName, s.category, s.licenseClass])).toEqual([
      ["Rallycross Series - 2026 Season 4", "dirt_road", "B"],
      ["NASCAR Pickup Cup - 2026 Season 4", null, "R"],
    ]);
  });

  it("ignores the table of contents and page-number footers", () => {
    baseline = 700;
    const toc = page(1, [heading("OVAL"), seriesLine("Some Series - 2026 Season 4 . . . 6")]);
    baseline = 700;
    const content = page(6, [
      heading("OVAL"),
      heading("R Class Series (OVAL)"),
      seriesLine("Real Series - 2026 Season 4"),
      seriesLine("Mini Stock"),
      seriesLine("Rookie (1.0) --> Pro/WC (4.0)"),
      ...weekRow("Week 1 (2026-09-15)", ["Bristol", "(2026-09-19 12:00 1x)"], "None", "40 laps"),
    ]);

    const parsed = parseSchedulePdf([toc, content]);
    expect(parsed.map((s) => s.seriesName)).toEqual(["Real Series - 2026 Season 4"]);
  });

  it("continues a series whose weeks run onto the next page", () => {
    baseline = 700;
    const first = page(6, [
      heading("OVAL"),
      heading("C Class Series (OVAL)"),
      seriesLine("Long Series - 2026 Season 4"),
      seriesLine("Late Model"),
      seriesLine("Class C (4.0) --> Pro/WC (4.0)"),
      ...weekRow("Week 1 (2026-09-15)", ["Bristol", "(2026-09-19 12:00 1x)"], "None", "40 laps"),
    ]);
    baseline = 700;
    const second = page(7, [
      ...weekRow("Week 2 (2026-09-22)", ["Martinsville", "(2026-09-26 12:00 1x)"], "None", "40 laps"),
    ]);

    const parsed = parseSchedulePdf([first, second]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].weeks.map((w) => w.weekNumber)).toEqual([1, 2]);
  });

  it("drops header blocks that never reach a race week", () => {
    const pages = build(() => [
      heading("OVAL"),
      heading("R Class Series (OVAL)"),
      seriesLine("Orphan Series - 2026 Season 4"),
      seriesLine("Rookie (1.0) --> Pro/WC (4.0)"),
    ]);
    expect(parseSchedulePdf(pages)).toEqual([]);
  });
});
