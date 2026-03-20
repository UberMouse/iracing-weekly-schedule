import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import WeekRow from "../ScheduleBuilder/WeekRow";
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

describe("WeekRow", () => {
  beforeEach(() => {
    useAppStore.setState({
      series: [carRotationSeries, normalSeries],
      weeklyPicks: {},
      weeklyMaybes: {},
      favorites: [],
    });
  });

  it("shows car name instead of track for car-rotation series", () => {
    useAppStore.setState({ weeklyPicks: { 1: [carRotationSeries.seriesId] } });
    render(<WeekRow week={1} isCurrentWeek={false} />);
    expect(screen.getByText("BMW M4 GT4")).toBeInTheDocument();
    expect(screen.queryByText("Nürburgring Combined")).not.toBeInTheDocument();
  });

  it("shows track name for normal series", () => {
    useAppStore.setState({ weeklyPicks: { 1: [normalSeries.seriesId] } });
    render(<WeekRow week={1} isCurrentWeek={false} />);
    expect(screen.getByText("Spa")).toBeInTheDocument();
  });

  it("shows correct car per week for car-rotation series", () => {
    useAppStore.setState({ weeklyPicks: { 2: [carRotationSeries.seriesId] } });
    render(<WeekRow week={2} isCurrentWeek={false} />);
    expect(screen.getByText("Porsche Cayman")).toBeInTheDocument();
    expect(screen.queryByText("BMW M4 GT4")).not.toBeInTheDocument();
  });
});
