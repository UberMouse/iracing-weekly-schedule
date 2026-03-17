import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Series } from "../../types";

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

// Mock the store
const mockStore: {
  weeklyPicks: Record<number, number[]>;
  series: Series[];
} = {
  weeklyPicks: {},
  series: mockSeries,
};

vi.mock("../../store/useAppStore", () => ({
  useAppStore: () => mockStore,
}));

// Must import after mock setup
import SeasonCreditsTracker from "../ScheduleBuilder/SeasonCreditsTracker";

function pickSeriesForWeeks(seriesId: number, weeks: number[]) {
  for (const week of weeks) {
    if (!mockStore.weeklyPicks[week]) mockStore.weeklyPicks[week] = [];
    if (!mockStore.weeklyPicks[week].includes(seriesId)) {
      mockStore.weeklyPicks[week].push(seriesId);
    }
  }
}

describe("SeasonCreditsTracker", () => {
  beforeEach(() => {
    mockStore.weeklyPicks = {};
    mockStore.series = mockSeries;
  });

  it("shows $0 / $10 with no picks", () => {
    render(<SeasonCreditsTracker />);
    expect(screen.getByText("$0 / $10")).toBeInTheDocument();
  });

  it("R/D/C series with 8+ weeks = $4 credit", () => {
    pickSeriesForWeeks(1, [1, 2, 3, 4, 5, 6, 7, 8]);
    render(<SeasonCreditsTracker />);
    expect(screen.getByText("$4 / $10")).toBeInTheDocument();
  });

  it("B/A series with 8+ weeks = $6 credit", () => {
    pickSeriesForWeeks(4, [1, 2, 3, 4, 5, 6, 7, 8]);
    render(<SeasonCreditsTracker />);
    expect(screen.getByText("$6 / $10")).toBeInTheDocument();
  });

  it("caps at $10 (e.g., 3 R/D/C = $12 uncapped, $10 displayed)", () => {
    // 3 R/D/C series each with 8 weeks = $12 uncapped
    pickSeriesForWeeks(1, [1, 2, 3, 4, 5, 6, 7, 8]);
    pickSeriesForWeeks(2, [1, 2, 3, 4, 5, 6, 7, 8]);
    pickSeriesForWeeks(3, [1, 2, 3, 4, 5, 6, 7, 8]);
    render(<SeasonCreditsTracker />);
    expect(screen.getByText("$10 / $10")).toBeInTheDocument();
  });

  it("series with totalWeeks > 12 are excluded", () => {
    // Series 6 has totalWeeks: 24
    pickSeriesForWeeks(6, [1, 2, 3, 4, 5, 6, 7, 8]);
    render(<SeasonCreditsTracker />);
    expect(screen.getByText("$0 / $10")).toBeInTheDocument();
  });

  it("series with <8 weeks shows as in-progress in expanded view", async () => {
    pickSeriesForWeeks(1, [1, 2, 3]);
    render(<SeasonCreditsTracker />);

    await userEvent.click(screen.getByRole("button", { name: /toggle season credits/i }));
    expect(screen.getByText("Rookie Oval")).toBeInTheDocument();
    expect(screen.getByText("3/8")).toBeInTheDocument();
  });

  it("expand/collapse toggle works", async () => {
    pickSeriesForWeeks(1, [1, 2, 3, 4, 5, 6, 7, 8]);
    render(<SeasonCreditsTracker />);

    // Initially collapsed — no details visible
    expect(screen.queryByText("Qualified")).not.toBeInTheDocument();

    // Expand
    await userEvent.click(screen.getByRole("button", { name: /toggle season credits/i }));
    expect(screen.getByText("Qualified")).toBeInTheDocument();
    expect(screen.getByText("Rookie Oval")).toBeInTheDocument();

    // Collapse
    await userEvent.click(screen.getByRole("button", { name: /toggle season credits/i }));
    expect(screen.queryByText("Qualified")).not.toBeInTheDocument();
  });

  it("shows qualified series with checkmark and credit value", async () => {
    pickSeriesForWeeks(5, [1, 2, 3, 4, 5, 6, 7, 8]);
    render(<SeasonCreditsTracker />);

    await userEvent.click(screen.getByRole("button", { name: /toggle season credits/i }));
    expect(screen.getByText("A Class Oval")).toBeInTheDocument();
    expect(screen.getByText("$6")).toBeInTheDocument();
    expect(screen.getByText("\u2713")).toBeInTheDocument(); // checkmark
  });

  it("combines qualified and in-progress series correctly", async () => {
    pickSeriesForWeeks(1, [1, 2, 3, 4, 5, 6, 7, 8]); // qualified, $4
    pickSeriesForWeeks(4, [1, 2, 3, 4, 5]); // in progress

    render(<SeasonCreditsTracker />);
    expect(screen.getByText("$4 / $10")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /toggle season credits/i }));
    expect(screen.getByText("Qualified")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Rookie Oval")).toBeInTheDocument();
    expect(screen.getByText("B Class Formula")).toBeInTheDocument();
    expect(screen.getByText("5/8")).toBeInTheDocument();
  });
});
