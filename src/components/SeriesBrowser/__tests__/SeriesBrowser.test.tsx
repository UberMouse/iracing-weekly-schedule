import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";
import SeriesBrowser from "../SeriesBrowser";
import { useAppStore } from "../../../store/useAppStore";
import type { Category, Series } from "../../../types";

const SEASON_ID = "2026-S2";

function makeSeries(
  seriesId: number,
  name: string,
  licenseClass: "R" | "D" | "C" | "B" | "A",
  category: Category = "oval",
): Series {
  return {
    seriesId,
    seriesName: name,
    category,
    licenseClass,
    setupType: "fixed",
    isMulticlass: false,
    totalWeeks: 12,
    raceTimeMinutes: null,
    isRepeating: true,
    cars: [{ carId: 1, carName: "Test Car" }],
    scheduleWeeks: [],
  };
}

const defaultSeries: Series[] = [
  makeSeries(1, "Test Oval", "D", "oval"),
  makeSeries(2, "Test Road", "C", "sports_car"),
];

function seedSeries(series: Series[]) {
  useAppStore.setState({
    status: "ready",
    currentSeasonId: SEASON_ID,
    viewingSeasonId: SEASON_ID,
    availableSeasons: [{ id: SEASON_ID, name: "2026 Season 2", startDate: "2026-03-17T00:00:00.000Z" }],
    seasonCache: {
      [SEASON_ID]: {
        seasonId: SEASON_ID,
        seasonName: "2026 Season 2",
        seasonStartDate: "2026-03-17T00:00:00.000Z",
        series,
      },
    },
  });
}

describe("SeriesBrowser", () => {
  beforeEach(() => {
    useAppStore.setState({
      favorites: [],
      filters: {
        categories: ["oval", "dirt_oval", "dirt_road", "sports_car", "formula"],
        licenseClasses: ["R", "D", "C", "B", "A"],
        setupType: null,
        searchText: "",
        favoritesOnly: false,
      },
    });
    seedSeries(defaultSeries);
  });

  it("renders series from the current season", () => {
    render(<SeriesBrowser />);
    expect(screen.getByText(defaultSeries[0].seriesName)).toBeInTheDocument();
  });

  it("filters by search text", async () => {
    render(<SeriesBrowser />);
    const searchInput = screen.getByPlaceholderText(/search/i);
    await userEvent.type(searchInput, "ZZZZNONEXISTENT");
    expect(screen.queryByText(defaultSeries[0].seriesName)).not.toBeInTheDocument();
  });

  it("sorts series by license class, then category, then alphabetically", () => {
    seedSeries([
      makeSeries(10, "Zebra Series", "B", "formula"),
      makeSeries(11, "Alpha Series", "D", "oval"),
      makeSeries(12, "Omega Series", "R", "sports_car"),
      makeSeries(13, "Beta Series", "D", "sports_car"),
      makeSeries(14, "Gamma Series", "A", "dirt_road"),
      makeSeries(15, "Delta Series", "B", "oval"),
    ]);

    render(<SeriesBrowser />);
    const displayed = screen.getAllByTestId("series-card-name").map((el) => el.textContent);

    expect(displayed).toEqual([
      "Omega Series", // R, sports_car
      "Beta Series", // D, sports_car — sports_car before oval
      "Alpha Series", // D, oval
      "Delta Series", // B, oval — oval before formula
      "Zebra Series", // B, formula
      "Gamma Series", // A, dirt_road
    ]);
  });

  it("filters by category", async () => {
    render(<SeriesBrowser />);
    const ovalButton = screen.getByRole("button", { name: /^Oval$/i });
    // Clicking deactivates oval (all start active)
    await userEvent.click(ovalButton);
    const ovalSeries = defaultSeries.find((s) => s.category === "oval");
    if (ovalSeries) {
      expect(screen.queryByText(ovalSeries.seriesName)).not.toBeInTheDocument();
    }
  });
});
