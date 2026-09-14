import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, vi } from "vitest";
import AddSeriesModal from "../ScheduleBuilder/AddSeriesModal";
import { useAppStore } from "../../store/useAppStore";
import type { Series } from "../../types";

const carRotationSeries: Series = {
  seriesId: 100,
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
      weekNumber: 1, seasonWeek: 1, trackId: 300,
      trackName: "Nürburgring Combined", rainChance: 0, rainEnabled: false,
      cars: [{ carId: 1, carName: "BMW M4 GT4" }],
    },
    {
      weekNumber: 2, seasonWeek: 2, trackId: 300,
      trackName: "Nürburgring Combined", rainChance: 0, rainEnabled: false,
      cars: [{ carId: 2, carName: "Porsche Cayman" }],
    },
  ],
};

const normalSeries: Series = {
  seriesId: 200,
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
    { weekNumber: 1, seasonWeek: 1, trackId: 400, trackName: "Spa", rainChance: 0, rainEnabled: false },
    { weekNumber: 2, seasonWeek: 2, trackId: 500, trackName: "Monza", rainChance: 0, rainEnabled: false },
  ],
};

const allSeries = [carRotationSeries, normalSeries];

function renderModal(week: number) {
  return render(
    <AddSeriesModal week={week} series={allSeries} weeklyPicks={{}} weeklyMaybes={{}} onClose={() => {}} />,
  );
}

describe("AddSeriesModal", () => {
  beforeEach(() => {
    useAppStore.setState({
      favorites: [],
      modalShowAllSeries: true,
      currentSeasonId: "2026-S2",
      seasonPicks: {},
      seasonCache: {},
    });
  });

  it("shows car name instead of track for car-rotation series", () => {
    renderModal(1);
    expect(screen.getByText("BMW M4 GT4")).toBeInTheDocument();
    expect(screen.queryByText("Nürburgring Combined")).not.toBeInTheDocument();
  });

  it("shows track name for normal series", () => {
    renderModal(1);
    expect(screen.getByText("Spa")).toBeInTheDocument();
  });

  it("shows correct car for week 2 of car-rotation series", () => {
    renderModal(2);
    expect(screen.getByText("Porsche Cayman")).toBeInTheDocument();
    expect(screen.queryByText("BMW M4 GT4")).not.toBeInTheDocument();
  });

  it("never renders a button nested inside another button", () => {
    const { container } = renderModal(1);
    expect(container.querySelectorAll("button button").length).toBe(0);
  });

  it("clicking the main row button adds a single-week pick and closes the modal", async () => {
    const onClose = vi.fn();
    render(
      <AddSeriesModal week={1} series={allSeries} weeklyPicks={{}} weeklyMaybes={{}} onClose={onClose} />,
    );

    await userEvent.click(screen.getByText("GT3 Sprint"));

    expect(onClose).toHaveBeenCalledTimes(1);
    const picks = useAppStore.getState().seasonPicks["2026-S2"];
    expect(picks?.weeklyPicks[1]).toEqual([normalSeries.seriesId]);
    expect(picks?.weeklyPicks[2] ?? []).not.toContain(normalSeries.seriesId);
  });

  it("clicking 'All weeks' adds the series to every week it races and closes, without a single-week add", async () => {
    useAppStore.setState({
      currentSeasonId: "test-season",
      seasonCache: {
        "test-season": {
          seasonId: "test-season",
          seasonName: "Test Season",
          seasonStartDate: "2026-03-10T00:00:00.000Z",
          series: allSeries,
        },
      },
    });
    const onClose = vi.fn();
    render(
      <AddSeriesModal week={1} series={allSeries} weeklyPicks={{}} weeklyMaybes={{}} onClose={onClose} />,
    );

    const row = screen.getByText("GT3 Sprint").closest("button")!.parentElement!;
    await userEvent.click(within(row).getByRole("button", { name: "All weeks" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    const picks = useAppStore.getState().seasonPicks["test-season"];
    expect(picks?.weeklyPicks[1]).toEqual([normalSeries.seriesId]);
    expect(picks?.weeklyPicks[2]).toEqual([normalSeries.seriesId]);
  });
});
