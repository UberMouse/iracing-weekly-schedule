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
