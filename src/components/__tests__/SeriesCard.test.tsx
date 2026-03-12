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
  cars: [{ carId: 1, carName: "Next Gen Chevrolet" }],
  scheduleWeeks: [{ weekNumber: 1, trackName: "Daytona International Speedway" }],
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
});
