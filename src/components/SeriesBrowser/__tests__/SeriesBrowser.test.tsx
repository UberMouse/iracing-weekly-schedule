import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";
import SeriesBrowser from "../SeriesBrowser";
import { useAppStore } from "../../../store/useAppStore";
import type { Category } from "../../../types";

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
  });

  it("renders series from the store", () => {
    render(<SeriesBrowser />);
    const series = useAppStore.getState().series;
    // At least one series name should appear
    expect(screen.getByText(series[0].seriesName)).toBeInTheDocument();
  });

  it("filters by search text", async () => {
    render(<SeriesBrowser />);
    const searchInput = screen.getByPlaceholderText(/search/i);
    await userEvent.type(searchInput, "ZZZZNONEXISTENT");
    // No series should match
    const series = useAppStore.getState().series;
    expect(screen.queryByText(series[0].seriesName)).not.toBeInTheDocument();
  });

  it("sorts series by license class, then category, then alphabetically", () => {
    const makeSeries = (name: string, licenseClass: string, category: Category = "oval") => ({
      seriesId: Math.random(),
      seriesName: name,
      category,
      licenseClass: licenseClass as "R" | "D" | "C" | "B" | "A",
      setupType: "fixed" as const,
      isMulticlass: false,
      totalWeeks: 12,
      raceTimeMinutes: null,
      isRepeating: true,
      cars: [{ carId: 1, carName: "Test Car" }],
      scheduleWeeks: [],
    });

    useAppStore.setState({
      series: [
        makeSeries("Zebra Series", "B", "formula"),
        makeSeries("Alpha Series", "D", "oval"),
        makeSeries("Omega Series", "R", "sports_car"),
        makeSeries("Beta Series", "D", "sports_car"),
        makeSeries("Gamma Series", "A", "dirt_road"),
        makeSeries("Delta Series", "B", "oval"),
      ],
    });

    render(<SeriesBrowser />);
    const displayed = screen.getAllByTestId("series-card-name").map((el) => el.textContent);

    expect(displayed).toEqual([
      "Omega Series",   // R, sports_car
      "Beta Series",    // D, sports_car — sports_car before oval
      "Alpha Series",   // D, oval
      "Delta Series",   // B, oval — oval before formula
      "Zebra Series",   // B, formula
      "Gamma Series",   // A, dirt_road
    ]);
  });

  it("filters by category", async () => {
    render(<SeriesBrowser />);
    const ovalButton = screen.getByRole("button", { name: /^Oval$/i });
    // Clicking deactivates oval (all start active)
    await userEvent.click(ovalButton);
    // Oval series should be hidden
    const series = useAppStore.getState().series;
    const ovalSeries = series.find((s) => s.category === "oval");
    if (ovalSeries) {
      expect(screen.queryByText(ovalSeries.seriesName)).not.toBeInTheDocument();
    }
  });
});
