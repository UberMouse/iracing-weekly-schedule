import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";
import SeriesBrowser from "../SeriesBrowser";
import { useAppStore } from "../../../store/useAppStore";

describe("SeriesBrowser", () => {
  beforeEach(() => {
    useAppStore.setState({
      favorites: [],
      filters: {
        categories: [],
        licenseClasses: [],
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

  it("sorts series by license class then alphabetically", () => {
    const makeSeries = (name: string, licenseClass: string) => ({
      seriesId: Math.random(),
      seriesName: name,
      category: "oval" as const,
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
        makeSeries("Zebra Series", "B"),
        makeSeries("Alpha Series", "D"),
        makeSeries("Omega Series", "R"),
        makeSeries("Beta Series", "D"),
        makeSeries("Gamma Series", "A"),
        makeSeries("Delta Series", "B"),
      ],
    });

    render(<SeriesBrowser />);
    const displayed = screen.getAllByTestId("series-card-name").map((el) => el.textContent);

    expect(displayed).toEqual([
      "Omega Series",   // R (lowest license)
      "Alpha Series",   // D — alphabetically before Beta
      "Beta Series",    // D
      "Delta Series",   // B — alphabetically before Zebra
      "Zebra Series",   // B
      "Gamma Series",   // A (highest license)
    ]);
  });

  it("filters by category", async () => {
    render(<SeriesBrowser />);
    const ovalButton = screen.getByRole("button", { name: /^Oval$/i });
    await userEvent.click(ovalButton);
    // Only oval series should be visible
    const series = useAppStore.getState().series;
    const nonOval = series.find((s) => s.category !== "oval");
    if (nonOval) {
      expect(screen.queryByText(nonOval.seriesName)).not.toBeInTheDocument();
    }
  });
});
