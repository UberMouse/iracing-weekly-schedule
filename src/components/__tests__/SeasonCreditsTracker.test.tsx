import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import type { Series } from "../../types";
import SeasonCreditsTracker from "../ScheduleBuilder/SeasonCreditsTracker";

function makeSeries(overrides: Partial<Series> & Pick<Series, "seriesId" | "seriesName" | "licenseClass">): Series {
  return {
    category: "oval",
    setupType: "fixed",
    isMulticlass: false,
    totalWeeks: 12,
    raceTimeMinutes: null,
    isRepeating: true,
    cars: [{ carId: 1, carName: "Test Car" }],
    scheduleWeeks: [],
    ...overrides,
  };
}

const mockSeries: Series[] = [
  makeSeries({ seriesId: 1, seriesName: "Rookie Oval", licenseClass: "R" }),
  makeSeries({ seriesId: 2, seriesName: "D Class Road", licenseClass: "D", category: "sports_car" }),
  makeSeries({ seriesId: 3, seriesName: "C Class Dirt", licenseClass: "C", category: "dirt_oval" }),
  makeSeries({ seriesId: 4, seriesName: "B Class Formula", licenseClass: "B", category: "formula" }),
  makeSeries({ seriesId: 5, seriesName: "A Class Oval", licenseClass: "A" }),
  makeSeries({ seriesId: 6, seriesName: "Multi-Season Series", licenseClass: "D", totalWeeks: 24 }),
];

/** Build a weeklyPicks map: each [seriesId, weeks] entry adds that series to those weeks. */
function picks(...entries: [number, number[]][]): Record<number, number[]> {
  const wp: Record<number, number[]> = {};
  for (const [seriesId, weeks] of entries) {
    for (const week of weeks) {
      (wp[week] ??= []).push(seriesId);
    }
  }
  return wp;
}

const EIGHT_WEEKS = [1, 2, 3, 4, 5, 6, 7, 8];

function renderTracker(weeklyPicks: Record<number, number[]>) {
  return render(<SeasonCreditsTracker weeklyPicks={weeklyPicks} series={mockSeries} />);
}

describe("SeasonCreditsTracker", () => {
  it("shows $0 / $10 with no picks", () => {
    renderTracker({});
    expect(screen.getByText("$0 / $10")).toBeInTheDocument();
  });

  it("R/D/C series with 8+ weeks = $4 credit", () => {
    renderTracker(picks([1, EIGHT_WEEKS]));
    expect(screen.getByText("$4 / $10")).toBeInTheDocument();
  });

  it("B/A series with 8+ weeks = $6 credit", () => {
    renderTracker(picks([4, EIGHT_WEEKS]));
    expect(screen.getByText("$6 / $10")).toBeInTheDocument();
  });

  it("caps at $10 (e.g., 3 R/D/C = $12 uncapped, $10 displayed)", () => {
    renderTracker(picks([1, EIGHT_WEEKS], [2, EIGHT_WEEKS], [3, EIGHT_WEEKS]));
    expect(screen.getByText("$10 / $10")).toBeInTheDocument();
  });

  it("series with totalWeeks > 12 are excluded", () => {
    renderTracker(picks([6, EIGHT_WEEKS]));
    expect(screen.getByText("$0 / $10")).toBeInTheDocument();
  });

  it("series with <8 weeks shows as in-progress in expanded view", async () => {
    renderTracker(picks([1, [1, 2, 3]]));
    await userEvent.click(screen.getByRole("button", { name: /toggle season credits/i }));
    expect(screen.getByText("Rookie Oval")).toBeInTheDocument();
    expect(screen.getByText("3/8")).toBeInTheDocument();
  });

  it("expand/collapse toggle works", async () => {
    renderTracker(picks([1, EIGHT_WEEKS]));

    expect(screen.queryByText("Qualified")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /toggle season credits/i }));
    expect(screen.getByText("Qualified")).toBeInTheDocument();
    expect(screen.getByText("Rookie Oval")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /toggle season credits/i }));
    expect(screen.queryByText("Qualified")).not.toBeInTheDocument();
  });

  it("shows qualified series with checkmark and credit value", async () => {
    renderTracker(picks([5, EIGHT_WEEKS]));

    await userEvent.click(screen.getByRole("button", { name: /toggle season credits/i }));
    expect(screen.getByText("A Class Oval")).toBeInTheDocument();
    expect(screen.getByText("$6")).toBeInTheDocument();
    expect(screen.getByText("✓")).toBeInTheDocument(); // checkmark
  });

  it("combines qualified and in-progress series correctly", async () => {
    renderTracker(picks([1, EIGHT_WEEKS], [4, [1, 2, 3, 4, 5]]));
    expect(screen.getByText("$4 / $10")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /toggle season credits/i }));
    expect(screen.getByText("Qualified")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Rookie Oval")).toBeInTheDocument();
    expect(screen.getByText("B Class Formula")).toBeInTheDocument();
    expect(screen.getByText("5/8")).toBeInTheDocument();
  });
});
