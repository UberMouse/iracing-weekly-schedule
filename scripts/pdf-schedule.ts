import type { Category, LicenseClass } from "../src/types";

/**
 * Parser for iRacing's preliminary season schedule PDF (published ~a week
 * before the season opens, while the Data API still serves the old season).
 *
 * The document is mechanically generated and its geometry is exact: every
 * race-week row places its four columns at the same x offsets on all pages,
 * and headings are set in a larger face than the schedule tables. That lets us
 * segment purely on coordinates rather than guessing from wrapped text.
 */

/** A single positioned text run, as produced by pdf.js `getTextContent()`. */
export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  /** Glyph height; distinguishes heading runs (>= 12) from table runs (9). */
  height: number;
  fontName: string;
}

export interface PdfPage {
  pageNumber: number;
  items: PdfTextItem[];
}

export interface PrelimWeek {
  weekNumber: number;
  /** Week-start date as printed, `YYYY-MM-DD`. */
  startDate: string;
  /**
   * Column 2 lines, in order: the track name (possibly wrapped over several
   * lines), then for car-rotation series the cars running that week, then the
   * `(YYYY-MM-DD HH:MM 1x)` race-time line. Splitting track from cars needs the
   * track catalogue, so it is deferred to the transform.
   */
  detailLines: string[];
  /** Column 3, e.g. "72F/22C, Rain chance 29%, Grid by class, Rolling start, ...". */
  conditions: string;
  /** Column 4, e.g. "40 mins" or "35 laps". */
  raceLength: string;
}

export interface PrelimSeries {
  seriesName: string;
  /**
   * Null for sections with no iRacing category, notably the trailing
   * "UNRANKED" one. The API still files those series under a real category, so
   * the transform inherits it from the matched series instead of guessing here.
   */
  category: Category | null;
  licenseClass: LicenseClass;
  /** Car-list lines from the series header block (wrapped; join before use). */
  carLines: string[];
  /** True when the header says "See race week for cars in use that week." */
  isCarRotation: boolean;
  /** The "Races every 30 minutes at :15 and :45" line, if present. */
  racesDescription: string;
  weeks: PrelimWeek[];
}

/** Section headings that switch the active category. */
const CATEGORY_HEADINGS: Record<string, Category> = {
  OVAL: "oval",
  "SPORTS CAR": "sports_car",
  "FORMULA CAR": "formula",
  "DIRT OVAL": "dirt_oval",
  "DIRT ROAD": "dirt_road",
};

/** e.g. "R Class Series (OVAL)" / "B Class Series (SPORTS CAR)". */
const LICENSE_HEADING_RE = /^([RDCBA]) Class Series \((.+)\)$/;
/** e.g. "Week 1 (2026-09-15)". */
const WEEK_RE = /^Week (\d+) \((\d{4}-\d{2}-\d{2})\)$/;
/** e.g. "Rookie (1.0) --> Pro/WC (4.0)" / "Class C (4.0) --> Pro/WC (4.0), Team racing". */
const LICENSE_LINE_RE = /^(Rookie|Class [A-D]) \([\d.]+\)/;
const CAR_ROTATION_RE = /^See race week for cars/i;

/** Heading runs sit at x=56; series header blocks at x=58. */
const SECTION_HEADING_MAX_X = 57;
/** Column boundaries for race-week rows (runs land on exactly 58/158/358/518). */
const COL_WEEK_MAX_X = 150;
const COL_DETAIL_MAX_X = 350;
const COL_CONDITIONS_MAX_X = 510;
/** Heading face vs. schedule-table face. */
const HEADING_MIN_HEIGHT = 12;
/**
 * Page-number footers are set at heading size, so size alone cannot tell them
 * apart from a series title. They are the only text this low on the page.
 */
const PAGE_FOOTER_MAX_Y = 40;
/** Pages 1-5 are the table of contents, which repeats every series name. */
const FIRST_CONTENT_PAGE = 6;

/** Group a page's runs into visual lines (top-to-bottom, then left-to-right). */
function toLines(page: PdfPage): PdfTextItem[][] {
  const byBaseline = new Map<number, PdfTextItem[]>();
  for (const item of page.items) {
    if (!item.str.trim()) continue;
    const key = Math.round(item.y);
    const bucket = byBaseline.get(key);
    if (bucket) bucket.push(item);
    else byBaseline.set(key, [item]);
  }
  return [...byBaseline.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, runs]) => runs.sort((a, b) => a.x - b.x));
}

const joinRuns = (runs: PdfTextItem[]): string =>
  runs.map((r) => r.str).join(" ").replace(/\s+/g, " ").trim();

/**
 * Split a series header block into its parts. The block is:
 *   <series name>
 *   <car list, wrapped over 1..n lines>      (or the car-rotation notice)
 *   <license range line>                     <- anchor
 *   <"Races ..." line and other footnotes>
 * The license line is the only reliably-shaped entry, so we anchor on it.
 */
function buildSeries(
  block: string[],
  category: Category | null,
  licenseClass: LicenseClass,
): PrelimSeries {
  const [seriesName, ...rest] = block;
  const licenseIndex = rest.findIndex((line) => LICENSE_LINE_RE.test(line));
  const beforeLicense = licenseIndex >= 0 ? rest.slice(0, licenseIndex) : [];
  const afterLicense = licenseIndex >= 0 ? rest.slice(licenseIndex + 1) : rest;

  return {
    seriesName,
    category,
    licenseClass,
    carLines: beforeLicense.filter((line) => !CAR_ROTATION_RE.test(line)),
    isCarRotation: beforeLicense.some((line) => CAR_ROTATION_RE.test(line)),
    racesDescription: afterLicense.find((line) => line.startsWith("Races ")) ?? "",
    weeks: [],
  };
}

/**
 * Parse the positioned text of a season schedule PDF into per-series schedules.
 * Track/car/series names are returned verbatim; resolving them to iRacing ids
 * is the transform's job.
 */
export function parseSchedulePdf(pages: PdfPage[]): PrelimSeries[] {
  const series: PrelimSeries[] = [];
  let category: Category | null = null;
  let sawCategoryHeading = false;
  let licenseClass: LicenseClass | null = null;
  let current: PrelimSeries | null = null;
  let currentWeek: PrelimWeek | null = null;
  let headerBlock: string[] = [];

  // Returns the series it opened (if any) so the caller can rebind `current`;
  // assigning from inside the closure would defeat control-flow narrowing.
  const flushHeader = (): PrelimSeries | null => {
    if (!headerBlock.length) return null;
    // A licence heading is required to place a series; an unrecognised category
    // (e.g. "UNRANKED") is not, and resolves during the transform.
    if (!sawCategoryHeading || !licenseClass) {
      headerBlock = [];
      return null;
    }
    const opened = buildSeries(headerBlock, category, licenseClass);
    series.push(opened);
    headerBlock = [];
    return opened;
  };

  for (const page of pages) {
    if (page.pageNumber < FIRST_CONTENT_PAGE) continue;

    for (const runs of toLines(page)) {
      const first = runs[0];
      if (!first) continue;

      if (first.y < PAGE_FOOTER_MAX_Y) continue; // page-number footer

      if (first.height >= HEADING_MIN_HEIGHT) {
        const text = joinRuns(runs);

        if (first.x <= SECTION_HEADING_MAX_X) {
          // Category or license-class section heading: ends the current series.
          flushHeader();
          current = null;
          currentWeek = null;

          // Licence headings name their own category ("B Class Series (OVAL)"),
          // so they are authoritative and re-assert it on every page.
          const asLicense = text.match(LICENSE_HEADING_RE);
          if (asLicense) {
            licenseClass = asLicense[1] as LicenseClass;
            category = CATEGORY_HEADINGS[asLicense[2]] ?? null;
            sawCategoryHeading = true;
            continue;
          }

          // Otherwise it is a top-level category heading. Unknown ones become
          // null rather than silently inheriting the previous section's.
          category = CATEGORY_HEADINGS[text] ?? null;
          licenseClass = null;
          sawCategoryHeading = true;
          continue;
        }

        // A series header block line. Consecutive lines accumulate until the
        // first race-week row, which is what closes the block.
        headerBlock.push(text);
        continue;
      }

      // A race-week row. Its four columns are fixed-position.
      current = flushHeader() ?? current;
      if (!current) continue;

      const weekCol = runs.filter((r) => r.x < COL_WEEK_MAX_X);
      const detailCol = runs.filter((r) => r.x >= COL_WEEK_MAX_X && r.x < COL_DETAIL_MAX_X);
      const conditionsCol = runs.filter(
        (r) => r.x >= COL_DETAIL_MAX_X && r.x < COL_CONDITIONS_MAX_X,
      );
      const lengthCol = runs.filter((r) => r.x >= COL_CONDITIONS_MAX_X);

      const weekMatch = weekCol.length ? joinRuns(weekCol).match(WEEK_RE) : null;
      if (weekMatch) {
        currentWeek = {
          weekNumber: Number(weekMatch[1]),
          startDate: weekMatch[2],
          detailLines: [],
          conditions: "",
          raceLength: "",
        };
        current.weeks.push(currentWeek);
      }
      if (!currentWeek) continue;

      if (detailCol.length) currentWeek.detailLines.push(joinRuns(detailCol));
      if (conditionsCol.length) {
        currentWeek.conditions = `${currentWeek.conditions} ${joinRuns(conditionsCol)}`.trim();
      }
      if (lengthCol.length) {
        currentWeek.raceLength = `${currentWeek.raceLength} ${joinRuns(lengthCol)}`.trim();
      }
    }
  }
  flushHeader();

  return series.filter((s) => s.weeks.length > 0);
}

/** Load a schedule PDF's positioned text using pdf.js. */
export async function loadPdfPages(data: Uint8Array): Promise<PdfPage[]> {
  // pdf.js ships ESM-only builds; the legacy build is the Node-friendly one.
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data, useSystemFonts: true }).promise;

  const pages: PdfPage[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push({
      pageNumber,
      items: content.items.flatMap((item) => {
        if (!("str" in item)) return [];
        return [{
          str: item.str,
          x: item.transform[4] as number,
          y: item.transform[5] as number,
          height: item.height,
          fontName: item.fontName,
        }];
      }),
    });
  }
  return pages;
}
