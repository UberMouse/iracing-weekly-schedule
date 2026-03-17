import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import SeriesCard from "../SeriesCard";
import type { Series } from "../../types";

const mockSeries: Series = {
  seriesId: 1,
  seriesName: "NASCAR Cup Series",
  category: "oval",
  licenseClass: "A",
  setupType: "fixed",
  isMulticlass: false,
  totalWeeks: 1,
  raceTimeMinutes: null,
  isRepeating: true,
  cars: [{ carId: 1, carName: "Next Gen Chevrolet" }],
  scheduleWeeks: [{ weekNumber: 1, seasonWeek: 1, trackId: 100, trackName: "Daytona International Speedway", rainChance: 0, rainEnabled: false }],
};

describe("SeriesCard", () => {
  it("renders series name and metadata", () => {
    render(<SeriesCard series={mockSeries} isFavorite={false} onToggleFavorite={() => {}} />);
    expect(screen.getByText("NASCAR Cup Series")).toBeInTheDocument();
    expect(screen.getByText(/oval/i)).toBeInTheDocument();
    expect(screen.getByText(/fixed/i)).toBeInTheDocument();
  });

  it("calls onToggleFavorite when star is clicked", async () => {
    const handler = vi.fn();
    render(<SeriesCard series={mockSeries} isFavorite={false} onToggleFavorite={handler} />);
    await userEvent.click(screen.getByRole("button", { name: /favorite/i }));
    expect(handler).toHaveBeenCalledOnce();
  });

  it("shows filled star when favorited", () => {
    render(<SeriesCard series={mockSeries} isFavorite={true} onToggleFavorite={() => {}} />);
    expect(screen.getByRole("button", { name: /favorite/i })).toHaveAttribute("data-favorited", "true");
  });

  it("shows track name in header and car names per week for car-rotation series", () => {
    const carRotationSeries: Series = {
      seriesId: 2,
      seriesName: "Ring Meister",
      category: "sports_car",
      licenseClass: "D",
      setupType: "open",
      isMulticlass: false,
      totalWeeks: 2,
      raceTimeMinutes: null,
      isRepeating: true,
      cars: [
        { carId: 1, carName: "BMW M4 GT4" },
        { carId: 2, carName: "Porsche Cayman" },
      ],
      scheduleWeeks: [
        {
          weekNumber: 1, seasonWeek: 1, trackId: 100,
          trackName: "Nürburgring Combined", rainChance: 0, rainEnabled: false,
          cars: [{ carId: 1, carName: "BMW M4 GT4" }],
        },
        {
          weekNumber: 2, seasonWeek: 2, trackId: 100,
          trackName: "Nürburgring Combined", rainChance: 0, rainEnabled: false,
          cars: [{ carId: 2, carName: "Porsche Cayman" }],
        },
      ],
    };

    render(<SeriesCard series={carRotationSeries} isFavorite={false} onToggleFavorite={() => {}} />);
    // Track name shown in header area (not per-week)
    expect(screen.getByText("Nürburgring Combined")).toBeInTheDocument();
    // Per-week car names shown in week rows
    expect(screen.getByText("BMW M4 GT4")).toBeInTheDocument();
    expect(screen.getByText("Porsche Cayman")).toBeInTheDocument();
  });

  it("shows car names in header and track names per week for normal series", () => {
    const normalSeries: Series = {
      seriesId: 3,
      seriesName: "GT3 Sprint",
      category: "sports_car",
      licenseClass: "C",
      setupType: "open",
      isMulticlass: false,
      totalWeeks: 2,
      raceTimeMinutes: null,
      isRepeating: true,
      cars: [{ carId: 1, carName: "BMW M4 GT3" }],
      scheduleWeeks: [
        { weekNumber: 1, seasonWeek: 1, trackId: 100, trackName: "Spa", rainChance: 0, rainEnabled: false },
        { weekNumber: 2, seasonWeek: 2, trackId: 200, trackName: "Monza", rainChance: 0, rainEnabled: false },
      ],
    };

    render(<SeriesCard series={normalSeries} isFavorite={false} onToggleFavorite={() => {}} />);
    // Car name in header
    expect(screen.getByText("BMW M4 GT3")).toBeInTheDocument();
    // Track names per week
    expect(screen.getByText("Spa")).toBeInTheDocument();
    expect(screen.getByText("Monza")).toBeInTheDocument();
  });
});
